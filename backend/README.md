# EvalScope GUI - Backend Application

This directory contains the FastAPI backend for the EvalScope GUI.

## Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry
│   ├── config.py            # Configuration settings
│   ├── security.py          # Security utilities
│   ├── database.py          # Database connection
│   ├── api/                 # API routes
│   ├── db/                  # Database models
│   ├── evalscope/           # EvalScope wrapper
│   └── scheduler/           # Celery tasks
├── requirements.txt
├── pyproject.toml
└── Dockerfile
```

## Setup

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Set environment variables:

   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:6001/evalscope"
   export REDIS_URL="redis://localhost:6379/0"
   export SECRET_KEY="your-secret-key"
   ```

3. Run database migrations:

   ```bash
   alembic upgrade head
   ```

4. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Documentation

Once running, visit:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
