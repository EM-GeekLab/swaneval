import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy import Enum as SAEnum
from sqlmodel import Field, SQLModel


# 用户角色枚举 / User role enumeration
class UserRole(str, enum.Enum):
    """用户角色枚举 / User role enumeration"""
    admin = "admin"           # 管理员 / Administrator with full access
    data_admin = "data_admin" # 数据管理员 / Data administrator (datasets & criteria)
    engineer = "engineer"     # 工程师 / Engineer (run tasks, view data)
    viewer = "viewer"         # 查看者 / Viewer (view only)


class User(SQLModel, table=True):
    """
    用户模型 / User model

    存储系统用户信息，包括认证和权限管理。
    Stores system user information including authentication and permission management.
    """
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # 用户ID / User unique identifier

    username: str = Field(index=True, unique=True, max_length=64)
    # 用户名 / Username (unique, indexed)

    email: str = Field(index=True, unique=True, max_length=256)
    # 邮箱 / Email address (unique, indexed)

    nickname: str = Field(default="", max_length=64)
    # 昵称 / Display nickname

    hashed_password: str
    # 哈希密码 / Hashed password for authentication

    role: UserRole = Field(
        sa_column=Column(SAEnum(UserRole), nullable=False, default=UserRole.viewer)
    )
    # 用户角色 / User role (default: viewer)

    is_active: bool = Field(default=True)
    # 是否激活 / Whether the user account is active

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 创建时间 / Account creation timestamp

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_type=DateTime(timezone=True),
    )
    # 更新时间 / Last update timestamp