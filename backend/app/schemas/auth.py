import uuid

from pydantic import BaseModel

from app.models.user import UserRole


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _mask_token(token: str) -> str:
    """Mask a token for display: show first 4 and last 4 chars."""
    if not token:
        return ""
    if len(token) <= 10:
        return "••••••••"
    return token[:4] + "••••" + token[-4:]


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    email: str
    nickname: str = ""
    role: UserRole
    is_active: bool
    hf_token_set: bool = False
    hf_token_masked: str = ""
    ms_token_set: bool = False
    ms_token_masked: str = ""

    @classmethod
    def from_user(cls, user: "User") -> "UserResponse":  # noqa: F821
        return cls(
            id=user.id,
            username=user.username,
            email=user.email,
            nickname=user.nickname,
            role=user.role,
            is_active=user.is_active,
            hf_token_set=bool(user.hf_token),
            hf_token_masked=_mask_token(user.hf_token),
            ms_token_set=bool(user.ms_token),
            ms_token_masked=_mask_token(user.ms_token),
        )


class UpdateProfileRequest(BaseModel):
    nickname: str | None = None
    email: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class AdminUpdateUserRequest(BaseModel):
    nickname: str | None = None
    email: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserTokensResponse(BaseModel):
    hf_token_set: bool
    ms_token_set: bool


class UpdateTokensRequest(BaseModel):
    hf_token: str | None = None
    ms_token: str | None = None
