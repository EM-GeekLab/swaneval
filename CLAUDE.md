# SwanEVAL

Enterprise LLM evaluation platform. Manage datasets, define evaluation criteria, run evaluation tasks across models, and analyze results with charts/reports.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix), React Query, Zustand, Recharts, Zod, Axios |
| Backend | FastAPI, SQLModel, Alembic, Pydantic Settings, HTTPX |
| Data | PostgreSQL 14, Redis 7 |
| Infra | Docker Compose, uv (Python pkg manager) |

## Dev Setup

```bash
# Start Postgres + Redis
docker compose up -d postgres redis

# Backend
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
pnpm install
pnpm dev  # localhost:3000
```

**Env vars** (backend `.env`):
```
DATABASE_URL=postgresql://swaneval:swaneval@localhost:6001/swaneval
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=["http://localhost:3000"]
```

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app, CORS, lifespan
    config.py            # pydantic-settings config
    database.py          # async engine + session factory
    models/              # SQLModel table classes (1 file per domain)
    schemas/             # Pydantic request/response schemas
    api/
      deps.py            # get_db, get_current_user dependencies
      v1/                # route modules (1 file per domain)
    services/            # business logic (1 file per domain)
    tasks/               # background / scheduled tasks
  alembic/
    versions/            # migration files

frontend/
  app/
    layout.tsx           # root layout with providers
    page.tsx             # dashboard home
    datasets/            # /datasets pages
    criteria/            # /criteria pages
    tasks/               # /tasks pages
    results/             # /results pages
    admin/               # /admin (users & permissions)
  components/
    ui/                  # shadcn primitives (button, dialog, table, etc.)
    datasets/            # dataset-specific components
    criteria/            # criteria-specific components
    tasks/               # task-specific components
    results/             # charts, leaderboard, reports
    layout/              # sidebar, header, breadcrumb
  lib/
    api.ts               # Axios instance + request/response interceptors
    hooks/               # React Query hooks (1 file per domain)
    stores/              # Zustand stores
    types.ts             # shared TypeScript types
    utils.ts             # formatters, validators
