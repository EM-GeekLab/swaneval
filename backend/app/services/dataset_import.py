"""
Dataset import service.

Downloads datasets from HuggingFace Hub or ModelScope and stores them locally.
"""

import json
import logging
import os
import re
import uuid

from app.services.storage import StorageBackend

logger = logging.getLogger(__name__)

_HF_URL_RE = re.compile(
    r"(?:https?://huggingface\.co/datasets/)?([^/]+/[^/?#]+)"
)
_MS_URL_RE = re.compile(
    r"(?:https?://(?:www\.)?modelscope\.cn/datasets/)?([^/]+/[^/?#]+)"
)


def _parse_dataset_id(source: str, raw_id: str) -> str:
    raw_id = raw_id.strip().rstrip("/")
    if source == "huggingface":
        m = _HF_URL_RE.match(raw_id)
        return m.group(1) if m else raw_id
    m = _MS_URL_RE.match(raw_id)
    return m.group(1) if m else raw_id


async def import_huggingface(
    dataset_id: str,
    subset: str,
    split: str,
    storage: StorageBackend,
    job_id: str | None = None,
    hf_token: str | None = None,
) -> tuple[str, int, int]:
    """
    Download a dataset from HuggingFace and store it.

    Strategies (in order):
    1. `datasets` library (handles subsets, splits, streaming)
    2. List repo files via API and download the best matching parquet/data file

    Returns: (storage_uri, row_count, size_bytes)
    """
    from app.config import settings
    from app.services.import_progress import update_job

    token = hf_token or settings.HF_TOKEN or None
    repo = _parse_dataset_id("huggingface", dataset_id)

    def prog(
        status: str = "downloading",
        phase: str = "",
        progress: float = 0.0,
    ) -> None:
        if job_id:
            update_job(
                job_id, status=status, phase=phase, progress=progress,
            )

    logger.info(
        "Importing HF dataset: %s (subset=%s, split=%s)", repo, subset, split,
    )
    prog("downloading", "正在连接 HuggingFace...", 0.05)

    # ── Strategy 1: datasets library ──────────────────────────────
    try:
        prog("downloading", "正在加载数据集...", 0.1)
        result = await _load_via_datasets_lib(
            repo, subset, split, storage, hf_token=token,
        )
        prog("done", "完成", 1.0)
        return result
    except ImportError:
        logger.info("datasets library not installed, trying direct download")
    except Exception as e:
        logger.warning("datasets lib failed for %s: %s", repo, e)

    # ── Strategy 2: list repo + download best file ────────────────
    # Run blocking HF API calls in a thread so asyncio loop stays free
    # for SSE progress streaming.
    import asyncio

    try:
        from huggingface_hub import hf_hub_download, list_repo_files

        prog("downloading", "正在查找数据文件...", 0.2)

        def _list_files():
            return list_repo_files(
                repo, repo_type="dataset", token=token,
            )

        all_files = await asyncio.to_thread(_list_files)

        target = _pick_best_file(all_files, subset, split)
        if not target:
            raise ValueError(
                f"在 '{repo}' 中未找到可用的数据文件"
            )

        prog("downloading", f"正在下载 {target}...", 0.4)

        def _download():
            return hf_hub_download(
                repo_id=repo,
                filename=target,
                repo_type="dataset",
                token=token,
            )

        local_path = await asyncio.to_thread(_download)
        prog("processing", "正在处理文件...", 0.8)
        result = await _store_downloaded_file(storage, local_path, repo)
        prog("done", "完成", 1.0)
        return result
    except Exception as e:
        prog("failed", str(e), 0.0)
        raise ValueError(
            f"导入 HuggingFace 数据集 '{repo}' 失败: {e}"
        ) from e


