# P0 修复计划：Fail-Fast 静默异常 + k8s_vllm 集成

## 当前状态
- **测试**: 78 个测试全部通过
- **覆盖率**: 43% (4765 statements, 2726 missed)
- **静默吞异常**: 11 处需要修复

---

## Part A: Fail-Fast 静默异常修复 (11 处)

### A1. `app/api/v1/criteria.py:174` — HIGH
**问题**: LLM Judge 测试端点中，裁判模型凭证解析失败时 `except Exception: pass`，导致后续请求使用不完整凭证，报出不相关的错误。
**修复**: 移除 try/except，让 JSON 解析和数据库查询错误自然向上传播为 HTTPException 422/500。如果需要优雅处理，改为 `logger.error(...)` + `raise HTTPException(422, detail=f"Failed to resolve judge model: {e}")`。

### A2. `app/api/v1/datasets.py:896-899` — HIGH
**问题**: 数据集版本预览加载失败时返回 `{"rows": [], "total": 0}`，用户误以为数据集为空。
**修复**: 捕获异常后 `logger.error("Preview failed for version %s: %s", dv.id, e)` 并 `raise HTTPException(500, detail=f"Failed to load dataset preview: {e}")`。

### A3. `app/services/dataset_import.py:248` — HIGH
**问题**: 行数估算失败返回 `0`，导致 `row_count` 字段为 0，用户以为数据集是空的。
**修复**: `logger.warning("Row count estimation failed for %s: %s", ...)` 并返回 `-1` 作为"未知"标记。调用方需要处理 `-1`（显示为"未知"而非"0"）。

### A4. `app/services/rbac.py:73-74` — HIGH
**问题**: 权限 JSON 解析失败时 `except (json.JSONDecodeError, TypeError): pass`，导致用户可能丢失权限（安全问题 — 权限静默降级）。
**修复**: `logger.error("Corrupt permissions_json in group, skipping: %s", e)` + 继续处理其余组（但必须记录日志）。

### A5. `app/services/storage/file_io.py:26` — MEDIUM
**问题**: 存储后端读取失败时静默回退到本地文件系统。如果存储后端配置了 S3 但 S3 不可达，会静默降级读本地（可能读到过期文件或完全不同的文件）。
**修复**: `logger.warning("Storage backend read failed for key=%s, falling back to local: %s", key, e)`。

### A6. `app/services/storage/file_io.py:47` — MEDIUM
**问题**: 同 A5，text 版本。
**修复**: 同 A5。

### A7. `app/services/storage/utils.py:48` — LOW
**问题**: 路径解析失败时 `except Exception: pass`。
**修复**: `logger.debug("Path resolution failed for root=%s: %s", root, e)` — 这里用 debug 级别即可，因为后面有其他回退逻辑。

### A8. `app/services/storage/local.py:73` — MEDIUM
**问题**: 文件删除失败返回 `False`，无法区分"不存在"和"权限拒绝"。
**修复**: `logger.warning("Failed to delete %s: %s", path, e)` 后返回 `False`。

### A9. `app/services/dataset_sync.py:33` — MEDIUM
**问题**: HuggingFace SHA 获取失败返回 `None`，无法区分"不存在"和"网络错误"。
**修复**: `logger.warning("Failed to get HF SHA for %s: %s", dataset_id, e)` 后返回 `None`（保留语义但增加可观察性）。

### A10. `app/services/evalscope_adapter.py:164` — MEDIUM
**问题**: 报告文件 JSON 解析失败时 `continue`，可能跳过所有文件导致返回默认分数 0.0。
**修复**: `logger.warning("Failed to parse report file %s: %s", f, e)` + `continue`。若所有文件都解析失败，在函数末尾增加 `if not any_valid_report: logger.error("No valid report files found in %s", work_dir_key)`。

### A11. `app/services/dataset_import.py` — 行数估算函数整体
**问题**: 函数开头的 `try` 覆盖了整个函数体，任何异常都返回 0。
**修复**: 缩小 try 范围，仅 catch 具体的解码/解析异常。其他异常（如 MemoryError）应当向上传播。

---

## Part B: k8s_vllm 集成到 task_runner

### B1. Worker 层分发
**文件**: `app/worker.py`
**当前**: Worker 解析了 `execution_backend` 但直接调用 `run_task()`，忽略了 backend 值。
**修复**: 当 `backend == "k8s_vllm"` 时，在 `run_task()` 前调用 `full_vllm_lifecycle()` 获取 endpoint，传入 task runner；任务完成后调用 `cleanup_vllm()`。

### B2. Task Runner 接受动态 endpoint
**文件**: `app/services/task_runner.py`
**当前**: `run_task()` 从数据库读取 model 的 `endpoint_url`。
**修复**: `run_task()` 增加可选参数 `endpoint_override: str | None = None`，当提供时覆盖 model 的 endpoint_url。这样 vLLM 部署后的 ClusterIP endpoint 可以直接传入。

### B3. 任务创建时记录集群信息
**文件**: `app/api/v1/tasks.py`
**当前**: 已有 `cluster_id` 和 `execution_backend` 字段，创建时正确保存。
**状态**: ✅ 已实现，无需修改。

### B4. 任务入队时传递 cluster 信息
**文件**: `app/services/task_queue.py`
**修复**: `enqueue_task()` 增加 `cluster_id` 参数，写入 Redis payload。Worker 读取后用于获取 kubeconfig。

---

## Part C: 实施顺序

1. **Step 1**: 修复所有 11 处静默异常 (A1-A11)
2. **Step 2**: 为每处修复编写或补充单元测试
3. **Step 3**: 实现 k8s_vllm 集成 (B1-B4)
4. **Step 4**: 运行完整测试套件确认无回归
5. **Step 5**: ruff check 确认无 lint 错误
