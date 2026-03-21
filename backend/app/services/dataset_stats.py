"""Compute statistical summaries for dataset files."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os

import pandas as pd

from app.services.storage import StorageBackend
from app.services.storage.file_io import read_bytes, read_text

logger = logging.getLogger(__name__)


async def _load_dataframe(
    storage: StorageBackend, source_uri: str
) -> pd.DataFrame:
    """Load a dataset file into a pandas DataFrame."""
    ext = os.path.splitext(source_uri)[1].lower()

    if ext == ".parquet":
        import pyarrow.parquet as pq

        data = await read_bytes(storage, source_uri)
        table = pq.read_table(io.BytesIO(data))
        return table.to_pandas()

    if ext == ".csv":
        text = await read_text(storage, source_uri)
        return pd.read_csv(io.StringIO(text))

    if ext in (".xlsx", ".xls"):
        data = await read_bytes(storage, source_uri)
        return pd.read_excel(io.BytesIO(data))

    # JSON / JSONL (text-based)
    text = await read_text(storage, source_uri)

    if ext == ".json":
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return pd.json_normalize(parsed)
        return pd.json_normalize([parsed])

    # Default: JSONL
    rows = [
        json.loads(line)
        for line in text.splitlines()
        if line.strip()
    ]
    if not rows:
        return pd.DataFrame()
    return pd.json_normalize(rows)


def _infer_dtype(series: pd.Series) -> str:
    """Map pandas dtype to a simple type label."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "number"
    # Check first non-null value for list/dict
    sample = series.dropna().head(1)
    if not sample.empty:
        val = sample.iloc[0]
        if isinstance(val, list):
            return "array"
        if isinstance(val, dict):
            return "object"
    return "string"


def _column_stats(series: pd.Series) -> dict:
    """Compute stats for a single column."""
    total = len(series)
    null_count = int(series.isna().sum() + (series == "").sum())
    null_pct = round(null_count / total * 100, 2) if total else 0.0
    dtype = _infer_dtype(series)
    non_null = series.dropna()

    # Unique count
    try:
        unique_count = int(non_null.nunique())
    except TypeError:
        unique_count = 0

    # Text length stats (for string columns)
    avg_text_len: float | None = None
    min_text_len: int | None = None
    max_text_len: int | None = None
    if dtype == "string" and not non_null.empty:
        lengths = non_null.astype(str).str.len()
        avg_text_len = round(float(lengths.mean()), 1)
        min_text_len = int(lengths.min())
        max_text_len = int(lengths.max())

    # Top 5 most common values
    try:
        vc = non_null.value_counts().head(5)
        top_values = [
            {"value": str(v), "count": int(c)} for v, c in vc.items()
        ]
    except TypeError:
        top_values = []

    # Sample values
    sample_vals = [str(v) for v in non_null.head(3).tolist()]

    return {
        "name": series.name,
        "dtype": dtype,
        "null_count": null_count,
        "null_pct": null_pct,
        "unique_count": unique_count,
        "avg_text_len": avg_text_len,
        "min_text_len": min_text_len,
        "max_text_len": max_text_len,
        "top_values": top_values,
        "sample_values": sample_vals,
    }


async def compute_dataset_stats(
    storage: StorageBackend,
    source_uri: str,
    size_bytes: int = 0,
) -> dict:
    """Compute statistical summary for a dataset file.

    Returns dict with: row_count, column_count, size_bytes, columns (list of per-column stats).
    """
    df = await _load_dataframe(storage, source_uri)

    if df.empty:
        return {
            "row_count": 0,
            "column_count": 0,
            "size_bytes": size_bytes,
            "columns": [],
        }

    columns = await asyncio.to_thread(
        lambda: [_column_stats(df[col]) for col in df.columns]
    )

    return {
        "row_count": len(df),
        "column_count": len(df.columns),
        "size_bytes": size_bytes,
        "columns": columns,
    }
