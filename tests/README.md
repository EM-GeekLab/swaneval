# EvalScope Pipeline Test Suite

## Files

| File | Description |
|------|-------------|
| `math_basic.jsonl` | 8 arithmetic questions (exact numeric answers) |
| `knowledge_qa.jsonl` | 6 factual Q&A (tests contains matching) |
| `instruction_follow.jsonl` | 5 instruction-following prompts (tests exact match) |
| `run_pipeline.sh` | End-to-end test script covering all 8 pipeline steps |

## Prerequisites

- Backend running at `localhost:8000`
- `jq` installed (`brew install jq`)
- An OpenAI-compatible model endpoint (Ollama, vLLM, OpenAI, etc.)

## Usage

### With Ollama (default)

```bash
# Start Ollama with a model
ollama run llama3

# Run the test
cd tests
bash run_pipeline.sh
```

### With OpenAI

```bash
cd tests
EVAL_MODEL_ENDPOINT="https://api.openai.com/v1/chat/completions" \
EVAL_MODEL_NAME="gpt-4o-mini" \
EVAL_MODEL_API_KEY="sk-..." \
EVAL_MODEL_PROVIDER="openai" \
bash run_pipeline.sh
```

### With vLLM / any OpenAI-compatible server

```bash
cd tests
EVAL_MODEL_ENDPOINT="http://localhost:8080/v1/chat/completions" \
EVAL_MODEL_NAME="Qwen/Qwen2-7B" \
EVAL_MODEL_PROVIDER="vllm" \
bash run_pipeline.sh
```

## What It Tests

| Step | Action | Validates |
|------|--------|-----------|
| 1 | Register user | `POST /auth/register` |
| 2 | Login + get token | `POST /auth/login`, `GET /auth/me` |
| 3 | Upload 3 datasets | `POST /datasets/upload`, `GET /datasets/{id}/preview` |
| 4 | Create 3 criteria | `POST /criteria`, `POST /criteria/test` |
| 5 | Register model | `POST /models` |
| 6 | Create eval task | `POST /tasks` (auto-launches background runner) |
| 7 | Poll progress | `GET /tasks/{id}`, `GET /tasks/{id}/subtasks` |
| 8 | View results | `GET /results/summary`, `GET /results/leaderboard`, `GET /results/errors`, `GET /results` |

---

## Frontend Walkthrough

Open http://localhost:3000 in your browser. Follow these steps in order.

### Step 1: Register & Login

1. You land on `/login`. Click **Register** at the bottom.
2. Fill in username, email, password. Click **Create account**.
3. You're switched back to the sign-in form with your username pre-filled. Enter password, click **Sign in**.
4. You arrive at the **Overview** dashboard. It shows zeros everywhere — that's expected.

### Step 2: Upload Datasets

1. Click **Datasets** in the sidebar.
2. Click the **Upload** button (top right).
3. In the dialog:
   - Click the file input, select `tests/math_basic.jsonl`.
   - Name: `Math Basic`
   - Tags: `math,arithmetic`
   - Click **Upload**.
4. The dataset appears in the table with row count and file size.
5. Click the **eye icon** to preview — you should see prompt/expected columns.
6. Repeat for `knowledge_qa.jsonl` (name: `Knowledge QA`, tags: `knowledge,qa`) and `instruction_follow.jsonl` (name: `Instruction Following`, tags: `instruction`).
7. You should now see 3 datasets in the table.

### Step 3: Create Evaluation Criteria

1. Click **Criteria** in the sidebar.
2. Click **New Criterion** (top right).
3. Create the first criterion:
   - Name: `Exact Match`
   - Type: **Preset Metric**
   - Metric: **Exact Match**
   - Click **Create**.
4. Create a second:
   - Name: `Contains Match`
   - Type: **Preset Metric**
   - Metric: **Contains**
   - Click **Create**.
5. Create a third:
   - Name: `Numeric Match`
   - Type: **Preset Metric**
   - Metric: **Numeric Closeness**
   - Click **Create**.
6. Optional: click the **flask icon** on any criterion to test it. Enter an expected value and an actual value, click **Run Test**, and see the score.

### Step 4: Register a Model

1. Click **Models** in the sidebar.
2. Click **Add Model** (top right).
3. Fill in the form. Examples:

   **Ollama (local):**
   - Name: `llama3`
   - Provider: `ollama`
   - Type: API
   - Endpoint: `http://localhost:11434/v1/chat/completions`
   - API Key: *(leave empty)*

   **OpenAI:**
   - Name: `gpt-4o-mini`
   - Provider: `openai`
   - Type: API
   - Endpoint: `https://api.openai.com/v1/chat/completions`
   - API Key: `sk-...`

4. Click **Add Model**. It appears in the table.

### Step 5: Create & Run an Evaluation Task

1. Click **Tasks** in the sidebar.
2. Click **New Task** (top right).
3. Fill in the dialog:
   - **Task Name**: `Full Eval — llama3` (or whatever your model is)
   - **Model**: select the model you just registered
   - **Datasets**: click each dataset chip to select it (they turn blue). Select all 3.
   - **Criteria**: click each criterion chip to select it. Select all 3.
   - **Temperature**: `0` (for deterministic output)
   - **Max Tokens**: `64`
   - **Repeat Count**: `1` (increase to test stability)
   - **Seed Strategy**: Fixed
4. Click **Create & Run**. The task appears in the table with status `pending` → `running`.
5. The table auto-refreshes every 5 seconds. Wait for status to become `completed`.

### Step 6: View Task Results

1. Click the **task name** (blue link) in the tasks table.
2. You see the task detail page:
   - **Config cards** at top: repeat count, seed strategy, temperature, max tokens.
   - **Subtask progress bars**: should show 100% if completed.
   - **Summary tab**: bar chart of average scores per criterion, plus a table with avg/min/max score, count, latency, and tokens.
   - **Errors tab**: lists every prompt where score < 1.0, showing prompt → expected → actual output. Use this to understand what the model got wrong.

### Step 7: View Leaderboard & Charts

1. Click **Results** in the sidebar.
2. **Leaderboard tab**: ranked table of models × criteria sorted by score. Shows avg score %, prompt count, and latency.
3. **Comparison tab**: grouped bar chart comparing models across criteria. (More useful after you've tested multiple models.)
4. **Radar tab**: radar chart showing each model's score per criterion. Useful for spotting strengths and weaknesses.
5. Use the **criterion filter** dropdown (top right) to narrow results to a single criterion.

### Step 8: Go Back to Overview

1. Click **Overview** in the sidebar.
2. The stat cards now show your real counts (3 datasets, 3 criteria, 1 model, 1 task).
3. Recent tasks list shows your completed task with a green `completed` badge. Click it to jump back to the detail page.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EVAL_MODEL_ENDPOINT` | `http://localhost:11434/v1/chat/completions` | OpenAI-compatible chat completions URL |
| `EVAL_MODEL_NAME` | `llama3` | Model name sent in API requests |
| `EVAL_MODEL_API_KEY` | *(empty)* | API key (if required) |
| `EVAL_MODEL_PROVIDER` | `ollama` | Provider label stored in DB |
