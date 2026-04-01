"""EvalScope service entrypoint with custom metrics registration."""

import custom_metrics  # noqa: F401 — triggers @register_metric decorators

from evalscope.service import run_service

if __name__ == "__main__":
    run_service(host="0.0.0.0", port=9000)
