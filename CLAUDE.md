# EvalScope GUI - Project Guide

## Project Overview

**Project Name**: EvalScope GUI
**Type**: Enterprise-grade model evaluation platform with web interface
**Core Functionality**: A user-friendly GUI for the EvalScope model evaluation framework, providing visualization, task management, and comprehensive reporting.
**Target Users**: AI/ML researchers, model developers, and enterprises needing model evaluation capabilities

---

## Tech Stack

### Backend

- **Framework**: FastAPI (Python 3.10+)
- **Database**: PostgreSQL with SQLAlchemy 2.0
- **Task Queue**: Celery + Redis
- **Integration**: EvalScope (wraps the CLI/API)

### Frontend

- **Framework**: Next.js 14 (App Router)
- **UI Library**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **State**: Zustand + TanStack Query
- **HTTP**: Axios

---

## Project Structure

```
evalscope-gui/
├── backend/                    # Python FastAPI backend
│   ├── app/
│   │   ├── api/               # API routes
│   │   │   └── v1/
│   │   │       ├── models.py      # Model management endpoints
│   │   │       ├── datasets.py    # Dataset management endpoints
│   │   │       ├── evaluations.py # Evaluation task endpoints
│   │   │       ├── results.py     # Results & charts endpoints
│   │   │       └── tasks.py       # Task queue endpoints
│   │   ├── core/              # Config, security, constants
│   │   ├── db/                # Database models & migrations
│   │   ├── evalscope/         # EvalScope wrapper
│   │   ├── scheduler/         # Celery tasks
│   │   └── main.py            # Application entry
│   ├── requirements.txt
│   └── pyproject.toml
│
├── frontend/                   # Next.js frontend
│   ├── app/                   # App Router pages
│   │   ├── (auth)/           # Authentication pages
│   │   ├── (dashboard)/      # Main app pages
│   │   │   ├── models/       # Model management UI
│   │   │   ├── datasets/     # Dataset management UI
│   │   │   ├── evaluations/  # Evaluation UI
│   │   │   ├── results/      # Results & charts UI
│   │   │   └── settings/     # Settings UI
│   │   ├── api/              # API routes
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/               # shadcn components
│   │   ├── charts/           # Chart components
│   │   └── forms/            # Form components
│   ├── lib/                  # Utilities
│   ├── types/                # TypeScript types
│   └── package.json
│
├── docker-compose.yml         # Docker setup
└── CLAUDE.md                  # This file
```

---

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose (optional)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost:6001/evalscope"
export REDIS_URL="redis://localhost:6379/0"

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
NEXT_PUBLIC_API_URL="http://localhost:8000/api/v1"

# Start development server
npm run dev
```

### Docker Setup (Alternative)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## Key Features

### 1. Model Management

- Add models (HuggingFace, local, API endpoints)
- Configure model parameters (revision, precision, device_map)
- Manage API keys and endpoints

### 2. Dataset Management

- Import from preset datasets (MMLU, C-Eval, GSM8K, etc.)
- Import from HuggingFace/ModelScope
- Upload custom datasets (JSONL, CSV, Parquet, Excel)
- Version control for datasets

### 3. Evaluation Tasks

- 4-step task creation wizard:
  1. Select model
  2. Select datasets
  3. Configure parameters (temperature, max_tokens, few-shot)
  4. Select compute resources
- Real-time progress tracking via WebSocket
- Task queue management (pause, resume, cancel)

### 4. Results & Visualization

- Column charts (multi-model comparison)
- Radar charts (capability overview)
- Line charts (token speed, cross-version)
- Leaderboard auto-generation

### 5. Report Generation

- Performance reports
- Export to PDF, Word, HTML, CSV

---

## API Endpoints

### Models

```
POST   /api/v1/models           # Add model
GET    /api/v1/models          # List models
GET    /api/v1/models/{id}     # Get model details
DELETE /api/v1/models/{id}     # Remove model
```

### Datasets

```
POST   /api/v1/datasets        # Import dataset
GET    /api/v1/datasets        # List datasets
GET    /api/v1/datasets/{id}/preview
POST   /api/v1/datasets/{id}/version
```

### Evaluations

```
POST   /api/v1/evaluations     # Create evaluation
GET    /api/v1/evaluations     # List evaluations
GET    /api/v1/evaluations/{id}
```

### Results

```
GET    /api/v1/results/{eval_id}
GET    /api/v1/results/leaderboard
GET    /api/v1/results/charts
```

### Tasks

```
GET    /api/v1/tasks
GET    /api/v1/tasks/{id}
POST   /api/v1/tasks/{id}/cancel
WS     /ws/tasks/{id}/progress
```

---

## Important Notes

- The backend uses Celery with Redis for async task management
- PostgreSQL stores all persistent data (models, datasets, results, tasks)
- Frontend uses Next.js App Router with server components where appropriate
- shadcn/ui components are in `frontend/components/ui/`
- Custom chart components are in `frontend/components/charts/`

---

## Commands Reference

### Backend

```bash
# Run server
uvicorn app.main:app --reload

# Run Celery worker
celery -A app.scheduler.celery worker --loglevel=info

# Run migrations
alembic upgrade head
alembic revision --autogenerate -m "description"
```

### Frontend

```bash
# Development
npm run dev

# Build
npm run build

# Lint
npm run lint
```
