from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import settings

# 异步数据库引擎 / Async database engine
# 使用 asyncpg 驱动连接 PostgreSQL / Connect to PostgreSQL using asyncpg driver
engine = create_async_engine(settings.DATABASE_URL, echo=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    获取数据库会话 / Get database session

    依赖注入函数，用于在API路由中获取数据库会话。
    Dependency injection function to get database session in API routes.

    Yields:
        AsyncSession: 异步数据库会话 / Async database session
    """
    async with AsyncSession(engine) as session:
        yield session


async def init_db():
    """
    初始化数据库 / Initialize database

    创建所有表结构（如果不存在）。
    Create all table structures if they don't exist.
    """
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    await seed_preset_datasets()


# 预置数据集定义 / Preset dataset definitions
PRESET_DATASETS = [
    {
        "name": "GSM8K",
        "description": "Grade School Math 8K — 8500道小学数学应用题，评估模型的多步数学推理能力",
        "source_uri": "https://huggingface.co/datasets/openai/gsm8k",
        "format": "jsonl",
        "tags": "math,reasoning,preset",
    },
    {
        "name": "MATH",
        "description": "12500道竞赛级数学题，涵盖代数、几何、数论等7个类别，评估高级数学推理",
        "source_uri": "https://huggingface.co/datasets/hendrycks/competition_math",
        "format": "jsonl",
        "tags": "math,reasoning,competition,preset",
    },
    {
        "name": "BBH",
        "description": "BIG-Bench Hard — 23项挑战性任务，评估模型的逻辑推理、常识和语言理解能力",
        "source_uri": "https://huggingface.co/datasets/lukaemon/bbh",
        "format": "jsonl",
        "tags": "reasoning,logic,preset",
    },
    {
        "name": "HumanEval",
        "description": "164道 Python 编程题，评估模型的代码生成能力（Pass@k 指标）",
        "source_uri": "https://huggingface.co/datasets/openai/openai_humaneval",
        "format": "jsonl",
        "tags": "code,python,preset",
    },
    {
        "name": "MBPP",
        "description": "Mostly Basic Python Problems — 974道 Python 编程题，评估基础代码生成能力",
        "source_uri": "https://huggingface.co/datasets/google-research-datasets/mbpp",
        "format": "jsonl",
        "tags": "code,python,preset",
    },
    {
        "name": "AlpacaEval",
        "description": "805条指令，评估模型的指令跟随和开放式生成质量，常用于对话模型对比",
        "source_uri": "https://huggingface.co/datasets/tatsu-lab/alpaca_eval",
        "format": "jsonl",
        "tags": "instruction,chat,preset",
    },
    {
        "name": "MT-Bench",
        "description": "80组多轮对话题目，涵盖写作、推理、数学等8个类别，评估多轮对话能力",
        "source_uri": "https://huggingface.co/datasets/HuggingFaceH4/mt_bench_prompts",
        "format": "jsonl",
        "tags": "chat,multi-turn,preset",
    },
    {
        "name": "LongBench",
        "description": "多任务长文本理解基准，涵盖摘要、问答、代码补全等6大类21个子任务",
        "source_uri": "https://huggingface.co/datasets/THUDM/LongBench",
        "format": "jsonl",
        "tags": "long-context,comprehension,preset",
    },
]


async def seed_preset_datasets():
    """
    种子预置数据集 / Seed preset datasets

    在数据库中插入预置的标准评测数据集（幂等操作，已存在则跳过）。
    Insert preset benchmark datasets into the database (idempotent).
    """
    from app.models.dataset import Dataset, SourceType

    async with AsyncSession(engine) as session:
        result = await session.exec(
            select(Dataset).where(Dataset.source_type == SourceType.preset).limit(1)
        )
        if result.first() is not None:
            return  # already seeded

        for preset in PRESET_DATASETS:
            dataset = Dataset(
                name=preset["name"],
                description=preset["description"],
                source_type=SourceType.preset,
                source_uri=preset["source_uri"],
                format=preset["format"],
                tags=preset["tags"],
                version=1,
                size_bytes=0,
                row_count=0,
                created_by=None,
            )
            session.add(dataset)
        await session.commit()