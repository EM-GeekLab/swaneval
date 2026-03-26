"""User management API (admin only)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User, UserRole
from app.schemas.auth import AdminUpdateUserRequest, RegisterRequest, UserResponse
from app.services.auth import hash_password

router = APIRouter()


def _require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return current_user


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: RegisterRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    """Admin creates a new user with any role."""
    existing = await session.exec(
        select(User).where(
            (User.username == body.username) | (User.email == body.email)
        )
    )
    if existing.first():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "用户名或邮箱已存在",
        )

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserResponse.from_user(user)


@router.get("", response_model=list[UserResponse])
async def list_users(
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    result = await session.exec(select(User).order_by(User.created_at))
    return [UserResponse.from_user(u) for u in result.all()]


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: AdminUpdateUserRequest,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if body.nickname is not None and user.username != "admin":
        user.nickname = body.nickname
    if body.email is not None:
        user.email = body.email
    if body.role is not None:
        if user.username == "admin":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot change admin role",
            )
        user.role = body.role
    if body.is_active is not None:
        if user.username == "admin":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot deactivate admin",
            )
        user.is_active = body.is_active
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserResponse.from_user(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(_require_admin),
):
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.username == "admin":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot delete admin account",
        )
    await session.delete(user)
    await session.commit()
