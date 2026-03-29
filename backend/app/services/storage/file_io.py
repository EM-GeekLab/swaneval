"""Shared file I/O helpers for reading from storage or local filesystem.

All storage reads go through these functions to avoid duplication.
Removes TOCTOU anti-pattern: reads directly, handles errors.
"""

import asyncio
from pathlib import Path

from app.services.storage.base import StorageBackend
from app.services.storage.utils import uri_to_key


async def read_bytes(
    storage: StorageBackend, source_uri: str, *, key: str | None = None,
) -> bytes:
    """Read a file as bytes from storage or local filesystem.

    Raises FileNotFoundError if the file doesn't exist.
    """
    if key is None:
        key = uri_to_key(source_uri)
    if key is not None:
        try:
            return await storage.read_file(key)
        except Exception:
            pass
    p = Path(source_uri)
    try:
        return await asyncio.to_thread(p.read_bytes)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"File not found: {source_uri}") from exc


async def read_text(
    storage: StorageBackend, source_uri: str, *, key: str | None = None,
) -> str:
    """Read a file as UTF-8 text from storage or local filesystem.

    Raises FileNotFoundError if the file doesn't exist.
    """
    if key is None:
        key = uri_to_key(source_uri)
    if key is not None:
        try:
            return await storage.read_text(key)
        except Exception:
            pass
    p = Path(source_uri)
    try:
        return await asyncio.to_thread(p.read_text, encoding="utf-8")
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"File not found: {source_uri}") from exc
