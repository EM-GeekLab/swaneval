export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "data_admin" | "engineer" | "viewer";
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  source_type: "upload" | "huggingface" | "modelscope" | "server_path" | "preset";
  source_uri: string;
  format: string;
  tags: string;
  version: number;
  size_bytes: number;
  row_count: number;
  created_at: string;
}

export interface Criterion {
  id: string;
  name: string;
  type: "preset" | "regex" | "script" | "llm_judge";
  config_json: string;
  created_at: string;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  endpoint_url: string;
  model_type: "api" | "local" | "huggingface";
  description: string;
  model_name: string;
  max_tokens: number | null;
  created_at: string;
}

export interface EvalTask {
  id: string;
  name: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  model_id: string;
  dataset_ids: string;
  criteria_ids: string;
  params_json: string;
  repeat_count: number;
  seed_strategy: "fixed" | "random";
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface EvalSubtask {
  id: string;
  task_id: string;
  run_index: number;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress_pct: number;
  last_completed_index: number;
  error_log: string;
}

export interface EvalResult {
  id: string;
  task_id: string;
  subtask_id: string;
  dataset_id: string;
  criterion_id: string;
  prompt_text: string;
  expected_output: string;
  model_output: string;
  score: number;
  latency_ms: number;
  tokens_generated: number;
  first_token_ms: number;
  created_at: string;
}

export interface LeaderboardEntry {
  model_id: string;
  model_name: string;
  criterion_id: string;
  criterion_name: string;
  avg_score: number;
  total_prompts: number;
  avg_latency_ms: number;
}

export interface TaskSummaryEntry {
  criterion_id: string;
  criterion_name: string;
  avg_score: number;
  min_score: number;
  max_score: number;
  count: number;
  avg_latency_ms: number;
  avg_tokens: number;
}
