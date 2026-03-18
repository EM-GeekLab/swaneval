"""Authentication endpoints."""
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
)

router = APIRouter()


class UserResponse(BaseModel):
    """User response model."""
    id: int
    username: str
    email: str
    role: str


class UserCreate(BaseModel):
    """User create model."""
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = "guest"


class Token(BaseModel):
    """Token response model."""
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    """Login request model."""
    username: str
    password: str


# In-memory user store for demo (replace with database)
USERS_DB = {
    "admin": {
        "id": 1,
        "username": "admin",
        "email": "admin@evalscope.local",
        "hashed_password": "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.VTtYGCpFdC0FUm",  # admin
        "role": "admin",
        "is_active": True,
    }
}


def get_user_from_db(username: str) -> Optional[dict]:
    """Get user from database."""
    return USERS_DB.get(username)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login endpoint."""
    user = get_user_from_db(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user["id"]), "username": user["username"]},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register", response_model=UserResponse)
def register(user: UserCreate):
    """Register a new user."""
    if user.username in USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    user_id = len(USERS_DB) + 1
    hashed_password = get_password_hash(user.password)

    USERS_DB[user.username] = {
        "id": user_id,
        "username": user.username,
        "email": user.email,
        "hashed_password": hashed_password,
        "role": user.role,
        "is_active": True,
    }

    return UserResponse(
        id=user_id,
        username=user.username,
        email=user.email,
        role=user.role,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user."""
    user = get_user_from_db(current_user["username"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        role=user["role"],
    )
