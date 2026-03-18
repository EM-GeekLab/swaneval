# SDK 与真实 API 调用接口层现状确认

更新时间：2026-03-19

## 1. 目的与范围

本文用于确认当前后端在以下两类能力上的接口层逻辑：

1. EvalScope SDK 接入链路
2. 真实模型 API 直连链路（OpenAI-compatible + Anthropic-compatible）

覆盖范围：任务执行、模型连通性探测、评估器对外调用、结果回写、测试验证。

## 2. 关键结论

1. 已实现 SDK 路径与原生路径双轨执行，按任务参数显式切换。
2. 已实现真实 API 调用，不依赖 mock；并支持 Anthropic 风格端点自动归一化。
3. 凭证策略已切换为“环境注入 + 运行时必填校验”，不存在 EMPTY 占位回退。
4. 已有真实端到端测试与集成测试（可自动拉起后端）。

## 3. 调用入口与分流

### 3.1 任务入口

入口：app/api/v1/tasks.py 的 POST /tasks

逻辑：

1. 创建任务记录后使用 asyncio.create_task 启动后台执行。
2. 执行函数为 app/services/task_runner.py 的 run_task。
3. run_task 根据 params_json 决定执行分支：

- use_evalscope=true 或 runner=evalscope：进入 SDK 分支
- 否则：进入原生直连模型分支

分流函数：\_should_use_evalscope。

### 3.2 模型连通性入口

入口：app/api/v1/models.py 的 POST /models/{model_id}/test

逻辑：

1. 读取模型配置（model_name、endpoint_url、api_key）。
2. 若模型字段为空，回退到 settings.DEFAULT*MODEL*\*。
3. 调用 app/services/model_connectivity.py 的 test_model_connectivity。
4. 返回统一结构：{ ok: bool, message: str }。

说明：虽然 route 层有 settings 回退，但当前默认值为空字符串，因此未配置时会 fail-fast 返回缺失项错误。

## 4. SDK 接口层确认

对应文件：app/services/evalscope_adapter.py + app/services/task_runner.py。

### 4.1 数据适配

convert_dataset_to_general_qa_jsonl：

1. 支持输入字段 query/prompt/input/question。
2. 支持目标字段 response/expected/output/answer。
3. 转为 EvalScope general_qa JSONL。

### 4.2 TaskConfig 构建

build_evalscope_task_config：

1. 通过 evalscope.config.TaskConfig 构建任务。
2. generation_config 映射 temperature/max_tokens/top_p/seed。
3. repeats 使用 max(1, repeat_count)。
4. api_key 为空直接抛 ValueError（强制真实凭证）。

### 4.3 执行与结果回写

\_run_task_with_evalscope（task_runner）：

1. 生成 work_dir：data/evalscope_outputs/{task_id}。
2. 在线程中运行 run_evalscope_task（包装 evalscope.run.run_task）。
3. 使用 ingest_evalscope_results 解析产物并映射到 EvalResult。
4. 若无样本级产物，则按输入 JSONL 回退生成基础结果行（score 用 default_score）。

## 5. 真实模型 API 接口层确认

对应文件：app/services/task_runner.py 与 app/services/model_connectivity.py。

### 5.1 端点与协议兼容

1. 识别 Anthropic 类端点：/apps/anthropic 或 /v1/messages。
2. 若是 Anthropic 类且未带 /v1/messages，则自动补齐。
3. Anthropic 模式会增加请求头 anthropic-version: 2023-06-01。

### 5.2 凭证与必填校验

在任务运行调用 \_call_model 时：

1. api_key：model.api_key 或 settings.DEFAULT_MODEL_API_KEY；为空则抛错。
2. endpoint_url：model.endpoint_url 或 settings.DEFAULT_MODEL_ENDPOINT_URL；为空则抛错。
3. model_name：model.model_name 或 model.name 或 settings.DEFAULT_MODEL_NAME；为空则抛错。

结论：当前是 fail-fast，不会静默降级到假调用。

### 5.3 响应解析

1. OpenAI-compatible：读取 choices[0].message.content 与 completion_tokens。
2. Anthropic-compatible：读取 content[].text 与 output_tokens。

## 6. 评估器真实调用确认

对应文件：app/services/evaluators.py。

1. script 类型已实现动态加载脚本并执行 entrypoint，不再是占位 0 分。
2. llm_judge 类型已实现真实 HTTP 调用，支持 OpenAI/Anthropic 返回解析。
3. llm_judge 同样强制 endpoint/model/api_key 必填。

## 7. 配置注入策略确认

对应文件：app/config.py。

1. DEFAULT_MODEL_PROVIDER
2. DEFAULT_MODEL_ENDPOINT_URL
3. DEFAULT_MODEL_NAME
4. DEFAULT_MODEL_API_KEY

以上默认值均为空字符串，意味着：

1. 允许环境变量注入默认模型配置。
2. 未注入时按运行时必填校验失败，不存在内置真实密钥。

## 8. 测试与验证证据

### 8.1 单元测试

1. tests/test_evalscope_adapter.py：SDK 适配器分支与错误处理。
2. tests/test_model_connectivity.py：连通性探测、端点归一化、fail-fast。
3. tests/test_evaluators.py：script 与 llm_judge 真实执行路径。
4. tests/test_evalscope_result_ingestor.py：EvalScope 产物解析和回退逻辑。
5. tests/test_models_api.py：/models/{id}/test 路由行为。

### 8.2 真实 E2E/集成测试

文件：tests/test_real_model_api_e2e.py

1. test_real_model_api_end_to_end：对已启动后端执行真实模型端到端测试。
2. test_real_model_api_integration_with_local_backend：测试内自动拉起后端再执行真实端到端测试。
3. 门禁环境变量：RUN_REAL_E2E=1。
4. 集成模式额外门禁：RUN_REAL_E2E_INTEGRATION=1。
5. 必填环境变量：E2E_MODEL_ENDPOINT、E2E_MODEL_NAME、E2E_MODEL_API_KEY。

## 9. 当前边界与注意事项

1. /tasks 使用 asyncio.create_task 在 API 进程内执行，尚非独立 worker 架构。
2. EvalScope 分支当前以“单数据集 + 首个 criterion”为最小接入实现。
3. task_runner 的 \_call_model 异常会返回 [ERROR] 文本并继续结果写入，便于审计失败样本。
4. /models/{id}/test 的缺参行为为 ok=false + message，不抛 HTTP 4xx（由服务层返回可读错误信息）。

## 10. 建议的日常验收命令

外部服务模式：

python -m unittest tests/test_real_model_api_e2e.py

集成模式（自动起后端）建议：

RUN_REAL_E2E=1 RUN_REAL_E2E_INTEGRATION=1 python -m unittest tests/test_real_model_api_e2e.py

说明：请确保同时提供真实模型环境变量，否则测试会按设计失败并提示缺失项。
