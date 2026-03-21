"""RBAC permission checking service."""

import json
import uuid as uuid_mod

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.permission import (
    PermissionGroup,
    ResourceAcl,
    UserGroupMembership,
)
from app.models.user import User, UserRole

# All available permissions
ALL_PERMISSIONS = [
    "datasets.read", "datasets.write", "datasets.download",
    "tasks.read", "tasks.create", "tasks.manage",
    "results.read",
    "reports.read", "reports.generate", "reports.export",
    "models.read", "models.write",
    "criteria.read", "criteria.write",
    "clusters.read", "clusters.manage",
    "admin.users", "admin.groups", "admin.acl",
]

# Default permission sets per role (used for seeding system groups)
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "admin": ALL_PERMISSIONS,  # Full access
    "data_admin": [
        "datasets.read", "datasets.write", "datasets.download",
        "criteria.read", "criteria.write",
        "models.read", "models.write",
        "tasks.read", "tasks.create",
        "results.read",
        "reports.read", "reports.generate", "reports.export",
    ],
    "engineer": [
        "datasets.read", "datasets.download",
        "criteria.read",
        "models.read",
        "tasks.read", "tasks.create", "tasks.manage",
        "results.read",
        "reports.read", "reports.generate", "reports.export",
    ],
    "viewer": [
        "datasets.read",
        "criteria.read",
        "models.read",
        "tasks.read",
        "results.read",
        "reports.read",
    ],
}


async def get_user_permissions(session: AsyncSession, user: User) -> set[str]:
    """Get the union of all permissions from the user's groups."""
    if user.role == UserRole.admin:
        return set(ALL_PERMISSIONS)

    stmt = (
        select(PermissionGroup.permissions_json)
        .join(UserGroupMembership, UserGroupMembership.group_id == PermissionGroup.id)
        .where(UserGroupMembership.user_id == user.id)
    )
    result = await session.exec(stmt)
    perms: set[str] = set()
    for row in result.all():
        try:
            perms.update(json.loads(row))
        except (json.JSONDecodeError, TypeError):
            pass
    return perms


async def check_permission(
    session: AsyncSession, user: User, permission: str,
) -> bool:
    if user.role == UserRole.admin:
        return True
    perms = await get_user_permissions(session, user)
    return permission in perms


async def check_resource_access(
    session: AsyncSession,
    user: User,
    resource_type: str,
    resource_id,
    required_level: str,
) -> bool:
    if user.role == UserRole.admin:
        return True

    rid = uuid_mod.UUID(str(resource_id))

    # Check if any ACLs exist for this resource
    acl_stmt = select(ResourceAcl).where(
        ResourceAcl.resource_type == resource_type,
        ResourceAcl.resource_id == rid,
    )
    acls = (await session.exec(acl_stmt)).all()

    if not acls:
        # No ACLs = use general permissions
        return await check_permission(session, user, f"{resource_type}s.read")

    # Check direct user ACLs
    for acl in acls:
        if acl.grantee_type == "user" and acl.grantee_id == user.id:
            if _level_sufficient(acl.access_level, required_level):
                return True

    # Check group ACLs
    group_stmt = select(UserGroupMembership.group_id).where(
        UserGroupMembership.user_id == user.id
    )
    user_groups = set((await session.exec(group_stmt)).all())
    for acl in acls:
        if acl.grantee_type == "group" and acl.grantee_id in user_groups:
            if _level_sufficient(acl.access_level, required_level):
                return True

    return False


_LEVEL_ORDER = ["view", "evaluate", "download", "edit", "admin"]


def _level_sufficient(granted: str, required: str) -> bool:
    try:
        return _LEVEL_ORDER.index(granted) >= _LEVEL_ORDER.index(required)
    except ValueError:
        return False
