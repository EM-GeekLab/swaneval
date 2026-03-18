#!/usr/bin/env bash
#
# EvalScope GUI — Full Pipeline Test
#
# Prerequisites:
#   - Backend running at localhost:8000
#   - jq installed (brew install jq)
#
# Usage:
#   cd tests && bash run_pipeline.sh
#
# This script walks through every step of an evaluation:
#   1. Register a user
#   2. Login and obtain token
#   3. Upload 3 datasets
#   4. Create 3 evaluation criteria
#   5. Register a model
#   6. Create an evaluation task
#   7. Poll task until completion
#   8. View results: summary, leaderboard, errors
#
set -euo pipefail

API="http://localhost:8000/api/v1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; C='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${G}✓ $1${NC}"; }
info() { echo -e "${C}→ $1${NC}"; }
fail() { echo -e "${R}✗ $1${NC}"; exit 1; }

# ─── Step 1: Register ────────────────────────────────────────────────
info "Step 1: Registering user 'testuser'..."
REG=$(curl -s -w "\n%{http_code}" -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@evalscope.dev","password":"testpass123","role":"admin"}')
REG_CODE=$(echo "$REG" | tail -1)
REG_BODY=$(echo "$REG" | sed '$d')
if [ "$REG_CODE" = "201" ]; then
  ok "Registered ($(echo "$REG_BODY" | jq -r .username))"
elif [ "$REG_CODE" = "409" ]; then
  ok "User already exists, continuing"
else
  fail "Register failed ($REG_CODE): $REG_BODY"
fi

# ─── Step 2: Login ───────────────────────────────────────────────────
info "Step 2: Logging in..."
LOGIN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}')
TOKEN=$(echo "$LOGIN" | jq -r .access_token)
[ "$TOKEN" != "null" ] && [ -n "$TOKEN" ] || fail "Login failed: $LOGIN"
ok "Got token: ${TOKEN:0:20}..."
AUTH="Authorization: Bearer $TOKEN"

# Verify token works
ME=$(curl -s -H "$AUTH" "$API/auth/me")
ok "Authenticated as: $(echo "$ME" | jq -r '.username + " (" + .role + ")"')"

# ─── Step 3: Upload Datasets ─────────────────────────────────────────
info "Step 3: Uploading 3 datasets..."

upload_dataset() {
  local file="$1" name="$2" tags="$3"
  local RES=$(curl -s -H "$AUTH" -X POST "$API/datasets/upload" \
    -F "file=@${SCRIPT_DIR}/$file" \
    -F "name=$name" \
    -F "tags=$tags")
  local ID=$(echo "$RES" | jq -r .id)
  [ "$ID" != "null" ] && [ -n "$ID" ] || fail "Upload $name failed: $RES"
  ok "  $name → $ID ($(echo "$RES" | jq -r .row_count) rows)"
  echo "$ID"
}

DS_MATH=$(upload_dataset "math_basic.jsonl" "Math Basic" "math,arithmetic")
DS_QA=$(upload_dataset "knowledge_qa.jsonl" "Knowledge QA" "knowledge,qa")
DS_INST=$(upload_dataset "instruction_follow.jsonl" "Instruction Following" "instruction,compliance")

# Preview first dataset
info "  Previewing 'Math Basic'..."
PREVIEW=$(curl -s -H "$AUTH" "$API/datasets/${DS_MATH}/preview?limit=3")
echo "$PREVIEW" | jq -r '.rows[:3][] | "    \(.prompt) → \(.expected)"'

# ─── Step 4: Create Criteria ─────────────────────────────────────────
info "Step 4: Creating 3 evaluation criteria..."

create_criterion() {
  local name="$1" type="$2" config="$3"
  local RES=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
    -X POST "$API/criteria" \
    -d "{\"name\":\"$name\",\"type\":\"$type\",\"config_json\":$config}")
  local ID=$(echo "$RES" | jq -r .id)
  [ "$ID" != "null" ] && [ -n "$ID" ] || fail "Create criterion $name failed: $RES"
  ok "  $name ($type) → $ID"
  echo "$ID"
}

CRIT_EXACT=$(create_criterion "Exact Match" "preset" '"{\"metric\":\"exact_match\"}"')
CRIT_CONTAINS=$(create_criterion "Contains Match" "preset" '"{\"metric\":\"contains\"}"')
CRIT_NUMERIC=$(create_criterion "Numeric Match" "preset" '"{\"metric\":\"numeric\"}"')

# Test a criterion
info "  Testing 'Exact Match' criterion..."
TEST_RES=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/criteria/test" \
  -d "{\"criterion_id\":\"$CRIT_EXACT\",\"prompt\":\"test\",\"expected\":\"hello\",\"actual\":\"hello\"}")
ok "  Test score: $(echo "$TEST_RES" | jq .score)"

# ─── Step 5: Register Model ──────────────────────────────────────────
info "Step 5: Registering model..."

# NOTE: Replace this with your actual model endpoint and API key.
# This uses OpenAI-compatible format. Works with:
#   - OpenAI: https://api.openai.com/v1/chat/completions
#   - Ollama: http://localhost:11434/v1/chat/completions
#   - vLLM:   http://localhost:8080/v1/chat/completions
#   - Any OpenAI-compatible API

