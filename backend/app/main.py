import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api.v1 import router as v1_router
from app.config import settings
from app.database import init_db
from app.metrics import (
    app_info,
    http_request_duration_seconds,
    http_requests_total,
)
from app.services.dataset_sync import start_sync_loop, stop_sync_loop
from app.services.storage import get_storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # Set app info metric
    app_info.info({
        "version": "0.5.0",
        "storage_backend": settings.STORAGE_BACKEND,
    })

    storage = get_storage()
    try:
        await storage.validate()
        await storage.ensure_prefix("uploads")
        await storage.ensure_prefix("evalscope_outputs")
        logger.info("Storage backend validated and ready")
    except Exception as e:
        logger.warning("Storage validation issue (non-fatal): %s", e)

    if settings.STORAGE_BACKEND.lower() == "s3":
        if settings.S3_ENDPOINT_URL:
            os.environ.setdefault("AWS_ENDPOINT_URL", settings.S3_ENDPOINT_URL)
        if settings.S3_ACCESS_KEY:
            os.environ.setdefault("AWS_ACCESS_KEY_ID", settings.S3_ACCESS_KEY)
        if settings.S3_SECRET_KEY:
            os.environ.setdefault("AWS_SECRET_ACCESS_KEY", settings.S3_SECRET_KEY)
        if settings.S3_REGION:
            os.environ.setdefault("AWS_DEFAULT_REGION", settings.S3_REGION)

    # Reset stale "deploying" models from previous crash/restart
    try:
        from sqlmodel import select as _sel
        from sqlmodel.ext.asyncio.session import AsyncSession as _AS

        from app.database import engine as _engine
        from app.models.llm_model import LLMModel

        async with _AS(_engine) as _s:
            stale = (await _s.exec(
                _sel(LLMModel).where(LLMModel.deploy_status == "deploying")
            )).all()
            for m in stale:
                logger.warning("Resetting stale deploying model: %s (%s)", m.name, m.id)
                m.deploy_status = "failed"
                _s.add(m)
            if stale:
                await _s.commit()
                logger.info("Reset %d stale deploying model(s)", len(stale))
    except Exception as e:
        logger.warning("Failed to reset stale models: %s", e)

    # Reset stale "running" tasks from previous crash
    try:
        from app.models.eval_task import EvalTask, TaskStatus

        async with _AS(_engine) as _s:
            stale_tasks = (await _s.exec(
                _sel(EvalTask).where(EvalTask.status == TaskStatus.running)
            )).all()
            for t in stale_tasks:
                logger.warning("Resetting stale running task: %s (%s)", t.name, t.id)
                t.status = TaskStatus.failed
                _s.add(t)
            if stale_tasks:
                await _s.commit()
                logger.info("Reset %d stale running task(s)", len(stale_tasks))
    except Exception as e:
        logger.warning("Failed to reset stale tasks: %s", e)

    start_sync_loop()

    # Start embedded worker if configured (default for dev)
    _embedded_worker_task = None
    if settings.EMBEDDED_WORKER:
        from app.services.task_queue import embedded_worker_loop
        _embedded_worker_task = asyncio.create_task(embedded_worker_loop())
        logger.info("Embedded worker started (set EMBEDDED_WORKER=false for standalone mode)")

    yield

    if _embedded_worker_task and not _embedded_worker_task.done():
        _embedded_worker_task.cancel()
    stop_sync_loop()


app = FastAPI(
    title="SwanEVAL API",
    version="0.5.0",
    lifespan=lifespan,
)

# CORS
_cors_origins = settings.CORS_ORIGINS
_allow_all = "*" in _cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _cors_origins,
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Prometheus instrumentation middleware ─────────────────────────
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    # Skip metrics endpoint itself to avoid recursion
    if request.url.path == "/metrics":
        return await call_next(request)

    method = request.method
    # Normalize path: replace UUIDs with {id}
    path = request.url.path
    parts = path.split("/")
    normalized = "/".join(
        "{id}" if len(p) == 36 and "-" in p else p
        for p in parts
    )

    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start

    http_requests_total.labels(
        method=method,
        endpoint=normalized,
        status=response.status_code,
    ).inc()
    http_request_duration_seconds.labels(
        method=method,
        endpoint=normalized,
    ).observe(duration)

    return response


# ── Prometheus metrics endpoint ──────────────────────────────────
@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# API routes
app.include_router(v1_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
