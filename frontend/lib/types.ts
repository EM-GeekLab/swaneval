export interface User {
  id: string;
  username: string;
  email: string;
  nickname: string;
  role: "admin" | "data_admin" | "engineer" | "viewer";
  is_active: boolean;
  hf_token_set?: boolean;
  hf_token_masked?: string;
  ms_token_set?: boolean;
  ms_token_masked?: string;
}

export interface UserTokensStatus {
  hf_token_set: boolean;
  ms_token_set: boolean;
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
  auto_update: boolean;
  update_interval_hours: number;
  last_synced_at: string | null;
  sync_status: string;
  hf_dataset_id: string;
}

export interface Criterion {
  id: string;
  name: string;
  type: "preset" | "regex" | "sandbox" | "llm_judge";
  config_json: string;
  created_at: string;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  endpoint_url: string;
  model_type: "api" | "local" | "huggingface" | "modelscope";
  api_format: "openai" | "anthropic";
  description: string;
  model_name: string;
  max_tokens: number | null;
  created_at: string;
  deploy_status: string;
  cluster_id: string | null;
  source_model_id: string;
  last_test_at: string | null;
  last_test_ok: boolean | null;
}

export interface PlaygroundResponse {
  output: string;
  latency_ms: number;
  tokens_generated: number;
  model_name: string;
}

export interface JudgeTemplate {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  dimensions: string;
  scale: number;
  is_builtin: boolean;
  created_at: string;
}

export interface EvalTask {
  id: string;
  name: string;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  model_id: string;
  model_name: string;
  dataset_ids: string;
  criteria_ids: string;
  params_json: string;
  repeat_count: number;
  seed_strategy: "fixed" | "random";
  gpu_ids: string;
  env_vars: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface EvalSubtask {
  id: string;
  task_id: string;
  run_index: number;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
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
  is_valid: boolean;
  error_category: string | null;
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

export interface ExternalBenchmark {
  id: string;
  model_name: string;
  provider: string;
  benchmark_name: string;
  score: number;
  score_display: string;
  source_url: string;
  source_platform: string;
  notes: string;
}

export interface PresetDataset {
  name: string;
  description: string;
  source: string;
  source_id: string;
  /** @deprecated use source_id */
  hf_id?: string;
  subset: string;
  split: string;
  format: string;
  tags: string;
}

export interface PresetCriterion {
  name: string;
  type: string;
  config_json: string;
  description: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
  member_count: number;
}

export interface ResourceAcl {
  id: string;
  resource_type: string;
  resource_id: string;
  grantee_type: string;
  grantee_id: string;
  access_level: string;
}

export interface ComputeCluster {
  id: string;
  name: string;
  description: string;
  api_server_url: string;
  namespace: string;
  status: string;
  status_message: string;
  gpu_count: number;
  gpu_type: string;
  gpu_available: number;
  cpu_total_millicores: number;
  memory_total_bytes: number;
  node_count: number;
  vllm_cache_ready: boolean;
  last_probed_at: string | null;
  created_at: string;
}

export interface ClusterNode {
  name: string;
  gpu_count: number;
  gpu_type: string;
  cpu_millicores: number;
  memory_bytes: number;
  status: string;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: number;
  file_path: string;
  changelog: string;
  row_count: number;
  size_bytes: number;
  format: string;
  created_at: string;
}

export interface SyncLog {
  id: string;
  dataset_id: string;
  triggered_by: string;
  status: string;
  old_version: number;
  new_version: number | null;
  old_row_count: number;
  new_row_count: number | null;
  error_message: string;
  duration_ms: number;
  created_at: string;
}

export interface DatasetStats {
  row_count: number;
  column_count: number;
  size_bytes: number;
  columns: ColumnStats[];
}

export interface ColumnStats {
  name: string;
  dtype: string;
  null_count: number;
  null_pct: number;
  unique_count: number;
  avg_text_len: number | null;
  min_text_len: number | null;
  max_text_len: number | null;
  top_values: { value: string; count: number }[];
  sample_values: string[];
}

export interface PreflightResult {
  source_type: string;
  format: string;
  row_count: number;
  size_bytes: number;
  columns: string[];
  sample_rows: Record<string, unknown>[];
  field_types: Record<string, string>;
  warnings: string[];
  preflight_token: string;
}
