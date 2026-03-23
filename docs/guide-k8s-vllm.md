# SwanEVAL 集群部署与 vLLM 使用指南

> 面向初学者的完整指南：从零开始在 SwanEVAL 中使用 Kubernetes 集群部署和评测开源大语言模型。

---

## 目录

1. [概念总览](#1-概念总览)
2. [前置条件](#2-前置条件)
3. [第一步：准备 Kubernetes 集群](#3-第一步准备-kubernetes-集群)
4. [第二步：在 SwanEVAL 中注册集群](#4-第二步在-swaneval-中注册集群)
5. [第三步：注册模型](#5-第三步注册模型)
6. [第四步：部署模型到集群](#6-第四步部署模型到集群)
7. [第五步：创建评测任务](#7-第五步创建评测任务)
8. [两种使用模式](#8-两种使用模式)
9. [故障排查](#9-故障排查)
10. [附录：关键概念解释](#10-附录关键概念解释)

---

## 1. 概念总览

### 为什么需要集群？

SwanEVAL 支持三种模型调用方式：

| 方式 | 适用场景 | 需要集群？ |
|------|---------|-----------|
| **外部 API** | 调用 OpenAI、Anthropic 等云端 API | ❌ 不需要 |
| **本地 Worker** | 在本机 GPU 上运行推理 | ❌ 不需要 |
| **K8s / vLLM** | 在 GPU 服务器集群上自动部署开源模型 | ✅ 需要 |

当你想评测 Qwen、Llama、ChatGLM 等**开源模型**，但不想手动搭建推理服务时，K8s/vLLM 模式会自动完成以下工作：

```
你选择模型和数据集 → SwanEVAL 自动在集群上启动 vLLM → 评测完成后自动清理
```

### 三个核心组件

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  SwanEVAL   │────▶│ Kubernetes  │────▶│  vLLM 推理服务       │
│  (平台)      │     │ (资源调度)   │     │  (模型运行在 GPU 上) │
└─────────────┘     └─────────────┘     └─────────────────────┘
```

- **SwanEVAL**：你的评测平台，负责管理数据集、评测标准、发起任务
- **Kubernetes (K8s)**：容器编排系统，管理 GPU 服务器上的计算资源
- **vLLM**：高性能大模型推理引擎，提供 OpenAI 兼容的 API 接口

---

## 2. 前置条件

### 硬件要求

- 至少一台带 NVIDIA GPU 的服务器（推荐 A100/A10/V100/4090）
- GPU 显存要求取决于模型大小：
  - 1.5B 参数模型（如 Qwen2.5-1.5B）：≥ 4GB
  - 7B 参数模型（如 Qwen2.5-7B）：≥ 16GB
  - 14B 参数模型：≥ 28GB
  - 72B 参数模型：≥ 140GB（需多卡）

### 软件要求

- NVIDIA 驱动已安装（`nvidia-smi` 能看到 GPU）
- Docker 已安装
- Kubernetes 集群已搭建（见下一节）
- NVIDIA GPU Operator 或 Device Plugin 已部署

### 如果你还没有 K8s 集群

最快的搭建方式：

```bash
# 方式 A：k3s（最轻量，推荐生产环境）
curl -sfL https://get.k3s.io | sh -

# 方式 B：k3d（k3s 跑在 Docker 里，适合测试）
brew install k3d  # macOS
k3d cluster create swaneval

# 方式 C：minikube（最多文档，适合学习）
brew install minikube
minikube start --driver=docker
```

### 安装 NVIDIA GPU 支持

K8s 默认不识别 GPU。需要安装 NVIDIA Device Plugin：

```bash
# 方式 A：完整 GPU Operator（推荐，自动管理驱动+插件）
helm repo add nvidia https://helm.ngc.nvidia.com/nvidia
helm repo update
helm install gpu-operator nvidia/gpu-operator --namespace gpu-operator --create-namespace

# 方式 B：仅 Device Plugin（如果驱动已手动安装）
kubectl create -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml
```

验证 GPU 可用：

```bash
kubectl get nodes -o json | jq '.items[].status.allocatable["nvidia.com/gpu"]'
# 应该输出 GPU 数量，如 "2"
```

---

## 3. 第一步：准备 Kubernetes 集群

### 获取 kubeconfig

kubeconfig 是连接 K8s 集群的"钥匙"。获取方式取决于你的集群类型：

```bash
# k3s
sudo cat /etc/rancher/k3s/k3s.yaml

# k3d
k3d kubeconfig get swaneval

# minikube
cat ~/.kube/config

# 通用方式
kubectl config view --raw
```

复制输出的 YAML 内容，后续粘贴到 SwanEVAL 中。

### 验证集群正常

```bash
kubectl cluster-info
# 应该显示类似：Kubernetes control plane is running at https://...

kubectl get nodes
# 应该显示至少一个 Ready 状态的节点
```

---

## 4. 第二步：在 SwanEVAL 中注册集群

1. 登录 SwanEVAL，点击顶部导航栏的 **计算资源**
2. 点击 **添加** 按钮
3. 填写：
   - **集群名称**：给集群起个名字，如 "实验室 GPU 集群"
   - **命名空间**：默认 `default` 即可（也可以创建专用命名空间如 `swaneval`）
   - **Kubeconfig**：粘贴上一步获取的 YAML 内容
4. 点击 **添加集群**

SwanEVAL 会自动：
- 验证 kubeconfig 有效性（测试连接）
- 加密存储 kubeconfig
- 在后台探测集群资源（GPU 数量/类型、CPU、内存、节点数）

等待几秒钟，集群状态从 `connecting` 变为 `ready`，右侧面板会显示：
- GPU 数量和型号（如 "4 × NVIDIA-A100-80GB"）
- CPU 和内存总量
- 节点列表和状态

---

## 5. 第三步：注册模型

1. 点击顶部导航栏的 **模型**
2. 点击 **添加模型**
3. 关键字段：
   - **类型**：选择 `HuggingFace`（或 `ModelScope`）
   - **模型 ID**：填写 HuggingFace 仓库 ID，如 `Qwen/Qwen2.5-7B-Instruct`
   - **显示名称**：如 "Qwen2.5-7B"
   - **HF Token**（可选）：如果模型需要授权访问（如 Llama），填写你的 HuggingFace Token

> **重要**：模型 ID 必须是有效的 HuggingFace 仓库路径。vLLM 会在集群中自动从 HuggingFace 下载模型权重。

### 常用开源模型推荐

| 模型 | HuggingFace ID | 最低显存 |
|------|----------------|---------|
| Qwen2.5-0.5B-Instruct | `Qwen/Qwen2.5-0.5B-Instruct` | 2GB |
| Qwen2.5-1.5B-Instruct | `Qwen/Qwen2.5-1.5B-Instruct` | 4GB |
| Qwen2.5-7B-Instruct | `Qwen/Qwen2.5-7B-Instruct` | 16GB |
| Llama-3.1-8B-Instruct | `meta-llama/Llama-3.1-8B-Instruct` | 16GB |
| ChatGLM4-9B | `THUDM/glm-4-9b-chat` | 18GB |
| Yi-1.5-9B-Chat | `01-ai/Yi-1.5-9B-Chat` | 18GB |

---

## 6. 第四步：部署模型到集群

有两种部署方式：

### 方式 A：手动部署（推荐首次使用）

1. 在 **模型** 页面，点击刚注册的模型
2. 右侧详情面板底部，找到 **集群部署** 区域
3. 从下拉菜单选择你的集群
4. 点击 **部署到集群**

部署过程（通常 1-5 分钟）：
```
状态：部署中...
  → SwanEVAL 在 K8s 中创建命名空间
  → 创建 vLLM Deployment（拉取模型镜像 + 下载权重）
  → 创建 Service（内部网络访问）
  → 等待 vLLM 健康检查通过
状态：已部署 ✓
```

部署完成后：
- 模型状态变为绿色 "已部署"
- 可以点击 **测试连接** 验证
- 可以使用 **Playground** 发送测试消息

### 方式 B：任务自动部署

在创建评测任务时选择 **K8s/vLLM** 执行后端，SwanEVAL 会在任务开始时自动部署，任务结束后自动清理。详见下一节。

---

## 7. 第五步：创建评测任务

1. 点击顶部导航栏的 **评测任务** → **新建任务**
2. 按向导依次填写：

### Step 0：选择模型
选择你注册的 HuggingFace 模型

### Step 1：选择数据集和评测标准
- 选择一个或多个数据集（如 GSM8K、HumanEval）
- 选择评测标准（如精确匹配、BLEU）
- 配置字段映射

### Step 2：参数配置
- 任务名称
- Temperature、Max Tokens 等推理参数
- 重复次数（用于稳定性测试）

### Step 3：运行环境 ← 关键步骤
- **执行后端**：选择 **K8s / vLLM**
- **计算集群**：选择你注册的集群
- **GPU 数量**：根据模型大小设置
  - 7B 模型：1 GPU
  - 14B 模型：2 GPU
  - 72B 模型：4-8 GPU（tensor parallelism 自动配置）
- **显存 (GB)**：设置每个 Pod 的内存限制

### Step 4：确认提交

提交后任务进入队列，Worker 进程会：
1. 从 Redis 队列取出任务
2. 检查模型是否已部署
   - 如果已手动部署（方式 A）：直接复用，不重复部署
   - 如果未部署：自动执行完整 vLLM 部署流程
3. 逐条发送 Prompt 到 vLLM 端点
4. 收集模型输出，应用评测标准打分
5. 保存结果到数据库
6. 如果是自动部署的：清理 K8s 资源

---

## 8. 两种使用模式

### 模式 1：持久部署 + 多次评测

适合需要反复评测同一模型的场景。

```
手动部署模型 → 运行任务 A → 运行任务 B → 运行任务 C → 手动停止部署
```

- 优点：模型只下载一次，多次评测速度快
- 缺点：模型持续占用 GPU 资源

操作方式：
1. 在模型详情中手动 **部署到集群**
2. 创建任务时选择 **外部 API**（因为模型已经在运行了）
3. 评测完成后在模型详情中 **停止部署**

### 模式 2：按任务自动部署

适合一次性评测或资源共享的场景。

```
创建任务(k8s_vllm) → 自动部署 → 评测 → 自动清理
```

- 优点：用完即释放，不浪费资源
- 缺点：每次任务都需要等模型下载（首次较慢）

操作方式：
1. 创建任务时选择 **K8s / vLLM** 执行后端
2. 选择集群和 GPU 配置
3. 一切自动完成

---

## 9. 故障排查

### 集群状态一直是 "connecting"

```bash
# 检查节点状态
kubectl get nodes

# 检查 kubeconfig 是否有效
kubectl cluster-info
```

常见原因：
- kubeconfig 中的 API server 地址不可从 SwanEVAL 服务器访问
- 证书过期
- 集群内存超过 int32 范围（已在 v0.5.0 修复）

### 模型部署失败

```bash
# 查看 Pod 状态
kubectl get pods -n <namespace>

# 查看 Pod 日志
kubectl logs -n <namespace> <pod-name>

# 查看 Pod 事件（排查资源不足）
kubectl describe pod -n <namespace> <pod-name>
```

常见原因：
- GPU 显存不足（选择更小的模型或更多 GPU）
- 模型需要 HF Token（设置 Token 后重试）
- 镜像拉取失败（检查网络或配置镜像代理）
- NVIDIA Runtime 未安装（安装 GPU Operator）

### 评测任务卡在 "pending"

- 确认 Worker 进程正在运行：`uv run python -m app.worker`
- 确认 Redis 正在运行：`redis-cli ping`

### vLLM 启动超时（600秒）

大模型首次下载权重需要较长时间。可能的解决方案：
- 预先在节点上拉取模型：`docker pull vllm/vllm-openai:latest`
- 使用持久卷缓存模型权重
- 增加 `timeout_seconds` 配置

---

## 10. 附录：关键概念解释

### Kubernetes 基础概念

| 概念 | 解释 |
|------|------|
| **Node** | 集群中的一台物理/虚拟机 |
| **Pod** | K8s 中最小的部署单元，包含一个或多个容器 |
| **Deployment** | 管理 Pod 的副本数和更新策略 |
| **Service** | 为 Pod 提供稳定的网络访问地址 |
| **Namespace** | 资源隔离的逻辑分组 |
| **kubeconfig** | 连接 K8s 集群的认证配置文件 |

### vLLM 基础概念

| 概念 | 解释 |
|------|------|
| **vLLM** | 高性能 LLM 推理引擎，支持 PagedAttention 等加速技术 |
| **Tensor Parallelism** | 将模型参数分布到多张 GPU 上并行推理（多卡必需） |
| **OpenAI 兼容 API** | vLLM 提供与 OpenAI API 格式相同的 HTTP 接口 |
| **dtype** | 推理精度，`auto` 会自动选择 bfloat16 或 float16 |
| **/health** | vLLM 健康检查端点，SwanEVAL 用此判断服务是否就绪 |

### SwanEVAL 执行后端

| 后端 | 工作方式 |
|------|---------|
| **外部 API** | 直接调用已有的 HTTP API（OpenAI、自建服务等） |
| **本地 Worker** | 在运行 Worker 的机器上直接推理 |
| **K8s / vLLM** | 自动在 K8s 集群上部署 vLLM，创建临时推理服务 |

### GPU 显存估算公式

```
所需显存 ≈ 模型参数量 × 2 字节（float16/bfloat16）× 1.2（开销系数）

示例：
- 7B 模型 ≈ 7 × 2 × 1.2 = 16.8 GB → 需要 1 张 24GB 显卡
- 14B 模型 ≈ 14 × 2 × 1.2 = 33.6 GB → 需要 2 张 24GB 显卡
- 72B 模型 ≈ 72 × 2 × 1.2 = 172.8 GB → 需要 4 张 80GB A100
```

多卡时 SwanEVAL 会自动设置 `--tensor-parallel-size` 参数。

---

## 快速参考卡片

```
一句话流程：
  注册集群 → 注册模型(HF ID) → 部署到集群 / 创建任务时自动部署 → 评测 → 查看结果

最小可用配置：
  - 1 台 GPU 服务器 + k3s + NVIDIA Device Plugin
  - SwanEVAL 后端 + Redis + PostgreSQL
  - Worker 进程: uv run python -m app.worker

关键端口：
  - SwanEVAL API: 8000
  - SwanEVAL Frontend: 3000
  - K8s API Server: 6443
  - vLLM (集群内部): 8000

关键命令：
  kubectl get pods -n <ns>          # 查看 vLLM Pod 状态
  kubectl logs -n <ns> <pod>        # 查看 vLLM 日志
  kubectl describe pod -n <ns> <pod> # 排查部署问题
```
