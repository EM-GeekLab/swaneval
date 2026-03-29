"""Local filesystem storage backend."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path, PurePosixPath

from app.services.storage.base import StorageBackend


def _to_posix(path: str) -> str:
    """Convert any OS path to forward-slash key (Windows compat)."""
    return path.replace("\\", "/")


class LocalFileStorage(StorageBackend):
    """Store files on the local filesystem under a root directory."""

    def __init__(self, root: str) -> None:
        self._root = Path(root).resolve()

    def _full_path(self, key: str) -> Path:
        # key always uses '/', convert to OS path
        return self._root / PurePosixPath(key)

    # -- write / read ---------------------------------------------------

    async def write_file(self, key: str, data: bytes) -> str:
        path = self._full_path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(_write)
        return str(path)

    async def read_file(self, key: str) -> bytes:
        return await asyncio.to_thread(self._full_path(key).read_bytes)

    async def read_text(self, key: str, encoding: str = "utf-8") -> str:
        return await asyncio.to_thread(
            self._full_path(key).read_text, encoding=encoding
        )

    async def read_lines(
        self, key: str, max_lines: int = 0, encoding: str = "utf-8"
    ) -> list[str]:
        def _read() -> list[str]:
            lines: list[str] = []
            with self._full_path(key).open(encoding=encoding) as f:
                for line in f:
                    stripped = line.rstrip("\n\r")
                    lines.append(stripped)
                    if max_lines > 0 and len(lines) >= max_lines:
                        break
            return lines

        return await asyncio.to_thread(_read)

    # -- delete / exists / size -----------------------------------------

    async def delete_file(self, key: str) -> bool:
        path = self._full_path(key)

        def _delete() -> bool:
            if not path.exists():
                return False
            try:
                os.remove(path)
                return True
            except OSError:
                return False

        return await asyncio.to_thread(_delete)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._full_path(key).exists)

    async def file_size(self, key: str) -> int:
        return await asyncio.to_thread(os.path.getsize, str(self._full_path(key)))

    # -- listing --------------------------------------------------------

    async def list_files(
        self, prefix: str, patterns: list[str] | None = None
    ) -> list[str]:
        def _list() -> list[str]:
            root = self._full_path(prefix)
            if not root.exists():
                return []
            results: list[str] = []
            if patterns:
                for pat in patterns:
                    results.extend(
                        _to_posix(str(p.relative_to(self._root)))
                        for p in root.rglob(pat) if p.is_file()
                    )
            else:
                results.extend(
                    _to_posix(str(p.relative_to(self._root)))
                    for p in root.rglob("*") if p.is_file()
                )
            return sorted(results)

        return await asyncio.to_thread(_list)

    # -- resolve / ensure / validate ------------------------------------

    def resolve_uri(self, key: str) -> str:
        return str(self._full_path(key))

    async def ensure_prefix(self, prefix: str) -> None:
        path = self._full_path(prefix)
        await asyncio.to_thread(os.makedirs, str(path), exist_ok=True)

    async def validate(self) -> None:
        def _validate() -> None:
            self._root.mkdir(parents=True, exist_ok=True)
            probe = self._root / ".storage_probe"
            probe.write_text("ok")
            probe.unlink()

        await asyncio.to_thread(_validate)
