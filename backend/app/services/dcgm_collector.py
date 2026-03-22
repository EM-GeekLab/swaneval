"""DCGM Exporter metrics collector.

Scrapes NVIDIA DCGM exporter endpoints (typically :9400/metrics) and
re-exports selected GPU metrics as Prometheus gauges with SwanEVAL prefix.

Usage:
- Configure via DCGM_EXPORTER_URLS env var (comma-separated endpoints)
- Call start_dcgm_loop() from app lifespan to begin periodic scraping
- Metrics appear at /metrics alongside other SwanEVAL metrics
"""

import asyncio
import logging
import re

import httpx
from prometheus_client import Gauge

from app.config import settings

logger = logging.getLogger(__name__)

# ── Prometheus gauges for GPU metrics ────────────────────────────
gpu_temperature = Gauge(
    "swaneval_gpu_temperature_celsius",
    "GPU temperature in Celsius",
    ["gpu_id", "gpu_model", "host"],
)
gpu_utilization = Gauge(
    "swaneval_gpu_utilization_percent",
    "GPU compute utilization percentage",
    ["gpu_id", "gpu_model", "host"],
)
gpu_memory_used_bytes = Gauge(
    "swaneval_gpu_memory_used_bytes",
    "GPU memory used in bytes",
    ["gpu_id", "gpu_model", "host"],
)
gpu_memory_total_bytes = Gauge(
    "swaneval_gpu_memory_total_bytes",
    "GPU memory total in bytes",
    ["gpu_id", "gpu_model", "host"],
)
gpu_power_usage_watts = Gauge(
    "swaneval_gpu_power_usage_watts",
    "GPU power usage in watts",
    ["gpu_id", "gpu_model", "host"],
)
gpu_sm_clock_mhz = Gauge(
    "swaneval_gpu_sm_clock_mhz",
    "GPU SM clock speed in MHz",
    ["gpu_id", "gpu_model", "host"],
)

# Mapping from DCGM metric names to our gauges + unit conversion
_DCGM_METRIC_MAP: dict[str, tuple[Gauge, float]] = {
    "DCGM_FI_DEV_GPU_TEMP": (gpu_temperature, 1.0),
    "DCGM_FI_DEV_GPU_UTIL": (gpu_utilization, 1.0),
    "DCGM_FI_DEV_FB_USED": (gpu_memory_used_bytes, 1024 * 1024),  # MiB → bytes
    "DCGM_FI_DEV_FB_TOTAL": (gpu_memory_total_bytes, 1024 * 1024),
    "DCGM_FI_DEV_POWER_USAGE": (gpu_power_usage_watts, 1.0),
    "DCGM_FI_DEV_SM_CLOCK": (gpu_sm_clock_mhz, 1.0),
}

# Regex to parse Prometheus text format lines
_METRIC_LINE_RE = re.compile(
    r'^(\w+)\{([^}]*)\}\s+([\d.eE+-]+)$'
)

_scrape_task: asyncio.Task | None = None


def _parse_labels(label_str: str) -> dict[str, str]:
    """Parse Prometheus label string like 'gpu="0",modelName="A100"'."""
    labels: dict[str, str] = {}
    for pair in label_str.split(","):
        pair = pair.strip()
        if "=" not in pair:
            continue
        key, _, val = pair.partition("=")
        labels[key.strip()] = val.strip().strip('"')
    return labels


async def scrape_dcgm_endpoint(url: str, client: httpx.AsyncClient) -> int:
    """Scrape one DCGM exporter endpoint and update Prometheus gauges.

    Returns the number of metrics updated.
    """
    try:
        resp = await client.get(url, timeout=10.0)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("Failed to scrape DCGM endpoint %s: %s", url, e)
        return 0

    count = 0
    # Extract host from URL for label
    from urllib.parse import urlparse
    host = urlparse(url).hostname or "unknown"

    for line in resp.text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        match = _METRIC_LINE_RE.match(line)
        if not match:
            continue

        metric_name, label_str, value_str = match.groups()
        if metric_name not in _DCGM_METRIC_MAP:
            continue

        gauge, multiplier = _DCGM_METRIC_MAP[metric_name]
        labels = _parse_labels(label_str)
        gpu_id = labels.get("gpu", labels.get("GPU_I_ID", "0"))
        gpu_model = labels.get("modelName", labels.get("DCGM_FI_DEV_NAME", "unknown"))

        try:
            value = float(value_str) * multiplier
            gauge.labels(gpu_id=gpu_id, gpu_model=gpu_model, host=host).set(value)
            count += 1
        except (ValueError, TypeError):
            continue

    return count


async def scrape_all_endpoints() -> int:
    """Scrape all configured DCGM exporter endpoints."""
    urls = _get_dcgm_urls()
    if not urls:
        return 0

    total = 0
    async with httpx.AsyncClient() as client:
        for url in urls:
            total += await scrape_dcgm_endpoint(url, client)
    return total


def _get_dcgm_urls() -> list[str]:
    """Get DCGM exporter URLs from settings."""
    raw = getattr(settings, "DCGM_EXPORTER_URLS", "") or ""
    if not raw:
        return []
    return [u.strip() for u in raw.split(",") if u.strip()]


async def _dcgm_loop() -> None:
    """Background loop that periodically scrapes DCGM exporters."""
    interval = getattr(settings, "DCGM_SCRAPE_INTERVAL_SECONDS", 30)
    logger.info("DCGM collector loop started (interval=%ds)", interval)
    while True:
        try:
            count = await scrape_all_endpoints()
            if count > 0:
                logger.debug("DCGM scrape: updated %d metrics", count)
        except Exception as e:
            logger.error("DCGM scrape cycle failed: %s", e)
        await asyncio.sleep(interval)


def start_dcgm_loop() -> None:
    """Start background DCGM scraping (call from app lifespan)."""
    global _scrape_task
    urls = _get_dcgm_urls()
    if not urls:
        logger.info("DCGM collector: no endpoints configured (set DCGM_EXPORTER_URLS)")
        return
    _scrape_task = asyncio.create_task(_dcgm_loop())


def stop_dcgm_loop() -> None:
    """Stop background DCGM scraping."""
    global _scrape_task
    if _scrape_task and not _scrape_task.done():
        _scrape_task.cancel()
        _scrape_task = None
