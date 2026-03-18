# EvalScope SDK 接入评估与实施方案（基于当前后端）

## 1. 目标与结论

本文基于当前后端实现与 `backend/TEST_GUIDE.md` 的描述，完成三件事：

1. 明确当前后端中哪些接口或模块是“硬编码 / 占位实现 / 假数据风格实现”。
2. 识别哪些技术实现与 evalscope SDK（v1.x）存在明显不契合。
3. 给出可执行的接入方案与分阶段开发清单。

核心结论：

- 当前后端是一个“自建评测内核”，并非 evalscope SDK 封装层。
- 现有 `TEST_GUIDE.md` 中“未来集成示例”使用 `run_eval + ARGS`，与 evalscope v1.x 主流用法（`TaskConfig + run_task`）已经不一致。
- 你可以保留现有 API 形态（前端基本无感），把执行内核替换为 evalscope 适配层；但任务模型与结果映射层必须改造。

## 2. 当前后端“硬编码/占位/假数据”盘点

以下内容为高优先级审计结果。

## 2.1 任务执行内核为手工实现（非 SDK）

位置：`app/services/task_runner.py`

现状：

- 手工读取数据集文件（仅 JSON/JSONL）。
- 手工拼 OpenAI Chat Completions 请求体并调用 endpoint。
- 手工按 row 逐条推理、逐 criterion 打分并写库。
- `first_token_ms` 直接近似为总延迟（非真实首 token 指标）。

判定：

- 这是完整自建执行链，不是 SDK 代理层。
- 这部分本应交给 evalscope 的模型适配、数据适配、评测流程、报告产出能力。

## 2.2 评估器存在明显占位实现

位置：`app/services/evaluators.py`

现状：

- 仅实现了 `exact_match / contains / regex / numeric`。
- `script` 与 `llm_judge` 在 dispatch 中直接返回 `0.0`。

判定：

- 明确属于占位逻辑。
- 与产品设计中的 script / llm_judge 能力不一致。

## 2.3 模型调用路径硬编码为 OpenAI 兼容格式

位置：`app/services/task_runner.py` 的 `_call_model`

现状：

- 请求 payload 固定为 `messages` 结构。
- 参数白名单仅保留少量字段（temperature/max_tokens/top_p/seed）。
- 返回解析固定 `choices[0].message.content`。

判定：

- 对厂商协议差异、回包差异、多模态、工具调用等支持极弱。
- 与 evalscope 支持的多 eval_type / 多后端能力不匹配。

## 2.4 数据集格式支持与目标能力不匹配

位置：`app/api/v1/datasets.py` 与 `task_runner.py`

现状：

- 文档中提到 CSV/Parquet/Excel，但当前读取逻辑核心仅 JSON/JSONL。
- 样本字段读取依赖 `prompt/input/question` 与 `expected/output/answer` 的硬编码 fallback。

判定：

- 属于“弱约定 + 硬编码映射”。
- 与 evalscope 的标准数据适配（`dataset_args`、预置 benchmark、结构化格式）不一致。

## 2.5 任务配置存储方式不利于 SDK 映射

位置：`app/models/eval_task.py`

现状：

- `dataset_ids`、`criteria_ids` 用逗号分隔字符串存储。
- `params_json` 用字符串存储。

判定：

- 这会增加配置组装与校验复杂度。
- 对 `TaskConfig` 的结构化映射不友好，易引入解析错误。

## 2.6 调度与可恢复机制为轻量实现

位置：`app/api/v1/tasks.py`、`app/services/task_runner.py`

现状：

- 通过 `asyncio.create_task` 启动后台任务。
- pause/cancel 依赖数据库状态轮询。
- resume 仍旧重启本地 runner 逻辑。

判定：

- 适合 MVP，不适合重任务、进程隔离、稳定可恢复场景。
- 与 evalscope 自身输出目录/进度追踪机制尚未打通。

## 3. 与 evalscope SDK 的不契合点（按严重程度）

## 3.1 P0：`TEST_GUIDE.md` 中 SDK 示例 API 过时

位置：`backend/TEST_GUIDE.md` 第 6 节

现状：

- 文档示例使用 `from evalscope import run_eval, ARGS`。

问题：

- evalscope v1.x 公开主路径已转向 `TaskConfig + run_task`。
- 若按旧示例开发，后续实现会偏离官方能力面与参数体系。

建议：

- 统一切换为：
  - `from evalscope.config import TaskConfig`
  - `from evalscope.run import run_task`

## 3.2 P0：当前“按 criterion_id 逐条打分写库”的数据模型与 SDK 报告模型不一致

现状：

- 你的系统以 `criterion_id` 为核心主维度。
- evalscope 输出通常是“dataset/subset/metric/report/review”结构。

问题：

- 两边主键和分层语义不同，无法直接一对一落库。

建议：

- 引入“结果归一化层”：把 evalscope 报告中的 metric 结果映射到本地 `criterion` 体系。
- 必要时新增映射表（例如 `criterion_metric_bindings`）。

## 3.3 P0：执行模型不应继续绑在 FastAPI 事件循环内

现状：

- 通过 `asyncio.create_task` 在 API 进程内跑重任务。

