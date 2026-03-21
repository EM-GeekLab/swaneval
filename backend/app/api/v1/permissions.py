"""Permission groups and resource ACL management API."""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import get_current_user, get_db, require_permission
from app.models.permission import (
    PermissionGroup,
    ResourceAcl,
    UserGroupMembership,
)
from app.models.user import User
from app.schemas.permission import (
    GroupMemberAdd,
    PermissionGroupCreate,
    PermissionGroupResponse,
    PermissionGroupUpdate,
    ResourceAclCreate,
    ResourceAclResponse,
)
from app.services.rbac import ALL_PERMISSIONS, ROLE_PERMISSIONS, get_user_permissions

router = APIRouter()


# ── Permission Groups ─────────────────────────────────────────────────


@router.get("/groups", response_model=list[PermissionGroupResponse])
async def list_groups(
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """List all permission groups with member counts."""
    stmt = select(PermissionGroup).order_by(PermissionGroup.name)
    groups = (await session.exec(stmt)).all()

    results = []
    for g in groups:
        count_stmt = select(func.count()).where(
            UserGroupMembership.group_id == g.id
        )
        count = (await session.exec(count_stmt)).one()
        try:
            perms = json.loads(g.permissions_json)
        except (json.JSONDecodeError, TypeError):
            perms = []
        results.append(
            PermissionGroupResponse(
                id=g.id,
                name=g.name,
                description=g.description,
                is_system=g.is_system,
                permissions=perms,
                member_count=count,
            )
        )
    return results


@router.post("/groups", response_model=PermissionGroupResponse, status_code=201)
async def create_group(
    body: PermissionGroupCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("admin.groups"),
):
    """Create a new permission group (admin.groups required)."""
    group = PermissionGroup(
        name=body.name,
        description=body.description,
        permissions_json=json.dumps(body.permissions),
        created_by=current_user.id,
    )
    session.add(group)
    await session.commit()
    await session.refresh(group)
    return PermissionGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_system=group.is_system,
        permissions=body.permissions,
        member_count=0,
    )