def _pick_best_file(
    files: list[str], subset: str, split: str,
) -> str | None:
    """
    Pick the best data file from the repo file list.
    Scores files by how well they match the desired subset/split.
    """
    exts = (".parquet", ".jsonl", ".json", ".csv")
    data_files = [f for f in files if any(f.endswith(e) for e in exts)]
    if not data_files:
        return None

    def score(path: str) -> int:
        """Higher = better match."""
        s = 0
        low = path.lower()
        # Prefer files matching the split name
        if split and split.lower() in low:
            s += 10
        # Prefer files matching the subset/config name
        if subset and subset.lower() in low:
            s += 5
        # Prefer parquet (most compact, fastest to load)
        if low.endswith(".parquet"):
            s += 3
        elif low.endswith(".jsonl"):
            s += 2
        # Prefer files in data/ directory (standard HF layout)
        if low.startswith("data/"):
            s += 1
        # Penalize README, metadata, etc.
        if "readme" in low or "license" in low:
            s -= 100
        return s

    data_files.sort(key=score, reverse=True)
    return data_files[0]


async def import_modelscope(
    dataset_id: str,
    subset: str,
    split: str,
    storage: StorageBackend,
    ms_token: str | None = None,
) -> tuple[str, int, int]:
    """Download a dataset from ModelScope and store it."""
    from app.config import settings

    clean_id = _parse_dataset_id("modelscope", dataset_id)
    logger.info(
        "Importing ModelScope dataset: %s (subset=%s, split=%s)",
        clean_id, subset, split,
    )

    try:
        from modelscope.msdatasets import MsDataset

        effective_token = ms_token or settings.MS_TOKEN or None
        if effective_token:
            os.environ["MODELSCOPE_API_TOKEN"] = effective_token

        subset_name = subset or None
        ds = MsDataset.load(
            clean_id, subset_name=subset_name, split=split,
        )

        file_id = uuid.uuid4()
        key = f"uploads/{file_id}.jsonl"
        lines = [json.dumps(item, ensure_ascii=False) for item in ds]
        content_bytes = "\n".join(lines).encode("utf-8")
        uri = await storage.write_file(key, content_bytes)
        return uri, len(lines), len(content_bytes)
    except ImportError as exc:
        raise ValueError(
            "需要安装 ModelScope SDK: pip install modelscope"
        ) from exc
    except Exception as e:
        raise ValueError(
            f"导入 ModelScope 数据集 '{clean_id}' 失败: {e}"
        ) from e


async def _store_downloaded_file(
    storage: StorageBackend, local_path: str, dataset_id: str,
) -> tuple[str, int, int]:
    """Store a downloaded file into storage and count rows."""
    ext = os.path.splitext(local_path)[1].lower()
    file_id = uuid.uuid4()
    key = f"uploads/{file_id}{ext}"

    with open(local_path, "rb") as f:
        content = f.read()
    uri = await storage.write_file(key, content)
    size_bytes = len(content)

    row_count = _count_rows(content, ext)
    return uri, row_count, size_bytes


def _count_rows(content: bytes, ext: str) -> int:
    """Count rows in downloaded data."""
    try:
        if ext == ".parquet":
            import io

            import pyarrow.parquet as pq
            return pq.ParquetFile(io.BytesIO(content)).metadata.num_rows
        text = content.decode("utf-8")
        if ext == ".json":
            data = json.loads(text)
            return len(data) if isinstance(data, list) else 1
        if ext == ".csv":
            return max(0, text.count("\n") - 1)
        # .jsonl or unknown
        return sum(1 for line in text.splitlines() if line.strip())
    except Exception:
        return 0


async def _load_via_datasets_lib(
    repo_id: str,
    subset: str,
    split: str,
    storage: StorageBackend,
    hf_token: str | None = None,
) -> tuple[str, int, int]:
    """Load via HuggingFace `datasets` library and convert to JSONL."""
    from datasets import load_dataset

    from app.config import settings

    kwargs: dict = {
        "path": repo_id,
        "split": split,
        "trust_remote_code": True,
    }
    if subset:
        kwargs["name"] = subset
    effective_token = hf_token or settings.HF_TOKEN
    if effective_token:
        kwargs["token"] = effective_token

    import asyncio

    def _blocking_load():
        d = load_dataset(**kwargs)
        lines = [json.dumps(dict(item), ensure_ascii=False, default=str) for item in d]
        return lines

    lines = await asyncio.to_thread(_blocking_load)
    file_id = uuid.uuid4()
    key = f"uploads/{file_id}.jsonl"
    content_bytes = "\n".join(lines).encode("utf-8")
    uri = await storage.write_file(key, content_bytes)
    return uri, len(lines), len(content_bytes)
