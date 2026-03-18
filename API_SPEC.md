# EvalScope GUI — Frontend ↔ Backend API Specification

> **Version:** 1.0.0
> **Date:** 2026-03-19
> **Base URL:** `http://localhost:8000/api/v1`
> **Auth:** JWT Bearer token in `Authorization: Bearer <token>` header
> **Content-Type:** `application/json` unless noted otherwise
> **Errors:** All errors return `{ "detail": string }` with appropriate HTTP status

---

## Table of Contents

1. [Conventions](#conventions)
2. [Auth](#1-auth)
3. [Models](#2-models)
4. [Datasets](#3-datasets)
5. [Criteria](#4-criteria)
6. [Tasks](#5-tasks)
7. [Results](#6-results)

---

## Conventions

| Convention | Detail |
|---|---|
| IDs | UUID v4, serialized as string `"550e8400-e29b-41d4-a716-446655440000"` |
| Timestamps | ISO 8601 string `"2026-03-19T12:00:00Z"`, always UTC |
| Nullable fields | Explicitly marked `| null`. Omitted fields in requests are treated as server defaults. |
| Pagination | `?page=1&page_size=20` on supported endpoints. Response is a flat array (total count conveyed by context). |
| Sorting | Server returns results in `created_at DESC` order unless otherwise noted. |
| Auth-required | All endpoints except `POST /auth/login` and `POST /auth/register` require a valid JWT. |
| 401 handling | Frontend interceptor clears token and redirects to `/login` on any 401 response. |

### Standard Error Codes

| Code | Meaning |
|---|---|
| 400 | Bad request / validation error |
| 401 | Missing, invalid, or expired token |
| 403 | Authenticated but insufficient role/permissions |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate username) |
| 422 | Request body validation failure (Pydantic) |

---

## 1. Auth

### `POST /auth/register`

Create a new user account.

**Status:** `201`

**Request Body:**
```jsonc
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "s3cret",
  "role": "engineer"          // optional, default: "engineer"
}
```

**Response Body:** [`User`](#user-object)

**Errors:**
- `409` — username or email already taken

---

### `POST /auth/login`

Authenticate and receive a JWT.

**Request Body:**
```jsonc
{
  "username": "alice",
  "password": "s3cret"
}
```

**Response Body:**
```jsonc
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer"
}
```

**Errors:**
- `401` — invalid credentials or account disabled

---

### `GET /auth/me`

Return the currently authenticated user.

**Response Body:** [`User`](#user-object)

---

### User Object

```jsonc
{
  "id": "uuid",
  "username": "alice",
  "email": "alice@example.com",
  "role": "engineer",           // "admin" | "data_admin" | "engineer" | "viewer"
  "is_active": true
}
```

---

## 2. Models

### `POST /models`

Register a new LLM endpoint.

**Status:** `201`

**Request Body:**
```jsonc
{
  "name": "GPT-4o",                              // required — display name
  "provider": "openai",                           // required
  "endpoint_url": "https://api.openai.com/v1/chat/completions",  // required
  "model_type": "api",                            // required — "api" | "local" | "huggingface"
  "api_key": "sk-...",                            // optional, default ""
  "description": "Production GPT-4o endpoint",    // optional
  "model_name": "gpt-4o-2024-08-06",             // optional — actual model ID sent in API calls
  "max_tokens": 4096                              // optional — model's max token limit
}
```

> **Note:** `description`, `model_name`, and `max_tokens` are new fields the frontend now sends. Backend should accept and persist them. If not yet supported, backend may silently ignore them without returning an error.

**Response Body:** [`Model`](#model-object)

---

### `GET /models`

List all registered models, ordered by `created_at DESC`.

**Response Body:** [`Model[]`](#model-object)

---

### `GET /models/{model_id}`

Get a single model by ID.

**Response Body:** [`Model`](#model-object)

**Errors:** `404`

---

### `PUT /models/{model_id}`

Update model fields.

**Request Body:**
```jsonc
{
  "name": "GPT-4o-mini",         // optional
  "endpoint_url": "https://...", // optional
  "api_key": "sk-...",          // optional
  "description": "...",         // optional
  "model_name": "...",          // optional
  "max_tokens": 8192            // optional
}
```

**Response Body:** [`Model`](#model-object)

---

### `POST /models/{model_id}/test`

Test connectivity to the model's endpoint. Backend should send a minimal request (e.g. a single-token chat completion) to `endpoint_url` with the stored `api_key` and return success/failure.

**Request Body:** _none_

**Response Body:**
```jsonc
{
  "ok": true,                         // true if endpoint responded with HTTP < 400
  "message": "Connected (200)"        // human-readable status
}
```

**Timeout:** 15 seconds max. On timeout return `{ "ok": false, "message": "Connection timed out" }`.

---

### `DELETE /models/{model_id}`

**Status:** `204` — no body

**Errors:** `404`

---

### Model Object

```jsonc
{
  "id": "uuid",
  "name": "GPT-4o",
  "provider": "openai",
  "endpoint_url": "https://api.openai.com/v1/chat/completions",
  "model_type": "api",             // "api" | "local" | "huggingface"
  "description": "...",            // may be "" or null if not set
  "model_name": "gpt-4o-2024-08-06",  // may be "" or null
  "max_tokens": 4096,              // may be null
  "created_at": "2026-03-19T12:00:00Z"
}
```

> **Backend note:** The `api_key` field MUST be excluded from all response bodies for security. Never return it to the frontend.

---

## 3. Datasets

### `POST /datasets/upload`

Upload a dataset file. Auto-detects format from extension, counts rows, stores file.

**Status:** `201`
**Content-Type:** `multipart/form-data`

| Form Field | Type | Required | Notes |
|---|---|---|---|
| `file` | File | yes | `.jsonl`, `.csv`, `.json` |
| `name` | string | no | Defaults to filename (without extension) |
| `description` | string | no | Default `""` |
| `tags` | string | no | Comma-separated, e.g. `"math,reasoning"` |

**Response Body:** [`Dataset`](#dataset-object)

**Behavior:**
- If a dataset with the same `name` already exists, auto-increment `version`.
- Supported formats: `jsonl`, `csv`, `json`.
- Persist file to `UPLOAD_DIR` and set `source_uri` to the stored path.

---

### `POST /datasets/mount`

Register a server-local file path as a dataset (no copy).

**Status:** `201`

**Request Body:**
```jsonc
{
  "name": "my-dataset",
  "description": "",
  "server_path": "/data/datasets/eval.jsonl",
  "format": "jsonl",
  "tags": ""
}
```

**Response Body:** [`Dataset`](#dataset-object)

**Errors:**
- `400` — path does not exist on server

---

### `GET /datasets`

List datasets.

**Query Parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `tag` | string | — | Filter: datasets whose `tags` contain this value |
| `page` | int | 1 | |
| `page_size` | int | 20 | |

**Response Body:** [`Dataset[]`](#dataset-object)

> **Frontend note:** The frontend currently consumes this as a flat array without pagination metadata. If backend returns `{ items: [...], total, page, page_size }`, the frontend will need updating — or backend can return a flat array for now.

---

### `GET /datasets/{dataset_id}`

**Response Body:** [`Dataset`](#dataset-object)

**Errors:** `404`

---

### `GET /datasets/{dataset_id}/preview`

Return first N rows of the dataset for preview.

**Query Parameters:**

| Param | Type | Default |
|---|---|---|
| `limit` | int | 50 |

**Response Body:**
```jsonc
{
  "rows": [
    { "prompt": "What is 2+2?", "answer": "4" },
    // ... up to `limit` rows
  ],
  "total": 1000                    // total row count in dataset
}
```

Each row is a flat key-value object. Keys come from the dataset's columns/fields.

---

### `DELETE /datasets/{dataset_id}`

Delete a dataset and its associated file and version records.

**Status:** `204` — no body

**Errors:** `404`

> **Backend requirement:** This must actually remove the database record, not just null out fields. The frontend expects the record to disappear from subsequent `GET /datasets` calls. Also clean up:
> - Associated `DatasetVersion` records (cascade delete)
> - The stored file at `source_uri` (if `source_type == "upload"`)

---

### Dataset Object

```jsonc
{
  "id": "uuid",
  "name": "GSM8K",
  "description": "Grade school math problems",
  "source_type": "upload",         // "upload" | "huggingface" | "modelscope" | "server_path" | "preset"
  "source_uri": "data/uploads/abc123.jsonl",
  "format": "jsonl",
  "tags": "math,reasoning",       // comma-separated string
  "version": 1,
  "size_bytes": 1048576,
  "row_count": 8792,
  "created_at": "2026-03-19T12:00:00Z"
}
```

---

## 4. Criteria

### `POST /criteria`

Create a new evaluation criterion.

**Status:** `201`

**Request Body:**
```jsonc
{
  "name": "Exact Match",
  "type": "preset",              // "preset" | "regex" | "script" | "llm_judge"
  "config_json": "{\"metric\": \"exact_match\"}"   // JSON string, schema depends on type
}
```

#### `config_json` schemas by type

**`preset`:**
```jsonc
{ "metric": "exact_match" }       // "exact_match" | "contains" | "numeric" | "bleu" | "rouge" | "perplexity" | "pass_at_k"
```

**`regex`:**
```jsonc
{
  "pattern": "\\d+\\.?\\d*",
  "match_mode": "contains"         // "exact" | "contains"
}
```

**`script`:**
```jsonc
{
  "script_path": "/path/to/eval_script.py",
  "entrypoint": "evaluate"
}
```

**`llm_judge`:**
```jsonc
{
  "system_prompt": "You are an evaluation judge. Score 0-1...",
  "judge_model_id": "uuid",       // optional, reference to a Model
  "dimensions": [                  // optional
    { "name": "accuracy", "weight": 0.6, "rubric": "..." },
    { "name": "clarity", "weight": 0.4, "rubric": "..." }
  ],
  "scale": 5                      // optional
}
```

**Response Body:** [`Criterion`](#criterion-object)

---

### `GET /criteria`

List all criteria, ordered by `created_at DESC`.

**Response Body:** [`Criterion[]`](#criterion-object)

---

### `GET /criteria/{criterion_id}`

**Response Body:** [`Criterion`](#criterion-object)

**Errors:** `404`

---

### `PUT /criteria/{criterion_id}`

**Request Body:**
```jsonc
{
  "name": "...",         // optional
  "config_json": "..."   // optional
}
```

**Response Body:** [`Criterion`](#criterion-object)

---

### `DELETE /criteria/{criterion_id}`

**Status:** `204` — no body

---

### `POST /criteria/test`

Dry-run a criterion against a single sample.

**Request Body:**
```jsonc
{
  "criterion_id": "uuid",
  "prompt": "What is 2+2?",
  "expected": "4",
  "actual": "The answer is 4"
}
```

**Response Body:**
```jsonc
{
  "score": 0.0,                   // float 0..1
  "criterion": "Exact Match",     // criterion name
  "type": "preset"                // criterion type
}
```

---

### Criterion Object

```jsonc
{
  "id": "uuid",
  "name": "Exact Match",
  "type": "preset",               // "preset" | "regex" | "script" | "llm_judge"
  "config_json": "{\"metric\": \"exact_match\"}",
  "created_at": "2026-03-19T12:00:00Z"
}
```

---

## 5. Tasks

### `POST /tasks`

Create and start an evaluation task.

**Status:** `201`

**Request Body:**
```jsonc
{
  "name": "GPT-4o on GSM8K",
  "model_id": "uuid",
  "dataset_ids": ["uuid", "uuid"],          // array of UUIDs
  "criteria_ids": ["uuid", "uuid"],         // array of UUIDs
  "params_json": "{\"temperature\": 0.7, \"max_tokens\": 1024}",  // optional
  "repeat_count": 3,                        // optional, default 1
  "seed_strategy": "fixed"                  // optional, "fixed" | "random", default "fixed"
}
```

**Response Body:** [`Task`](#task-object)

**Behavior:**
- Set initial status to `"pending"`.
- Create `repeat_count` subtask records (run_index 0..N-1), each with `status: "pending"`, `progress_pct: 0`.
- Begin execution asynchronously (background task / worker queue).

> **Backend note:** `dataset_ids` and `criteria_ids` are sent as JSON arrays from the frontend. Backend may store them internally as comma-separated strings, but must accept arrays in the request and return the same format (arrays or comma-separated strings — see Task Object below).

---

### `GET /tasks`

List tasks.

**Query Parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `status_filter` | string | — | `"pending"` \| `"running"` \| `"paused"` \| `"completed"` \| `"failed"` |

**Response Body:** [`Task[]`](#task-object)

**Polling:** Frontend refetches every **5 seconds**.

---

### `GET /tasks/{task_id}`

**Response Body:** [`Task`](#task-object)

**Polling:** Frontend refetches every **3 seconds**.

**Errors:** `404`

---

### `GET /tasks/{task_id}/subtasks`

**Response Body:** [`Subtask[]`](#subtask-object), ordered by `run_index ASC`.

**Polling:** Frontend refetches every **3 seconds**.

---

### `POST /tasks/{task_id}/pause`

Pause a running task.

**Request Body:** _none_

**Response Body:** [`Task`](#task-object) (with `status: "paused"`)

**Errors:**
- `400` — task is not in `"running"` state

---

### `POST /tasks/{task_id}/resume`

Resume a paused or failed task.

**Request Body:** _none_

**Response Body:** [`Task`](#task-object) (with `status: "pending"`, re-queued)

**Errors:**
- `400` — task is not in `"paused"` or `"failed"` state

---

### `POST /tasks/{task_id}/cancel`

Cancel a task.

**Request Body:** _none_

**Response Body:** [`Task`](#task-object) (with `status: "failed"`)

---

### Task Object

```jsonc
{
  "id": "uuid",
  "name": "GPT-4o on GSM8K",
  "status": "running",            // "pending" | "running" | "paused" | "completed" | "failed"
  "model_id": "uuid",
  "dataset_ids": "uuid1,uuid2",   // comma-separated string (current format)
  "criteria_ids": "uuid1,uuid2",  // comma-separated string (current format)
  "params_json": "{\"temperature\": 0.7, \"max_tokens\": 1024}",
  "repeat_count": 3,
  "seed_strategy": "fixed",       // "fixed" | "random"
  "started_at": "2026-03-19T12:01:00Z",   // null if not yet started
  "finished_at": null,                      // null if not yet finished
  "created_at": "2026-03-19T12:00:00Z"
}
```

### Subtask Object

```jsonc
{
  "id": "uuid",
  "task_id": "uuid",
  "run_index": 0,                  // 0-based, one per repeat
  "status": "running",             // same enum as task
  "progress_pct": 45.5,            // 0..100
  "last_completed_index": 227,     // checkpoint for resume
  "error_log": ""                  // non-empty on failure — contains error message
}
```

---

## 6. Results

### `GET /results`

Paginated list of individual evaluation results.

**Query Parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `task_id` | UUID | — | Filter by task |
| `criterion_id` | UUID | — | Filter by criterion |
| `page` | int | 1 | |
| `page_size` | int | 50 | |

**Response Body:** [`EvalResult[]`](#evalresult-object)

---

### `GET /results/leaderboard`

Aggregated scores: one row per (model, criterion) pair.

**Query Parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `criterion_id` | UUID | — | Filter to single criterion |

**Response Body:**
```jsonc
[
  {
    "model_id": "uuid",
    "model_name": "GPT-4o",
    "criterion_id": "uuid",
    "criterion_name": "Exact Match",
    "avg_score": 0.8523,           // float, rounded to 4 decimals
    "total_prompts": 500,
    "avg_latency_ms": 342.15       // float, rounded to 2 decimals
  }
]
```

**Ordering:** `avg_score DESC`

---

### `GET /results/summary`

Per-criterion aggregated stats for a single task.

**Query Parameters:**

| Param | Type | Required |
|---|---|---|
| `task_id` | UUID | **yes** |

**Response Body:**
```jsonc
[
  {
    "criterion_id": "uuid",
    "criterion_name": "Exact Match",
    "avg_score": 0.8523,
    "min_score": 0.0,
    "max_score": 1.0,
    "count": 500,
    "avg_latency_ms": 342.15,
    "avg_tokens": 128.3
  }
]
```

---

### `GET /results/errors`

Results where score < 1.0 for a given task (wrong/partial answers).

**Query Parameters:**

| Param | Type | Required | Default |
|---|---|---|---|
| `task_id` | UUID | **yes** | |
| `page` | int | no | 1 |
| `page_size` | int | no | 50 |

**Response Body:** [`EvalResult[]`](#evalresult-object), ordered by `score ASC`.

---

### EvalResult Object

```jsonc
{
  "id": "uuid",
  "task_id": "uuid",
  "subtask_id": "uuid",
  "dataset_id": "uuid",
  "criterion_id": "uuid",
  "prompt_text": "What is 2+2?",
  "expected_output": "4",
  "model_output": "The answer is 4.",
  "score": 0.0,                   // float 0..1
  "latency_ms": 523.4,
  "tokens_generated": 12,
  "first_token_ms": 89.2,
  "created_at": "2026-03-19T12:05:00Z"
}
```

---

## Appendix: Complete Endpoint Index

| # | Method | Path | Auth | Notes |
|---|---|---|---|---|
| 1 | `POST` | `/auth/register` | no | |
| 2 | `POST` | `/auth/login` | no | |
| 3 | `GET` | `/auth/me` | yes | |
| 4 | `POST` | `/models` | yes | New fields: `description`, `model_name`, `max_tokens` |
| 5 | `GET` | `/models` | yes | |
| 6 | `GET` | `/models/{id}` | yes | |
| 7 | `PUT` | `/models/{id}` | yes | |
| 8 | `POST` | `/models/{id}/test` | yes | **New endpoint** |
| 9 | `DELETE` | `/models/{id}` | yes | Status 204 |
| 10 | `POST` | `/datasets/upload` | yes | multipart/form-data |
| 11 | `POST` | `/datasets/mount` | yes | |
| 12 | `GET` | `/datasets` | yes | `?tag=&page=&page_size=` |
| 13 | `GET` | `/datasets/{id}` | yes | |
| 14 | `GET` | `/datasets/{id}/preview` | yes | `?limit=50` |
| 15 | `DELETE` | `/datasets/{id}` | yes | Status 204, must cascade |
| 16 | `POST` | `/criteria` | yes | |
| 17 | `GET` | `/criteria` | yes | |
| 18 | `GET` | `/criteria/{id}` | yes | |
| 19 | `PUT` | `/criteria/{id}` | yes | |
| 20 | `DELETE` | `/criteria/{id}` | yes | Status 204 |
| 21 | `POST` | `/criteria/test` | yes | |
| 22 | `POST` | `/tasks` | yes | `dataset_ids`/`criteria_ids` sent as arrays |
| 23 | `GET` | `/tasks` | yes | `?status_filter=` |
| 24 | `GET` | `/tasks/{id}` | yes | |
| 25 | `GET` | `/tasks/{id}/subtasks` | yes | |
| 26 | `POST` | `/tasks/{id}/pause` | yes | |
| 27 | `POST` | `/tasks/{id}/resume` | yes | |
| 28 | `POST` | `/tasks/{id}/cancel` | yes | |
| 29 | `GET` | `/results` | yes | `?task_id=&criterion_id=&page=&page_size=` |
| 30 | `GET` | `/results/leaderboard` | yes | `?criterion_id=` |
| 31 | `GET` | `/results/summary` | yes | `?task_id=` (required) |
| 32 | `GET` | `/results/errors` | yes | `?task_id=` (required) `&page=` |
| — | `GET` | `/health` | no | Returns `{"status": "ok"}` |

---

## Appendix: Key Backend Requirements from Frontend

1. **Dataset DELETE must remove the record** — not soft-delete or null fields. The row must not appear in `GET /datasets` after deletion. Cascade-delete `DatasetVersion` rows and clean up uploaded files.

2. **Model test endpoint** (`POST /models/{id}/test`) — Backend sends a minimal chat-completion-style POST to the model's `endpoint_url` with the stored `api_key`. Return `{ ok, message }`. Timeout at 15s.

3. **Model create accepts new optional fields** — `description` (string), `model_name` (string), `max_tokens` (int). These should be persisted and returned in responses. If the backend schema doesn't have these columns yet, either add them or silently ignore the extra fields (do not return 422).

4. **Task creation: `dataset_ids` / `criteria_ids` format** — Frontend sends JSON arrays `["uuid1", "uuid2"]`. Backend currently stores as comma-separated strings internally — that's fine, but the request body must accept arrays.

5. **Subtask `error_log`** — When a subtask fails, the `error_log` field should contain the error message/traceback. The frontend displays this prominently on failed task detail pages.

6. **No `api_key` in responses** — The `LLMModel` response must never include the `api_key` value. Exclude it from the serialization schema.
