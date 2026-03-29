from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func as sa_func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UpdateTokensRequest,
    UserResponse,
)
from app.services.auth import create_access_token, hash_password, verify_password

router = APIRouter()


@router.get("/user-count")
async def user_count(session: AsyncSession = Depends(get_db)):
    count = (await session.exec(
        select(sa_func.count()).select_from(User)
    )).one()
    return {"count": count}


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_db)):
    # Detect first user
    count = (await session.exec(
        select(sa_func.count()).select_from(User)
    )).one()
    is_first = count == 0

    # Check uniqueness
    effective_username = "admin" if is_first else body.username
    stmt = select(User).where(
        (User.username == effective_username) | (User.email == body.email)
    )
    existing = (await session.exec(stmt)).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "用户名或邮箱已被使用")

    user = User(
        username="admin" if is_first else body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=UserRole.admin if is_first else UserRole.viewer,
        nickname="",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.username == body.username)
    user = (await session.exec(stmt)).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户未找到")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "账户已停用")

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_profile(
    body: UpdateProfileRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Admin cannot change nickname
    if body.nickname is not None and current_user.username != "admin":
        current_user.nickname = body.nickname
    if body.email is not None:
        current_user.email = body.email
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "旧密码错误")
    current_user.hashed_password = hash_password(body.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    session.add(current_user)
    await session.commit()
    return {"ok": True}


@router.get("/tokens")
async def get_tokens(
    current_user: User = Depends(get_current_user),
):
    return {
        "hf_token_set": bool(current_user.hf_token),
        "ms_token_set": bool(current_user.ms_token),
    }


@router.put("/tokens")
async def update_tokens(
    body: UpdateTokensRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.hf_token is not None:
        current_user.hf_token = body.hf_token
    if body.ms_token is not None:
        current_user.ms_token = body.ms_token
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return {
        "hf_token_set": bool(current_user.hf_token),
        "ms_token_set": bool(current_user.ms_token),
    }
