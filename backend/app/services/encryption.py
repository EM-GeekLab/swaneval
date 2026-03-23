"""Encrypt/decrypt sensitive data using Fernet (AES)."""

import base64
import functools
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


@functools.lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    # Keep existing derivation for backward compatibility
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
