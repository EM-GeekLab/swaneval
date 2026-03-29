import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_session
from app.models.user import User
from app.services.auth import decode_access_token

security = HTTPBearer()


async def get_db() -> AsyncSession:
    async for session in get_session():
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id_str = decode_access_token(token)
    if not user_id_str:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "令牌无效或已过期")
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "令牌内容无效") from exc

    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "用户不存在或已停用")
    return user


def require_role(*roles: str):
    async def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")
        return current_user

    return Depends(dependency)


def require_permission(*perms: str):
    async def dependency(
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_db),
    ):
        from app.services.rbac import check_permission

        if current_user.role == "admin":
            return current_user
        for p in perms:
            if await check_permission(session, current_user, p):
                return current_user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")

    return Depends(dependency)
