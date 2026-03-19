# EvalScope GUI — 全流程操作指南

从零开始：拉取代码 → 启动服务 → 配置评测 → 查看可视化结果。

---

## 前置条件

- **Git**
- **Docker** 已安装并运行（[安装指南](https://docs.docker.com/get-docker/)）
- 一个可用的模型 API（如阿里百炼 DashScope、OpenAI 等），或使用本地 Ollama

---

## 第一步：获取代码

```bash
git clone git@github.com:KrLite/evalscope-gui.git
cd evalscope-gui
```

如果使用 HTTPS：

```bash
git clone https://github.com/KrLite/evalscope-gui.git
cd evalscope-gui
```

> 如需切换到特定分支（如 shared-storage 功能分支）：
> ```bash
> git checkout feature/shared-storage
> ```

---

## 第二步：启动服务

### 方式 A：全容器化（推荐）

```bash
docker compose up --build -d
```

等待所有服务就绪（约 1-2 分钟首次构建）：

```bash
docker compose ps
# 应看到 4 个服务全部 running/healthy:
# evalscope-postgres   healthy
# evalscope-redis      healthy
# evalscope-backend    running
# evalscope-frontend   running
```

验证后端：

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

打开前端：http://localhost:3000

### 方式 B：混合模式（开发用）

只用 Docker 跑 Postgres + Redis，后端和前端本机跑：

```bash
# 启动基础设施
docker compose up -d postgres redis

# 后端
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000

# 前端（新终端）
cd frontend
pnpm install
pnpm dev
```

---

## 第三步：注册登录

1. 打开 http://localhost:3000/login
2. 如果没有账号，点击页面上的注册入口
3. 填写用户名、邮箱、密码，角色选 **admin**
4. 注册成功后登录

> 首个用户建议用 admin 角色，拥有所有权限。

---

## 第四步：注册模型

1. 左侧导航栏点击 **模型管理**
2. 点击右上角 **添加模型**
3. 填写模型信息：

| 字段 | 示例值 | 说明 |
|------|--------|------|
| 显示名称 | `qwen3.5-plus` | 在排行榜等处显示的名称 |
| 提供商 | `bailian` | 标识供应商 |
| 类型 | `API` | 远程 API 调用 |
| 模型 ID | `qwen3.5-plus` | 实际传给 API 的 model 参数 |
| 端点 URL | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | 模型 API 地址 |
| API 密钥 | `sk-sp-xxxx` | 你的 API Key（安全存储在数据库中） |
| 最大 Token | `4096` | 可选 |

4. 点击 **添加模型**
5. 点击模型列表中刚添加的模型，然后点击 **测试连接**
6. 看到绿色指示灯 = 连接成功

> **使用本地 Ollama？** 先 `docker compose --profile ollama up -d`，然后：
> - 端点 URL：`http://evalscope-ollama:11434/v1/chat/completions`（容器化）或 `http://host.docker.internal:11434/v1/chat/completions`
> - 模型 ID：`qwen2:0.5b`（需先 `docker exec evalscope-ollama ollama pull qwen2:0.5b`）
> - API 密钥：`ollama`（随便填，Ollama 不校验）

---

## 第五步：准备数据集

### 方式 A：上传文件（推荐入门）

1. 在本机创建一个测试文件 `test_qa.jsonl`：

```jsonl
{"query": "中国的首都是哪里？", "response": "北京"}
{"query": "1+1等于几？", "response": "2"}
{"query": "水的化学式是什么？", "response": "H2O"}
{"query": "地球是太阳系的第几颗行星？", "response": "第三颗"}
{"query": "Python是什么类型的编程语言？", "response": "解释型语言"}
```

2. 左侧导航栏点击 **数据集管理**
3. 点击右上角 **添加数据集**
4. 选择 **上传文件** 标签页
5. 选择文件 `test_qa.jsonl`，名称填 `基础问答测试`，标签填 `qa,test`
6. 点击 **上传**

上传后可以在详情面板中点击 **预览** 查看数据内容。

### 方式 B：挂载服务器路径

适合大文件，不复制数据：

1. 选择 **服务器路径** 标签页
2. 填写服务器上的绝对路径（如 `/data/datasets/my_eval.jsonl`）
3. 点击 **挂载路径**

---

## 第六步：创建评测标准

1. 左侧导航栏点击 **评测标准**
2. 点击右上角 **添加标准**
3. 对于基础问答，创建一个精确匹配标准：

| 字段 | 值 |
|------|---|
| 名称 | `精确匹配` |
| 类型 | `preset` |
| 配置 | `{"metric": "exact_match"}` |

4. 点击 **添加**

> **其他可选标准**：
> - 包含匹配：`{"metric": "contains"}`
> - 数值接近：`{"metric": "numeric", "tolerance": 0.01}`
> - LLM 裁判：选择 `llm_judge` 类型，配置裁判模型端点和评分提示词

---

## 第七步：创建并运行评测任务

1. 左侧导航栏点击 **评测任务**
2. 点击右上角 **新建任务**
3. 按照 4 步向导操作：

**步骤 1 — 选择模型**
- 选择刚才添加的 `qwen3.5-plus`

**步骤 2 — 选择数据集与评测标准**
- 点选 `基础问答测试` 数据集
- 点选 `精确匹配` 评测标准

**步骤 3 — 参数配置**
- 任务名称：`首次评测`
- 温度：`0`（确定性输出，便于评分）
- 最大 Token：`256`
- 重复次数：`1`（稳定性测试可设为 5-10）
- 种子策略：`固定`

**步骤 4 — 确认提交**
- 检查配置无误后点击 **提交任务**

4. 任务提交后自动开始运行，在列表中可看到状态变化：
   - `等待中` → `运行中` → `已完成`（或 `失败`）

5. 点击任务行查看详情面板，可以 **暂停/恢复/取消** 任务

---

## 第八步：查看评测结果

### 任务详情页

点击任务详情面板中的 **查看详情** 按钮：
- **子任务进度**：每个重复运行的进度条
- **汇总图表**：各评测标准的平均得分柱状图
- **汇总表格**：平均分、最小分、最大分、延迟等统计
- **错误分析**：得分 < 1.0 的具体 Prompt 和模型输出对比

### 结果分析页

左侧导航栏点击 **结果分析**：

**排行榜**
- 自动按模型+标准聚合排名
- 可按评测标准筛选

**对比图（柱状图）**
- 多模型 × 多标准的分组柱状图
- 一眼看出各模型在不同维度的表现

**雷达图**
- 选一个或多个模型，多维度能力雷达图
- 直观展示优势和短板区间

**明细**
- 选择任务后查看逐条 Prompt 的详细结果
- 输入提示、预期输出、模型输出、得分、延迟
- 支持分页浏览

**导出**
- 点击右上角 **导出 CSV** 下载排行榜数据

---

## 完整流程图

```
拉取代码 → 启动服务 → 注册登录 → 添加模型 → 测试连接
    ↓
上传数据集 → 预览数据 → 创建评测标准
    ↓
新建任务（4步向导）→ 提交 → 任务运行中（实时刷新状态）
    ↓
查看详情（汇总+错误分析）→ 结果分析（排行榜+图表）→ 导出
```

---

## 常见问题

### 任务一直是"等待中"不开始

- 检查后端日志：`docker compose logs backend`
- 常见原因：模型 API Key 无效或端点不可达

### 任务失败

- 在任务详情页查看子任务的错误日志
- 常见原因：
  - API 超时（模型端点响应太慢）
  - 数据集格式不对（缺少 `query`/`prompt` 字段）

### 上传数据集报错

- 确保文件是 JSONL（每行一个 JSON 对象）或 JSON（数组或单对象）
- 每行必须有 `query`/`prompt`/`input`/`question` 中的至少一个字段

### 模型连接测试失败

- 检查端点 URL 是否正确（包含完整路径如 `/v1/chat/completions`）
- 检查 API Key 是否有效
- Anthropic 兼容端点会自动补全 `/v1/messages`

### Docker 构建失败

```bash
# 重新构建（不使用缓存）
docker compose build --no-cache

# 查看构建日志
docker compose up --build 2>&1 | less
```

---

## 服务地址一览

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:3000 | 主界面 |
| 后端 API | http://localhost:8000 | REST API |
| Swagger 文档 | http://localhost:8000/docs | 交互式 API 文档 |
| PostgreSQL | localhost:6001 | 数据库 |
| Redis | localhost:6379 | 缓存 |
| MinIO 控制台 | http://localhost:9001 | S3 存储（需 `--profile s3`） |
| Ollama | http://localhost:11434 | 本地模型（需 `--profile ollama`） |
