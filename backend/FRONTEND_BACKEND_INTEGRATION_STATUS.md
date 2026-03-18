# 后端-前端对接现状评估与下一步开发规划

## 1. 评估基线

本评估基于以下两份基线：

1. API 对接规范：API_SPEC.md
2. 原始模块计划：CLAUDE.md（Module 1~6）

并结合当前实现代码交叉核对：

- 后端路由：backend/app/api/v1/\*.py
- 后端 Schema/Model：backend/app/schemas/_.py, backend/app/models/_.py
- 前端请求层：frontend/lib/hooks/\*.ts
- 前端页面层：frontend/app/(dashboard)/\*_/_.tsx, frontend/app/login/page.tsx

---

## 2. 已接通（可稳定联调）

以下接口已实现，且前端已有调用路径：

### 2.1 Auth

- POST /auth/register
- POST /auth/login
- GET /auth/me

现状：已与登录/注册页面接通。

### 2.2 Models（基础 CRUD）

- POST /models
- GET /models
- GET /models/{id}
- PUT /models/{id}
- DELETE /models/{id}

现状：前端模型列表、新增、删除已接通。

### 2.3 Datasets（当前页面能力范围内）

- POST /datasets/upload
- POST /datasets/mount
- GET /datasets
- GET /datasets/{id}
- GET /datasets/{id}/preview
- DELETE /datasets/{id}

现状：前端数据集上传、列表、预览、删除已接通。

### 2.4 Criteria

- POST /criteria
- GET /criteria
- GET /criteria/{id}
- PUT /criteria/{id}
- DELETE /criteria/{id}
- POST /criteria/test

现状：前端准则列表、新建、删除、测试已接通。

### 2.5 Tasks

- POST /tasks
- GET /tasks
- GET /tasks/{id}
- GET /tasks/{id}/subtasks
- POST /tasks/{id}/pause
- POST /tasks/{id}/resume
- POST /tasks/{id}/cancel

现状：前端任务创建、列表、详情、暂停/恢复/取消已接通。

### 2.6 Results

- GET /results
- GET /results/leaderboard
- GET /results/summary
- GET /results/errors

现状：前端结果页和任务详情内统计/错误列表已接通。

---

## 3. 未接通（可做，需补齐实现）

### 3.1 API_SPEC 明确要求但后端未实现

1. POST /models/{id}/test 未实现

- 影响：前端无法对模型端点做连通性测试。
- 计划动作：新增路由 + 15s 超时请求 + {ok, message} 返回体。

2. 模型扩展字段 description/model_name/max_tokens 未落库

- 影响：API_SPEC 新字段无法持久化与回显。
- 计划动作：模型表加列、Schema 增字段、路由读写支持、Alembic 迁移。

3. Dataset 删除未完成“文件清理 + 版本级联”

- 影响：可能出现磁盘残留与版本脏数据。
- 计划动作：删除时清理 source_type=upload 文件；明确 DatasetVersion 删除策略（DB 级级联或应用层删除）。

4. Task 创建行为与规范不完全一致

- 规范要求：创建任务时按 repeat_count 预建 subtasks。
- 当前实现：subtasks 主要在运行时创建；EvalScope 分支固定创建 1 个子任务。
- 影响：前端任务详情在 pending 早期可能看不到预期子任务数量。

### 3.2 已有后端能力，但与原计划相比仍缺少联调入口

1. 角色权限未真正落地到各业务路由

- 目前仅有 get_current_user，require_role 未在资源路由普遍应用。

2. 前端侧“按角色过滤导航”未实现

- 原计划要求 Sidebar 按 role 显示菜单，当前为固定菜单。

---

## 4. 当前阶段“完全不可能直接接通”的项（含 SDK 边界分析）

这里的“不可能”分为两类：

1. 工程侧不可能：在不做数据库迁移/任务架构升级/新增服务的前提下无法接通。
2. SDK 能力侧不可能：即使接入 EvalScope SDK，也无法直接提供某些平台能力，需要我们在业务层二次封装。

3. 模型扩展字段完整对接