问题：

- SDK 任务可能耗时长、I/O 与 CPU 占用高；易影响 API 服务稳定性。

建议：

- 使用独立 worker 进程执行 evalscope（RQ/Arq/Celery/自建进程池均可）。
- API 层仅负责入队、状态查询、控制命令。

## 3.4 P1：当前“手工模型请求参数”覆盖面不足

现状：

- 仅透传少量 generation 参数。

问题：

- evalscope 支持更完整参数体系：`generation_config`、`dataset_args`、`judge_model_args`、`eval_type`、`eval_backend` 等。

建议：

- 前端参数结构保持不变，后端增加“参数翻译层”映射到 `TaskConfig`。

## 3.5 P1：进度与恢复机制未利用 SDK 原生输出

现状：

- 本地记录 `progress_pct` 与 `last_completed_index`。

问题：

- 无法复用 evalscope 的输出目录和 `progress.json` 语义。

建议：

- 启用 `enable_progress_tracker`。
- 将任务目录（`work_dir`）与任务 ID 绑定。
- 状态接口优先读 SDK 进度文件，再回写数据库快照。

## 4. 建议的接入架构（保持现有 API 基本不变）

## 4.1 新增适配层

建议新增模块：

- `app/services/evalscope_adapter.py`
- `app/services/evalscope_mapper.py`
- `app/services/evalscope_result_ingestor.py`

职责：

- Mapper：`EvalTask + Model + Dataset + Criterion -> TaskConfig`。
- Adapter：执行 `run_task(task_cfg)`，并管理运行目录与异常。
- Ingestor：解析 `reports/reviews/predictions/progress.json` 并写回本地表。

## 4.2 执行链路

1. `POST /tasks` 写入任务后，不直接 `asyncio.create_task` 执行。
2. 改为发送到 worker 队列（task_id + 快照参数）。
3. worker 调用 evalscope 运行。
4. 周期性读取 `progress.json` 更新 `eval_subtasks`。
5. 完成后导入结果并标记任务状态。

## 4.3 数据映射建议

最小可行映射：

- 本地 `EvalTask.params_json` 拆分并映射到：
  - `eval_type`
  - `generation_config`
  - `dataset_args`
  - `judge_*`
- 本地 `Dataset.source_uri` 映射到 `dataset_args[dataset_name].dataset_id/local_path`。
- 本地 `Criterion` 增加对 evalscope metric 的绑定配置（避免硬编码）。

## 5. 分阶段实施计划

## Phase 0（文档与契约）

- 更新 `TEST_GUIDE.md` 第 6 节，替换旧版示例 API。
- 定义内部统一任务契约：本地字段到 `TaskConfig` 的映射规范。

产出：

- 《字段映射表 v1》
- 《错误码与异常回传规范》

## Phase 1（最小接入）

- 新增 evalscope adapter。
- 支持单模型 + 单数据集 + 基础 metric 跑通。
- 任务仍可沿用原有接口查询状态。

验收：

- 创建任务后可产出 SDK 报告并入库。

## Phase 2（进度与恢复）

- 接入 `enable_progress_tracker`。
- 任务状态接口改为“数据库状态 + progress.json 联合视图”。

验收：

- 前端可实时查看更准确进度。

## Phase 3（能力扩展）

- 接入 `judge_model_args` 与 LLM-as-a-Judge。
- 接入代码类任务 sandbox 配置（如需要）。
- 增加 benchmark 级配置与聚合策略（`repeats`、`aggregation`）。

验收：

- 覆盖 script/judge 等现有占位能力缺口。

## 6. 当前最不契合 SDK 的实现（必须优先重构）

1. 任务执行与 API 进程耦合（`asyncio.create_task`）。
2. `criterion` 维度与 evalscope metric/report 维度的模型不一致。
3. `dataset_ids/criteria_ids` 的字符串化存储。
4. `script` / `llm_judge` 返回 0.0 的占位实现。
5. 文档中的旧版 SDK 示例（`run_eval + ARGS`）。

## 7. 已获取文档与仍需补充的文档

已获取公开资料（可用）：

- PyPI 项目页（evalscope 1.5.0）
- ReadTheDocs（Quick Start / Parameters / Custom Dataset）
- GitHub 仓库公开代码与示例

仍建议你手动补充（如果你有内部文档或固定版本约束）：

1. 你计划锁定的 evalscope 版本 API 冻结说明（例如 1.5.x 的稳定字段）。
2. `run_task` 返回值在你目标后端模式下的完整 schema（不仅是报告文件）。
3. reports/reviews/predictions 文件结构在未来小版本中的兼容承诺。
4. service API（若你准备走 evalscope service 模式而非直接 Python SDK 调用）的协议文档。

如果你把这些文档给我，我可以继续给出“可直接编码”的数据库迁移脚本、适配器接口定义与首批 PR 切分。

## 8. 参考备注

- 当前仓库后端已具备任务、结果、鉴权、基础数据管理，适合采用“内核替换式接入”（保留 API，替换执行引擎）。
- 推荐先实现 Native backend 的稳定闭环，再扩展 OpenCompass/VLMEvalKit/RAGEval。