@router.get("/groups/{group_id}", response_model=PermissionGroupResponse)
async def get_group(
    group_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get group detail with member count."""
    group = await session.get(PermissionGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")

    count_stmt = select(func.count()).where(
        UserGroupMembership.group_id == group.id
    )
    count = (await session.exec(count_stmt)).one()
    try:
        perms = json.loads(group.permissions_json)
    except (json.JSONDecodeError, TypeError):
        perms = []
    return PermissionGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_system=group.is_system,
        permissions=perms,
        member_count=count,
    )


@router.put("/groups/{group_id}", response_model=PermissionGroupResponse)
async def update_group(
    group_id: uuid.UUID,
    body: PermissionGroupUpdate,
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.groups"),
):
    """Update a permission group."""
    group = await session.get(PermissionGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")

    if body.name is not None:
        group.name = body.name
    if body.description is not None:
        group.description = body.description
    if body.permissions is not None:
        group.permissions_json = json.dumps(body.permissions)

    session.add(group)
    await session.commit()
    await session.refresh(group)

    count_stmt = select(func.count()).where(
        UserGroupMembership.group_id == group.id
    )
    count = (await session.exec(count_stmt)).one()
    try:
        perms = json.loads(group.permissions_json)
    except (json.JSONDecodeError, TypeError):
        perms = []
    return PermissionGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        is_system=group.is_system,
        permissions=perms,
        member_count=count,
    )


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.groups"),
):
    """Delete a non-system permission group."""
    group = await session.get(PermissionGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    if group.is_system:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot delete system group"
        )

    # Remove memberships first
    mem_stmt = select(UserGroupMembership).where(
        UserGroupMembership.group_id == group_id
    )
    memberships = (await session.exec(mem_stmt)).all()
    for m in memberships:
        await session.delete(m)

    await session.delete(group)
    await session.commit()


# ── Group Members ─────────────────────────────────────────────────────


@router.post("/groups/{group_id}/members", status_code=201)
async def add_members(
    group_id: uuid.UUID,
    body: GroupMemberAdd,
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.groups"),
):
    """Add users to a group."""
    group = await session.get(PermissionGroup, group_id)
    if not group:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")

    added = 0
    for user_id in body.user_ids:
        # Check if user exists
        user = await session.get(User, user_id)
        if not user:
            continue
        # Check if already a member
        existing_stmt = select(UserGroupMembership).where(
            UserGroupMembership.user_id == user_id,
            UserGroupMembership.group_id == group_id,
        )
        existing = (await session.exec(existing_stmt)).first()
        if existing:
            continue
        membership = UserGroupMembership(user_id=user_id, group_id=group_id)
        session.add(membership)
        added += 1

    await session.commit()
    return {"added": added}


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.groups"),
):
    """Remove a user from a group."""
    stmt = select(UserGroupMembership).where(
        UserGroupMembership.user_id == user_id,
        UserGroupMembership.group_id == group_id,
    )
    membership = (await session.exec(stmt)).first()
    if not membership:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")
    await session.delete(membership)
    await session.commit()


# ── Current User Permissions ──────────────────────────────────────────


@router.get("/my-permissions")
async def my_permissions(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's resolved permissions."""
    perms = await get_user_permissions(session, current_user)
    return {"permissions": sorted(perms)}


# ── Resource ACLs ─────────────────────────────────────────────────────


@router.get("/acls", response_model=list[ResourceAclResponse])
async def list_acls(
    resource_type: str | None = Query(default=None),
    resource_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.acl"),
):
    """List ACLs with optional resource_type/resource_id filters."""
    stmt = select(ResourceAcl)
    if resource_type:
        stmt = stmt.where(ResourceAcl.resource_type == resource_type)
    if resource_id:
        stmt = stmt.where(ResourceAcl.resource_id == resource_id)
    stmt = stmt.order_by(ResourceAcl.created_at.desc())
    acls = (await session.exec(stmt)).all()
    return [
        ResourceAclResponse(
            id=a.id,
            resource_type=a.resource_type,
            resource_id=a.resource_id,
            grantee_type=a.grantee_type,
            grantee_id=a.grantee_id,
            access_level=a.access_level,
        )
        for a in acls
    ]


@router.post("/acls", response_model=ResourceAclResponse, status_code=201)
async def create_acl(
    body: ResourceAclCreate,
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("admin.acl"),
):
    """Create a resource ACL."""
    acl = ResourceAcl(
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        grantee_type=body.grantee_type,
        grantee_id=body.grantee_id,
        access_level=body.access_level,
        created_by=current_user.id,
    )
    session.add(acl)
    await session.commit()
    await session.refresh(acl)
    return ResourceAclResponse(
        id=acl.id,
        resource_type=acl.resource_type,
        resource_id=acl.resource_id,
        grantee_type=acl.grantee_type,
        grantee_id=acl.grantee_id,
        access_level=acl.access_level,
    )


@router.delete("/acls/{acl_id}", status_code=204)
async def delete_acl(
    acl_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _current_user: User = require_permission("admin.acl"),
):
    """Delete a resource ACL."""
    acl = await session.get(ResourceAcl, acl_id)
    if not acl:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ACL not found")
    await session.delete(acl)
    await session.commit()


# ── Available Permissions ─────────────────────────────────────────────


@router.get("/available")
async def available_permissions(
    _current_user: User = Depends(get_current_user),
):
    """List all available permissions."""
    return {"permissions": ALL_PERMISSIONS}


# ── Seed Default Groups ──────────────────────────────────────────────


_ROLE_GROUP_NAMES: dict[str, str] = {
    "data_admin": "默认数据管理员组",
    "engineer": "默认工程师组",
    "viewer": "默认观察者组",
}


@router.post("/seed-defaults")
async def seed_default_groups(
    session: AsyncSession = Depends(get_db),
    current_user: User = require_permission("admin.groups"),
):
    """Ensure default system permission groups exist with correct permissions."""
    for role_name, perms in ROLE_PERMISSIONS.items():
        if role_name == "admin":
            continue  # Admin has implicit full access

        group_name = _ROLE_GROUP_NAMES.get(role_name, role_name)

        stmt = select(PermissionGroup).where(PermissionGroup.name == group_name)
        existing = (await session.exec(stmt)).first()
        if existing:
            existing.permissions_json = json.dumps(perms)
            session.add(existing)
        else:
            group = PermissionGroup(
                name=group_name,
                description=f"{role_name} 角色的默认权限组",
                is_system=True,
                permissions_json=json.dumps(perms),
                created_by=current_user.id,
            )
            session.add(group)

    await session.commit()
    return {"status": "ok", "message": "Default permission groups synced"}
