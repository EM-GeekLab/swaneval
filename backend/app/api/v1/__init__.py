from fastapi import APIRouter

from app.api.v1 import (
    auth,
    benchmarks,
    criteria,
    datasets,
    metrics,
    models,
    reports,
    results,
    tasks,
    users,
)

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(datasets.router, prefix="/datasets", tags=["datasets"])
router.include_router(criteria.router, prefix="/criteria", tags=["criteria"])
router.include_router(models.router, prefix="/models", tags=["models"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(results.router, prefix="/results", tags=["results"])
router.include_router(reports.router, prefix="/reports", tags=["reports"])
router.include_router(benchmarks.router, prefix="/benchmarks", tags=["benchmarks"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(metrics.router, prefix="/metrics", tags=["metrics"])