MODEL_ENDPOINT="${EVAL_MODEL_ENDPOINT:-http://localhost:11434/v1/chat/completions}"
MODEL_NAME="${EVAL_MODEL_NAME:-llama3}"
MODEL_API_KEY="${EVAL_MODEL_API_KEY:-}"
MODEL_PROVIDER="${EVAL_MODEL_PROVIDER:-ollama}"

MODEL_RES=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/models" \
  -d "{\"name\":\"$MODEL_NAME\",\"provider\":\"$MODEL_PROVIDER\",\"endpoint_url\":\"$MODEL_ENDPOINT\",\"api_key\":\"$MODEL_API_KEY\",\"model_type\":\"api\"}")
MODEL_ID=$(echo "$MODEL_RES" | jq -r .id)
[ "$MODEL_ID" != "null" ] && [ -n "$MODEL_ID" ] || fail "Model registration failed: $MODEL_RES"
ok "Registered: $MODEL_NAME ($MODEL_PROVIDER) → $MODEL_ID"

# ─── Step 6: Create Evaluation Task ──────────────────────────────────
info "Step 6: Creating evaluation task..."

TASK_RES=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$API/tasks" \
  -d "{
    \"name\": \"Pipeline Test — $MODEL_NAME\",
    \"model_id\": \"$MODEL_ID\",
    \"dataset_ids\": [\"$DS_MATH\", \"$DS_QA\", \"$DS_INST\"],
    \"criteria_ids\": [\"$CRIT_EXACT\", \"$CRIT_CONTAINS\", \"$CRIT_NUMERIC\"],
    \"params_json\": \"{\\\"temperature\\\": 0.0, \\\"max_tokens\\\": 64}\",
    \"repeat_count\": 1,
    \"seed_strategy\": \"fixed\"
  }")
TASK_ID=$(echo "$TASK_RES" | jq -r .id)
[ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ] || fail "Task creation failed: $TASK_RES"
ok "Task created: $TASK_ID (status: $(echo "$TASK_RES" | jq -r .status))"

# ─── Step 7: Poll Until Complete ──────────────────────────────────────
info "Step 7: Waiting for task to complete..."

for i in $(seq 1 120); do
  TASK_STATUS=$(curl -s -H "$AUTH" "$API/tasks/$TASK_ID" | jq -r .status)
  case "$TASK_STATUS" in
    completed)
      ok "Task completed!"
      break
      ;;
    failed)
      # Show subtask errors
      SUBTASKS=$(curl -s -H "$AUTH" "$API/tasks/$TASK_ID/subtasks")
      echo "$SUBTASKS" | jq -r '.[] | select(.error_log != "") | .error_log'
      fail "Task failed"
      ;;
    running|pending)
      # Show progress
      SUBTASKS=$(curl -s -H "$AUTH" "$API/tasks/$TASK_ID/subtasks")
      PCT=$(echo "$SUBTASKS" | jq -r '.[0].progress_pct // 0')
      printf "\r  Progress: %.0f%%   " "$PCT"
      sleep 2
      ;;
    *)
      fail "Unexpected status: $TASK_STATUS"
      ;;
  esac
done
echo ""
[ "$TASK_STATUS" = "completed" ] || fail "Task did not complete within timeout"

# ─── Step 8: View Results ─────────────────────────────────────────────
info "Step 8: Viewing results..."

echo ""
echo -e "${Y}━━━ Task Summary ━━━${NC}"
SUMMARY=$(curl -s -H "$AUTH" "$API/results/summary?task_id=$TASK_ID")
echo "$SUMMARY" | jq -r '.[] | "  \(.criterion_name): avg=\(.avg_score|tostring|.[:6])  count=\(.count)  latency=\(.avg_latency_ms|tostring|.[:7])ms"'

echo ""
echo -e "${Y}━━━ Leaderboard ━━━${NC}"
LEADER=$(curl -s -H "$AUTH" "$API/results/leaderboard")
echo "$LEADER" | jq -r '.[] | "  #\(.model_name) — \(.criterion_name): \((.avg_score*100|tostring|.[:5]))%  (\(.total_prompts) prompts, \(.avg_latency_ms|tostring|.[:7])ms avg)"'

echo ""
echo -e "${Y}━━━ Error Analysis (score < 1.0) ━━━${NC}"
ERRORS=$(curl -s -H "$AUTH" "$API/results/errors?task_id=$TASK_ID&page_size=10")
ERROR_COUNT=$(echo "$ERRORS" | jq length)
echo "  $ERROR_COUNT errors found"
echo "$ERRORS" | jq -r '.[:5][] | "  [\(.score)] \(.prompt_text|.[:50]) → expected: \(.expected_output|.[:20]) got: \(.model_output|.[:30])"'

echo ""
echo -e "${Y}━━━ Raw Results (first 5) ━━━${NC}"
RESULTS=$(curl -s -H "$AUTH" "$API/results?task_id=$TASK_ID&page_size=5")
echo "$RESULTS" | jq -r '.[] | "  score=\(.score) latency=\(.latency_ms|tostring|.[:7])ms tokens=\(.tokens_generated) prompt=\(.prompt_text|.[:40])..."'

echo ""
echo -e "${G}━━━ Pipeline test complete! ━━━${NC}"
echo ""
echo "  Task ID:  $TASK_ID"
echo "  View in UI:  http://localhost:3000/tasks/$TASK_ID"