```

## API Conventions

- Prefix all routes with `/api/v1/`
- RESTful: `GET /items`, `POST /items`, `GET /items/{id}`, `PUT /items/{id}`, `DELETE /items/{id}`
- Pagination: `?page=1&page_size=20` → return `{ items: [], total: int, page: int, page_size: int }`
- Auth: JWT in `Authorization: Bearer <token>` header. `get_current_user` dependency extracts user.
- Errors: `HTTPException` with `{ detail: str }`. Use status codes 400/401/403/404/422.
- File uploads: `multipart/form-data` via `UploadFile`.

## Database Schema

Use SQLModel classes with `table=True`. Always include `id` (UUID, primary key), `created_at`, `updated_at`. Use Alembic autogenerate for migrations: `uv run alembic revision --autogenerate -m "description"`.

### Core Tables

```
users           (id, username, email, hashed_password, role, is_active)
datasets        (id, name, description, source_type, source_uri, format, tags[], version, size_bytes, row_count, created_by → users)
dataset_versions(id, dataset_id → datasets, version, file_path, changelog, row_count)
criteria        (id, name, type[preset|regex|script|llm_judge], config_json, created_by → users)
models          (id, name, provider, endpoint_url, api_key_encrypted, model_type[local|api|huggingface])
eval_tasks      (id, name, status[pending|running|paused|completed|failed], model_id → models, dataset_ids[], criteria_ids[], params_json, repeat_count, seed_strategy, created_by → users, started_at, finished_at)
eval_subtasks   (id, task_id → eval_tasks, run_index, status, progress_pct, error_log)
eval_results    (id, task_id → eval_tasks, subtask_id → eval_subtasks, dataset_id, criterion_id, prompt_text, expected_output, model_output, score, latency_ms, tokens_generated, first_token_ms)
reports         (id, task_id → eval_tasks, type[performance|safety|cost|value], content_json, visibility, created_by → users)
permissions     (id, user_id → users, resource_type, resource_id, access_level[view|test|edit|admin])
```

---

## Module Build Instructions

Build each module in order. Each module = backend models + API routes + service layer + frontend pages.

### Module 1: Auth & Users

**Backend:**
- `models/user.py`: User table with hashed_password (bcrypt via `passlib`), role enum (admin, data_admin, engineer, viewer)
- `api/v1/auth.py`: `POST /auth/register`, `POST /auth/login` (return JWT), `GET /auth/me`
- `api/v1/users.py`: CRUD users (admin only), role assignment
- `services/auth.py`: JWT create/verify with `python-jose`, password hashing

**Frontend:**
- `/app/login/page.tsx`: login form
- Zustand `authStore`: token, user, login/logout actions
- Axios interceptor: attach token, handle 401 → redirect to login
- `components/layout/sidebar.tsx`: nav links filtered by user role

### Module 2: Dataset Management

**Backend:**
- `models/dataset.py`: Dataset + DatasetVersion tables
- `api/v1/datasets.py`:
  - `POST /datasets/upload` — file upload (JSONL/CSV/Parquet/Excel), parse + validate + store
  - `POST /datasets/import` — from HuggingFace/ModelScope URL, background download via Redis task queue
  - `POST /datasets/mount` — register server path (no copy)
  - `GET /datasets` — list with filters (tags, format, source)
  - `GET /datasets/{id}` — detail + versions
  - `GET /datasets/{id}/preview` — first 50 rows
  - `GET /datasets/{id}/stats` — row count, column distribution, size
- `services/dataset.py`: format detection, validation, versioning logic (auto-increment on re-import of same name)
- Presets: seed DB with references to standard datasets (GSM8K, MATH, BBH, HumanEval, MBPP, AlpacaEval, MT-Bench, LongBench)

**Frontend:**
- `/app/datasets/page.tsx`: table list with tag filters
- `/app/datasets/new/page.tsx`: tabbed import wizard (Upload / HuggingFace / Server Path)
- `/app/datasets/[id]/page.tsx`: detail view with version history, preview tab, stats tab
- Drag-and-drop upload zone component

### Module 3: Evaluation Criteria

**Backend:**
- `models/criterion.py`: Criterion table, `type` enum: `preset | regex | script | llm_judge`
- `config_json` stores type-specific config:
  - preset: `{ metric: "exact_match" | "perplexity" | "pass_at_k" | "bleu" | "rouge" }`
  - regex: `{ pattern: str, extract_group: int, match_mode: "exact"|"contains" }`
  - script: `{ script_path: str, entrypoint: str }`
  - llm_judge: `{ judge_model_id: uuid, system_prompt: str, dimensions: [{name, weight, rubric}], scale: int }`
- `api/v1/criteria.py`: CRUD + `POST /criteria/test` (dry-run against sample input/output pair)
- Presets: seed with Exact Match, Perplexity, Pass@k, BLEU, ROUGE, LLM-as-a-Judge, ELO Rating

**Frontend:**
- `/app/criteria/page.tsx`: list with type badges
- `/app/criteria/new/page.tsx`: type selector → dynamic form per type
- LLM Judge config: system prompt textarea, dimension builder (add/remove rows), rubric per dimension

### Module 4: Test Task Management

**Backend:**
- `models/eval_task.py`: EvalTask + EvalSubtask tables
- `api/v1/tasks.py`:
  - `POST /tasks` — create task from config wizard payload
  - `GET /tasks` — list with status filter
  - `GET /tasks/{id}` — detail + subtasks
  - `POST /tasks/{id}/pause`, `/resume`, `/cancel`
  - `GET /tasks/{id}/logs` — streaming SSE endpoint for live logs
- `services/task_runner.py`:
  - Enqueue task to Redis. Worker picks up, spawns subtasks.
  - Stability mode: if `repeat_count > 1`, create N subtasks with different seeds
  - Track progress per subtask (% complete, current prompt index)
  - On failure: save checkpoint (last prompt index) → support resume
- `tasks/worker.py`: Redis-based task consumer. Calls model endpoint, applies criteria, writes results.

**Frontend:**
- `/app/tasks/page.tsx`: task list with status badges, progress bars
- `/app/tasks/new/page.tsx`: 4-step wizard:
  1. Select model (dropdown from models registry)
  2. Select datasets (multi-select with tag filters)
  3. Set params (temperature, top_p, max_tokens, few-shot count, repeat count, seed strategy)
  4. Review & submit
- `/app/tasks/[id]/page.tsx`: live progress (SSE), subtask list, log viewer, pause/resume buttons
- Real-time progress via EventSource connected to SSE endpoint

### Module 5: Results & Visualization

**Backend:**
- `models/eval_result.py`: EvalResult table (per-prompt scores + latency metrics)
- `models/report.py`: Report table
- `api/v1/results.py`:
  - `GET /results?task_id=X` — paginated results with filters
  - `GET /results/leaderboard?criterion_id=X` — ranked models by score
  - `GET /results/chart-data` — aggregated data for chart rendering (accepts chart_type, model_ids, criterion_ids, group_by)
  - `GET /results/{id}/errors` — wrong answers with prompt + expected vs actual
- `api/v1/reports.py`:
  - `POST /reports/generate` — generate report (type: performance|safety|cost|value)
  - `GET /reports/{id}` — fetch report
  - `GET /reports/{id}/export?format=docx|html|csv` — export report
- `services/report_generator.py`: aggregate scores, compute statistics, format into structured JSON

**Frontend:**
- `/app/results/page.tsx`: tabs for Leaderboard | Charts | Reports
- Leaderboard tab: sortable table, criterion selector dropdown
- Charts tab — chart builder:
  - Bar chart: select models (multi) + criteria (multi) → grouped bar chart via Recharts
  - Radar chart: select one model + multiple criteria → radar chart
  - Line chart: token speed (models × concurrency levels) or cross-version comparison (model versions × single criterion)
- Reports tab: generate button → type selector → view/export
- Error analysis: clickable drill-down from score to individual prompt/response pairs
- Export: download buttons for DOCX, HTML, CSV

### Module 6: Scheduling & Monitoring

**Backend:**
- Use Redis as task queue (or `arq` / `rq` library on top of Redis)
- `api/v1/queue.py`:
  - `GET /queue/status` — running/pending/failed task counts
  - `GET /queue/workers` — worker status + GPU assignment
- `services/scheduler.py`:
  - Assign tasks to available GPU workers
  - Handle OOM/timeout: mark subtask failed, log error, allow resume
  - Checkpoint: store `last_completed_index` in eval_subtasks for resume
- Health check endpoint: `GET /health`

**Frontend:**
- Task queue dashboard (card metrics: running, queued, failed, completed)
- Worker status table (GPU id, current task, utilization)
- Error alerts with log snippets
- Resume button on failed tasks

---

## Permissions Model

Enforce in backend `deps.py` via dependency injection:

```python
def require_role(*roles: str):
    def dependency(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return Depends(dependency)
```

Resource-level permissions (datasets, reports): check `permissions` table for `(user_id, resource_type, resource_id)`.

| Role | Capabilities |
|------|-------------|
| admin | Full access, user management, all data |
| data_admin | CRUD datasets & criteria, view all results |
| engineer | Run tasks, view permitted datasets/results |
| viewer | View permitted results & reports only |

## Frontend Patterns

- **Data fetching**: React Query hooks in `lib/hooks/`. Query keys: `['datasets']`, `['datasets', id]`, etc. Mutations invalidate related queries.
- **State**: Zustand for auth + UI state (sidebar collapsed, active filters). Server state stays in React Query.
- **Forms**: Zod schemas for validation → `zodResolver` with react-hook-form. Reuse schema types as TS interfaces.
- **Components**: shadcn/ui primitives. Compose into domain components. Use `DataTable` pattern for all list views (sortable, filterable, paginated).
- **Error handling**: React Query `onError` → toast notification via shadcn Toast.
- **SSE**: `EventSource` in custom hook for live task progress updates.

## Verification Checklist

After building each module, verify:
1. `uv run ruff check backend/` — no lint errors
2. `cd frontend && pnpm build` — no TypeScript errors
3. `uv run alembic upgrade head` — migrations apply cleanly
4. Manual test: create resource via API → appears in frontend list → detail page loads
5. Permission check: viewer cannot access admin routes (expect 403)
