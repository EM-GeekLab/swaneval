"""Model registry service: pull model metadata from HuggingFace / ModelScope."""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def fetch_hf_model_info(model_id: str, hf_token: str | None = None) -> dict[str, Any]:
    """Fetch model card metadata from HuggingFace Hub.

    Returns dict with: name, description, model_name, provider, source_model_id, tags.
    Raises ValueError if the model is not found or network fails.
    """
    import asyncio

    def _fetch() -> dict[str, Any]:
        from huggingface_hub import model_info

        kwargs: dict = {"repo_id": model_id}
        if hf_token:
            kwargs["token"] = hf_token
        info = model_info(**kwargs)

        tags = list(info.tags or []) if hasattr(info, "tags") else []
        pipeline_tag = getattr(info, "pipeline_tag", "") or ""
        description = ""
        if hasattr(info, "card_data") and info.card_data:
            cd = info.card_data
            description = getattr(cd, "model_summary", "") or ""

        return {
            "name": info.id.split("/")[-1] if "/" in info.id else info.id,
            "description": description[:500],
            "model_name": info.id,
            "provider": "huggingface",
            "source_model_id": info.id,
            "pipeline_tag": pipeline_tag,
            "tags": tags[:20],
            "downloads": getattr(info, "downloads", 0) or 0,
            "likes": getattr(info, "likes", 0) or 0,
        }

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        logger.error("Failed to fetch HF model info for %s: %s", model_id, e)
        raise ValueError(f"Failed to fetch model from HuggingFace: {e}") from e


async def fetch_ms_model_info(model_id: str, ms_token: str | None = None) -> dict[str, Any]:
    """Fetch model metadata from ModelScope.

    Returns dict with: name, description, model_name, provider, source_model_id.
    Raises ValueError if the model is not found.
    """
    import asyncio

    def _fetch() -> dict[str, Any]:
        from modelscope.hub.api import HubApi

        hub = HubApi()
        model = hub.get_model(model_id)

        name = model_id.split("/")[-1] if "/" in model_id else model_id
        description = ""
        if isinstance(model, dict):
            description = model.get("Description", model.get("description", ""))[:500]

        return {
            "name": name,
            "description": description,
            "model_name": model_id,
            "provider": "modelscope",
            "source_model_id": model_id,
            "pipeline_tag": "",
            "tags": [],
            "downloads": 0,
            "likes": 0,
        }

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as e:
        logger.error("Failed to fetch ModelScope model info for %s: %s", model_id, e)
        raise ValueError(f"Failed to fetch model from ModelScope: {e}") from e


async def search_hf_models(query: str, limit: int = 20, hf_token: str | None = None) -> list[dict]:
    """Search HuggingFace Hub for models matching a query."""
    import asyncio

    def _search() -> list[dict]:
        from huggingface_hub import HfApi

        api = HfApi(token=hf_token)
        models = api.list_models(
            search=query,
            sort="downloads",
            direction=-1,
            limit=limit,
        )
        results = []
        for m in models:
            results.append({
                "model_id": m.id,
                "downloads": getattr(m, "downloads", 0) or 0,
                "likes": getattr(m, "likes", 0) or 0,
                "pipeline_tag": getattr(m, "pipeline_tag", "") or "",
                "tags": list(m.tags or [])[:10] if hasattr(m, "tags") else [],
            })
        return results

    try:
        return await asyncio.to_thread(_search)
    except Exception as e:
        logger.warning("HF model search failed for query '%s': %s", query, e)
        return []
