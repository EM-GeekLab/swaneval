"""Model management endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import SQLModel, Session, select

from app.database import get_db
from app.db.models import ModelConfig, ModelType
from app.security import get_current_user

router = APIRouter()


class ModelConfigCreate(SQLModel):
    name: str
    model_type: str
    path: str
    api_key: Optional[str] = None
    config: Optional[dict] = None
    is_public: bool = False


class ModelConfigUpdate(SQLModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    config: Optional[dict] = None
    is_public: Optional[bool] = None


class ModelConfigResponse(SQLModel):
    id: int
    name: str
    model_type: str
    path: str
    config: Optional[dict] = None
    is_public: bool
    created_at: str


PRESET_MODELS = [
    {"id": -1, "name": "Qwen/Qwen2.5-0.5B-Instruct", "model_type": "huggingface", "path": "Qwen/Qwen2.5-0.5B-Instruct"},
    {"id": -2, "name": "Qwen/Qwen2.5-1.5B-Instruct", "model_type": "huggingface", "path": "Qwen/Qwen2.5-1.5B-Instruct"},
    {"id": -3, "name": "Qwen/Qwen2.5-7B-Instruct", "model_type": "huggingface", "path": "Qwen/Qwen2.5-7B-Instruct"},
    {"id": -4, "name": "meta-llama/Llama-3.2-1B-Instruct", "model_type": "huggingface", "path": "meta-llama/Llama-3.2-1B-Instruct"},
    {"id": -5, "name": "meta-llama/Llama-3.2-3B-Instruct", "model_type": "huggingface", "path": "meta-llama/Llama-3.2-3B-Instruct"},
    {"id": -6, "name": "Qwen/Qwen2-0.5B-Instruct", "model_type": "huggingface", "path": "Qwen/Qwen2-0.5B-Instruct"},
    {"id": -7, "name": "Qwen/Qwen2-1.5B-Instruct", "model_type": "huggingface", "path": "Qwen/Qwen2-1.5B-Instruct"},
]


@router.get("", response_model=List[ModelConfigResponse])
def list_models(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all model configurations."""
    user_models = db.exec(
        select(ModelConfig).where(
            (ModelConfig.user_id == current_user["id"]) | (ModelConfig.is_public == True)
        ).offset(skip).limit(limit)
    ).all()

    all_models = []
    for m in PRESET_MODELS:
        all_models.append(ModelConfigResponse(
            id=m["id"], name=m["name"], model_type=m["model_type"],
            path=m["path"], config=None, is_public=True,
            created_at="2024-01-01T00:00:00"
        ))
    for m in user_models:
        all_models.append(ModelConfigResponse(
            id=m.id, name=m.name, model_type=m.model_type,
            path=m.path, config=m.config, is_public=m.is_public,
            created_at=m.created_at.isoformat()
        ))
    return all_models


@router.get("/presets")
def list_preset_models():
    """List preset models."""
    return [{"id": m["id"], "name": m["name"], "path": m["path"]} for m in PRESET_MODELS]


@router.post("", response_model=ModelConfigResponse, status_code=status.HTTP_201_CREATED)
def create_model(
    model: ModelConfigCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new model configuration."""
    db_model = ModelConfig(
        name=model.name, model_type=ModelType(model.model_type),
        path=model.path, api_key=model.api_key, config=model.config,
        user_id=current_user["id"], is_public=model.is_public,
    )
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return ModelConfigResponse(
        id=db_model.id, name=db_model.name, model_type=db_model.model_type,
        path=db_model.path, config=db_model.config, is_public=db_model.is_public,
        created_at=db_model.created_at.isoformat()
    )


@router.get("/{model_id}", response_model=ModelConfigResponse)
def get_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a model configuration by ID."""
    for m in PRESET_MODELS:
        if m["id"] == model_id:
            return ModelConfigResponse(
                id=m["id"], name=m["name"], model_type=m["model_type"],
                path=m["path"], config=None, is_public=True,
                created_at="2024-01-01T00:00:00"
            )

    model = db.get(ModelConfig, model_id)
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    return ModelConfigResponse(
        id=model.id, name=model.name, model_type=model.model_type,
        path=model.path, config=model.config, is_public=model.is_public,
        created_at=model.created_at.isoformat()
    )


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete a model configuration."""
    for m in PRESET_MODELS:
        if m["id"] == model_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete preset models")

    model = db.exec(
        select(ModelConfig).where(ModelConfig.id == model_id, ModelConfig.user_id == current_user["id"])
    ).first()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    db.delete(model)
    db.commit()
