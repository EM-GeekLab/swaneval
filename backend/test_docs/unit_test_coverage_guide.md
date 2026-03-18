# 单元测试与覆盖率 100% 复现文档

## 1. 目标与范围

本次“100% 覆盖率”是**模块级目标**，范围限定为：

- `app/services/evalscope_adapter.py`

已完成并验证：

- 单元测试文件：`tests/test_evalscope_adapter.py`
- 覆盖率结果：`app/services/evalscope_adapter.py` 为 `100%`（`84/84`）

> 说明：整个后端工程（所有模块）达到 100% 覆盖率在现实项目中通常不作为强制门槛，成本很高且收益有限。这里按“EvalScope 接入核心适配模块”做严格 100%。

## 2. 测试覆盖了哪些能力

`tests/test_evalscope_adapter.py` 已覆盖以下分支：

1. `_normalize_qa_row`

- 支持 `query/prompt/input/question` 输入字段
- 支持 `response/expected/output/answer` 输出字段
- 无 query 时返回 `None`

1. `convert_dataset_to_general_qa_jsonl`

- 源文件不存在（`FileNotFoundError`）
- `.json` 输入（list / dict / 非法结构）
- `.jsonl` 输入（正常行、空行、脏空白行）
- 输出文件写入及计数逻辑

1. `build_evalscope_task_config`

- 参数默认值（`temperature/max_tokens/top_p`）
- `seed` 分支
- `repeat_count` 的 `max(1, repeat_count)` 分支
- `api_key` 为空时抛出异常（禁止空凭证执行）

1. `run_evalscope_task`

- `run_task` 返回 dict
- `run_task` 返回非 dict（包装为 `{"result": ...}`）

1. `extract_primary_score` 与 `_find_numeric_score`

- 报告目录不存在时回退 `0.0`
- 报告 JSON 损坏时跳过
- 多种 score key：`score/Score/avg_score/AverageAccuracy`
- 嵌套 dict/list 查找与找不到分数分支

## 3. 环境准备

在仓库根目录执行（你当前就是这个目录）：

```bash
cd /media/icey/新加卷/Aprojects/evalscope-gui/evalscope-gui
```

确保虚拟环境存在并可用：

```bash
.venv/bin/python --version
```

安装覆盖率工具（只需一次）：

```bash
.venv/bin/python -m pip install coverage
```

## 4. 执行单元测试并统计覆盖率

在 `backend/` 目录执行：

```bash
cd backend
../.venv/bin/python -m coverage erase
../.venv/bin/python -m coverage run --source=app.services.evalscope_adapter -m unittest tests/test_evalscope_adapter.py
../.venv/bin/python -m coverage report -m
```

预期输出关键行：

```text
Ran 11 tests ...
OK
app/services/evalscope_adapter.py      84      0   100%
TOTAL                                  84      0   100%
```

## 5. 一条命令快速验证（可选）

```bash
cd backend && \
../.venv/bin/python -m coverage erase && \
../.venv/bin/python -m coverage run --source=app.services.evalscope_adapter -m unittest tests/test_evalscope_adapter.py && \
../.venv/bin/python -m coverage report -m
```

## 6. 常见问题

1. 提示 `No data was collected`

- 原因：`--source` 写成了文件路径（如 `app/services/evalscope_adapter.py`）而不是模块路径。
- 修复：改为 `--source=app.services.evalscope_adapter`。

1. 提示 `ModuleNotFoundError: app`

- 原因：不在 `backend/` 目录执行。
- 修复：先 `cd backend` 再运行命令。

1. 覆盖率不是 100%

- 原因：测试文件被改动或目标模块新增分支未补测试。
- 修复：先看 `coverage report -m` 的 `Missing` 列，再补对应分支测试。

## 7. 验收标准

满足以下两条即通过：

1. `unittest` 显示 `OK`
2. `app/services/evalscope_adapter.py` 覆盖率为 `100%`
