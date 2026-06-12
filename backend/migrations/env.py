"""Alembic async migration environment using SQLAlchemy + asyncpg."""
import asyncio
import os
import logging

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

logger = logging.getLogger("alembic.env")


def _db_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set — cannot run migrations")
    # Normalise scheme for SQLAlchemy asyncpg dialect
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    # Strip query-string (sslmode etc.) — we pass ssl via connect_args
    if "?" in url:
        url = url.split("?")[0]
    return url


def _configure_and_run(connection):
    context.configure(
        connection=connection,
        target_metadata=None,
        compare_type=True,
        # Wrap each migration in a BEGIN/COMMIT so DDL is transactional
        transaction_per_migration=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline():
    url = _db_url()
    context.configure(
        url=url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    url = _db_url()
    connectable = create_async_engine(
        url,
        connect_args={"ssl": "require", "statement_cache_size": 0},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_configure_and_run)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
