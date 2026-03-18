# Real-API E2E Test Guide

This guide validates backend E2E using a real model API, without any mock server.

## 1. Required environment variables

Set these before running the E2E script:

```bash
export E2E_BASE_URL="http://127.0.0.1:8000/api/v1"
export E2E_MODEL_ENDPOINT="https://coding.dashscope.aliyuncs.com/apps/anthropic"
export E2E_MODEL_NAME="qwen3.5-plus"
export E2E_MODEL_API_KEY="<your-real-api-key>"
```

## 2. Start backend

```bash
cd backend
DATABASE_URL='sqlite+aiosqlite:///./e2e_test.db' \
DATABASE_URL_SYNC='sqlite:///./e2e_test.db' \
REDIS_URL='redis://localhost:6379/9' \
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 3. Prepare dataset

```bash
cd backend
mkdir -p data/e2e_cases
cat > data/e2e_cases/general_qa_sample.jsonl <<'EOF'
{"query":"What is the capital of China?","response":"Beijing"}
EOF
```

## 4. Run E2E

```bash
cd backend
../.venv/bin/python test_docs/run_e2e_evalscope_api_test.py
```

Or run the formal unittest case (recommended for CI/manual gating):

```bash
cd backend
RUN_REAL_E2E=1 \
E2E_BASE_URL="http://127.0.0.1:8000/api/v1" \
E2E_MODEL_ENDPOINT="https://coding.dashscope.aliyuncs.com/apps/anthropic" \
E2E_MODEL_NAME="qwen3.5-plus" \
E2E_MODEL_API_KEY="<your-real-api-key>" \
../.venv/bin/python -m unittest tests/test_real_model_api_e2e.py
```

Run integration mode (test auto-starts backend process):

```bash
cd backend
RUN_REAL_E2E=1 \
RUN_REAL_E2E_INTEGRATION=1 \
E2E_MODEL_ENDPOINT="https://coding.dashscope.aliyuncs.com/apps/anthropic" \
E2E_MODEL_NAME="qwen3.5-plus" \
E2E_MODEL_API_KEY="<your-real-api-key>" \
../.venv/bin/python -m unittest tests/test_real_model_api_e2e.py
```

Optional env:

- `E2E_LOCAL_SERVER_PORT` (default: `18000`)

Success criteria:

- `TASK_STATUS= completed`
- `RESULT_COUNT >= 1`
- `FIRST_RESULT_PROMPT` is non-empty
