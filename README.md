# EvalScope GUI

Enterprise-grade GUI for the EvalScope model evaluation framework.

## Features

- **Model Management**: Support for HuggingFace, local, and API models
- **Dataset Management**: Preset datasets, HuggingFace imports, custom uploads
- **Evaluation Tasks**: 4-step wizard, real-time progress, task queue management
- **Results Visualization**: Column charts, radar charts, line charts, leaderboards
- **Report Generation**: Export to PDF, Word, HTML, CSV

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Database Setup

```bash
# Create database user and database
psql -U postgres -c "CREATE USER evalscope WITH PASSWORD 'evalscope';"
psql -U postgres -c "CREATE DATABASE evalscope OWNER evalscope;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE evalscope TO evalscope;"
```

### Backend Setup

```bash
cd backend

# Using uv (recommended)
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Or using pip
pip install -r requirements.txt

# Set environment variables (for local development)
export DATABASE_URL="postgresql://evalscope:evalscope@localhost:6001/evalscope"
export REDIS_URL="redis://localhost:6379/0"

# Or if running backend IN DOCKER (not locally), use:
# export DATABASE_URL="postgresql://evalscope:evalscope@postgres:6001/evalscope"
# export REDIS_URL="redis://redis:6379/0"

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
export NEXT_PUBLIC_API_URL="http://localhost:8000/api/v1"

# Start development server
npm run dev
```

### Docker Setup (Infrastructure Only)

Use Docker to run PostgreSQL and Redis, then run backend/frontend locally for development.

```bash
# Start infrastructure services only
docker-compose up -d

# Verify services are running
docker-compose ps

# Stop services
docker-compose down
```

**Connection Strings (for local development):**

- PostgreSQL: `postgresql://evalscope:evalscope@localhost:6001/evalscope`
- Redis: `redis://localhost:6379/0`

**Connection Strings (for Docker/containerized backend):**

- PostgreSQL: `postgresql://evalscope:evalscope@postgres:6001/evalscope`
- Redis: `redis://redis:6379/0`

Then run backend and frontend locally (see Backend Setup and Frontend Setup above).

**Dockerfiles are included** in `backend/Dockerfile` and `frontend/Dockerfile` for reference or production deployment.

## API Documentation

Once the backend is running:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Web Interface

- Frontend: http://localhost:3000

## Demo Credentials

```
Username: admin
Password: admin
```

## Tech Stack

### Backend

- FastAPI
- SQLAlchemy 2.0
- PostgreSQL
- Celery + Redis

### Frontend

- Next.js 14 (App Router)
- shadcn/ui + Tailwind CSS
- Recharts
- TanStack Query

## License

Apache-2.0