- 原因：后端 LLMModel 表当前无 description/model_name/max_tokens 列。
- 结论：必须做 DB migration 后才可能实现真正接通。
- SDK 边界：EvalScope SDK 不负责业务模型注册表的字段持久化，这一项与 SDK 无关，必须由后端数据模型承担。
- 接入 SDK 后最多可做到：评测时消费 model 名称/endpoint/api_key；但前端模型中心展示与编辑扩展字段仍不可省略数据库改造。

2. EvalScope 模式下 repeat_count 的完整多子任务可视化

- 原因：当前 EvalScope 分支是最小接入实现，按单子任务汇总写回。
- 结论：不重构 task_runner 执行与写回结构，无法与“每次 repeat 一条 subtask”完全对齐。
- SDK 边界：SDK 核心是任务执行与评测产物输出，不天然等价于我们平台的 Subtask 领域模型。
- 接入 SDK 后最多可做到：
  - 方案 A（推荐）：后端按 repeat_count 预建 subtasks，并将 SDK 每轮执行映射为 run_index 状态推进。
  - 方案 B（低成本）：前端把 EvalScope 任务展示为单 subtask 汇总模式，不再承诺“每轮独立进度条”。

3. 原计划中的实时日志 SSE（/tasks/{id}/logs）

- 原因：当前路由不存在，任务执行也无日志流缓存通道。
- 结论：需新增 SSE 端点与日志事件源后才可接通前端实时日志视图。
- SDK 边界：SDK 可输出过程日志/结果文件，但不会自动提供我们 API 语义下的 SSE 流接口。
- 接入 SDK 后最多可做到：
  - 先提供“轮询日志快照接口”（例如最近 N 条日志）。
  - 再升级到 SSE（事件缓冲 + 心跳 + 断线重连游标）。

4. 原计划 Module 5/6 的报告、队列监控、Worker/GPU 状态

- 现状：reports、queue、scheduler 相关 API 尚未落地。
- 结论：当前前端无法直接接通这些能力。
- SDK 边界：
  - EvalScope 可生成评测结果与报告原始数据，但不负责我们平台的报表生命周期管理（生成、权限、导出、可见性）。
  - EvalScope 不提供平台级队列监控与 Worker/GPU 资源编排 API。
- 接入 SDK 后最多可做到：
  - 报告：先打通“读取 SDK work_dir 产物 + 转换成平台统一 JSON”；导出能力需我们自行实现。
  - 调度监控：仅能做“单进程/单节点任务状态”；多 worker + GPU 分配仍需独立 scheduler/queue 体系。

### 4.1 结论：接入 EvalScope SDK 后的“能力上限”

在不引入完整分布式调度系统前，我们可达到的上限如下：

1. 评测执行上限

- 支持通过 TaskConfig + run_task 执行多数据集/多指标评测。
- 支持读取 work_dir 中报告并回写平台数据库。
- 支持基础失败重试与任务级状态管理。

2. 前端可安全承诺的上限

- 任务列表、任务详情、结果榜单、错误样本可稳定展示。
- 可展示“任务级进度 + 子任务近似进度”，但在未重构前不承诺严格一一对应 SDK 内部执行阶段。
- 报告页可先做“查看/下载原始报告或转换后 JSON”，暂不承诺完整 DOCX/HTML 模板化导出体验。

3. 前端暂不应承诺的能力

- 实时高保真日志流（逐 token、逐阶段）
- 多 worker/GPU 资源可视化调度
- 强一致的可恢复断点续跑（跨进程/跨机器）

### 4.2 对前端计划合理性的直接建议

建议前端将后续需求拆成三档，避免过度承诺：

1. 可立即开发（与 SDK 最小接入一致）

- 结果展示、任务状态、基础筛选、错误样本钻取。

2. 需后端中等改造后开发

- repeat_count 多子任务精确可视化、实时日志面板、报告统一视图。

3. 需后端架构升级后开发

- 队列/Worker/GPU 监控大盘、企业级调度恢复、完整报表导出工作流。

