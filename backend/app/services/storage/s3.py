"""S3 object storage backend."""

from __future__ import annotations

import asyncio
import fnmatch
from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.services.storage.base import StorageBackend


class S3Storage(StorageBackend):
    """Store files in an S3-compatible bucket (AWS S3, MinIO, Aliyun OSS)."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: str = "",
        access_key: str = "",
        secret_key: str = "",
        region: str = "us-east-1",
        prefix: str = "",
    ) -> None:
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        kwargs: dict[str, Any] = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if access_key and secret_key:
            kwargs["aws_access_key_id"] = access_key
            kwargs["aws_secret_access_key"] = secret_key
        self._client = boto3.client("s3", **kwargs)

    def _full_key(self, key: str) -> str:
        if self._prefix:
            return f"{self._prefix}/{key}"
        return key

    # -- write / read ---------------------------------------------------

    async def write_file(self, key: str, data: bytes) -> str:
        full = self._full_key(key)

        def _put() -> None:
            self._client.put_object(Bucket=self._bucket, Key=full, Body=data)

        await asyncio.to_thread(_put)
        return self.resolve_uri(key)

    async def read_file(self, key: str) -> bytes:
        full = self._full_key(key)

        def _get() -> bytes:
            resp = self._client.get_object(Bucket=self._bucket, Key=full)
            return resp["Body"].read()

        return await asyncio.to_thread(_get)

    async def read_text(self, key: str, encoding: str = "utf-8") -> str:
        data = await self.read_file(key)
        return data.decode(encoding)

    async def read_lines(
        self, key: str, max_lines: int = 0, encoding: str = "utf-8"
    ) -> list[str]:
        text = await self.read_text(key, encoding)
        all_lines = text.splitlines()
        if max_lines > 0:
            return all_lines[:max_lines]
        return all_lines

    # -- delete / exists / size -----------------------------------------

    async def delete_file(self, key: str) -> bool:
        full = self._full_key(key)

        def _delete() -> bool:
            try:
                self._client.head_object(Bucket=self._bucket, Key=full)
            except ClientError:
                return False
            self._client.delete_object(Bucket=self._bucket, Key=full)
            return True

        return await asyncio.to_thread(_delete)

    async def exists(self, key: str) -> bool:
        full = self._full_key(key)

        def _exists() -> bool:
            try:
                self._client.head_object(Bucket=self._bucket, Key=full)
                return True
            except ClientError:
                return False

        return await asyncio.to_thread(_exists)

    async def file_size(self, key: str) -> int:
        full = self._full_key(key)

        def _size() -> int:
            resp = self._client.head_object(Bucket=self._bucket, Key=full)
            return int(resp["ContentLength"])

        return await asyncio.to_thread(_size)

    # -- listing --------------------------------------------------------

    async def list_files(
        self, prefix: str, patterns: list[str] | None = None
    ) -> list[str]:
        full_prefix = self._full_key(prefix)
        if not full_prefix.endswith("/"):
            full_prefix += "/"

        def _list() -> list[str]:
            results: list[str] = []
            paginator = self._client.get_paginator("list_objects_v2")
            for page in paginator.paginate(
                Bucket=self._bucket, Prefix=full_prefix
            ):
                for obj in page.get("Contents", []):
                    obj_key: str = obj["Key"]
                    if obj_key.endswith("/"):
                        continue
                    # Convert back to relative key (strip our prefix)
                    rel = obj_key[len(self._prefix) + 1:] if self._prefix else obj_key
                    # Apply pattern filter
                    if patterns:
                        name = rel.rsplit("/", 1)[-1]
                        if not any(fnmatch.fnmatch(name, p) for p in patterns):
                            continue
                    results.append(rel)
            return sorted(results)

        return await asyncio.to_thread(_list)

    # -- resolve / ensure / validate ------------------------------------

    def resolve_uri(self, key: str) -> str:
        full = self._full_key(key)
        return f"s3://{self._bucket}/{full}"

    async def ensure_prefix(self, prefix: str) -> None:
        # S3 has no real directories — no-op.
        pass

    async def validate(self) -> None:
        def _validate() -> None:
            try:
                self._client.head_bucket(Bucket=self._bucket)
            except ClientError as e:
                code = e.response["Error"]["Code"]
                if code == "404":
                    # Try to create the bucket (works with MinIO)
                    self._client.create_bucket(Bucket=self._bucket)
                else:
                    raise

        await asyncio.to_thread(_validate)