结论：当前前端计划总体方向合理，但需要把“实时日志、调度监控、复杂导出”从本迭代目标中降级为后续里程碑，优先围绕 SDK 已验证可落地的任务执行与结果分析能力推进。

---

## 5. 与原计划（CLAUDE.md）差距映射

### Module 1（Auth & Users）

- 已完成：登录/注册/me，基础鉴权。
- 未完成：users 管理 API、角色授权矩阵在业务路由中的强制执行、侧边栏角色过滤。

### Module 2（Dataset）

- 已完成：upload/mount/list/detail/preview/delete（基础路径）。
- 未完成：import（HF/ModelScope）、stats、detail 版本历史查询、更严格格式支持（如 Parquet/Excel）。

### Module 3（Criteria）

- 已完成：CRUD + test。
- 未完成：复杂 llm_judge 配置的后端校验与执行链路、预置指标种子化。

### Module 4（Tasks）

- 已完成：创建/列表/详情/子任务/暂停恢复取消。
- 未完成：SSE 日志、Redis Worker 队列化执行、checkpoint 恢复体系完整化。

### Module 5（Results & Reports）

- 已完成：results/leaderboard/summary/errors。
- 未完成：chart-data 聚合接口、reports 生成与导出（docx/html/csv）。

### Module 6（Scheduling & Monitoring）

- 已完成：health。
- 未完成：queue/status、queue/workers、scheduler 与 GPU/worker 分配能力。

---

## 6. 下一步开发任务规划（结合对接现状 + 原计划）

建议按“先消除前后端硬断点，再补计划性能力”推进。

## 阶段 A（优先级 P0，先保证对接闭环）

1. 模型接口补齐

- 后端：实现 POST /models/{id}/test。
- 后端：模型表新增 description/model_name/max_tokens；同步 schema 与路由。
- 前端：models 表单与列表增加上述字段展示与编辑。
- 验收：前端可测试模型连通性并看到状态；字段可新增、更新、回显。

2. 任务子任务语义对齐

- 后端：创建任务时预建 repeat_count 个 subtasks（pending）。
- 后端：EvalScope 分支按 run_index 更新对应 subtask（或明确限制 repeat_count=1 并在前端禁用）。
- 前端：任务详情进度条应与 repeat_count 一致。
- 验收：repeat_count=3 时，创建后立即可见 3 条子任务，状态随执行推进。

3. 数据集删除一致性

- 后端：删除 Dataset 时清理 upload 文件与版本记录。
- 验收：删除后列表不再出现，磁盘与版本表无残留。

## 阶段 B（优先级 P1，提升可用性）

4. 权限策略落地

- 后端：将 require_role 应用到模型/数据集/准则/任务关键写接口。
- 前端：Sidebar 按 role 过滤菜单；无权限操作给出明确提示。
- 验收：viewer 无法调用写接口，返回 403；前端隐藏无权限入口。

5. 任务日志通道（SSE）

- 后端：新增 GET /tasks/{id}/logs（SSE）；runner 写入日志事件。
- 前端：任务详情新增实时日志面板。
- 验收：任务运行时前端可持续看到日志流。

## 阶段 C（优先级 P2，回到原计划中后段）

6. Results 增强

- 后端：新增 /results/chart-data。
- 前端：results 页图表构建器接入。

7. Reports 模块

- 后端：/reports/generate, /reports/{id}, /reports/{id}/export。
- 前端：报告生成与导出入口。

8. Queue/Scheduler 模块

- 后端：/queue/status, /queue/workers + scheduler 服务。
- 前端：监控看板。

---

## 7. 建议本周迭代切片（可直接开工）

建议本周只做 3 个可验收条目：

1. 模型 test endpoint + 模型扩展字段全链路（含迁移）
2. 任务 subtasks 预创建与 EvalScope repeat_count 语义修正
3. 数据集删除清理（版本级联 + 文件清理）

完成后可实现：

- API_SPEC 中最关键断点全部闭环
- 与前端当前页面对接稳定性明显提升
- 为后续 SSE/Reports/Queue 扩展提供稳定底座
