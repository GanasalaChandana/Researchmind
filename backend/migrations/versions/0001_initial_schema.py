"""Initial schema — all tables from launch through v5.

Revision ID: 0001
Revises:
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Auth ─────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         TEXT PRIMARY KEY,
            email      TEXT UNIQUE NOT NULL,
            name       TEXT NOT NULL,
            password   TEXT NOT NULL,
            api_key    TEXT UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            is_active  BOOLEAN DEFAULT TRUE
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            jti        TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_resets (
            token_hash TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # ── Core research ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            topic       TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'running',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            report      JSONB,
            user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
            is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
            tags        JSONB NOT NULL DEFAULT '[]',
            collection_id TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_status    ON sessions(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS research_cache (
            topic_normalized TEXT PRIMARY KEY,
            report           JSONB NOT NULL,
            cached_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS report_versions (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            version    INTEGER NOT NULL,
            report     JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (session_id, version)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_report_versions_session ON report_versions(session_id)")

    # ── Sharing ───────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS share_tokens (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            token      TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            created_by TEXT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS report_comments (
            id          TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            author_name TEXT NOT NULL,
            content     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_report_comments_session ON report_comments(session_id)")

    # ── Collections ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            name        TEXT NOT NULL,
            description TEXT,
            color       TEXT NOT NULL DEFAULT 'indigo',
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ── API keys ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id            TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL,
            name          TEXT NOT NULL,
            key_hash      TEXT NOT NULL UNIQUE,
            key_prefix    TEXT NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at  TIMESTAMPTZ,
            request_count INTEGER NOT NULL DEFAULT 0,
            is_active     BOOLEAN NOT NULL DEFAULT TRUE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_hash    ON api_keys(key_hash)")

    # ── Knowledge Graph ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS kg_entities (
            id            TEXT PRIMARY KEY,
            user_id       TEXT NOT NULL,
            name          TEXT NOT NULL,
            type          TEXT NOT NULL DEFAULT 'concept',
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, name, type)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_kg_entities_user ON kg_entities(user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS kg_session_entities (
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            entity_id  TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
            PRIMARY KEY (session_id, entity_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_kg_se_entity ON kg_session_entities(entity_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS kg_edges (
            id               TEXT PRIMARY KEY,
            session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            source_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
            target_entity_id TEXT NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
            label            TEXT NOT NULL DEFAULT 'related',
            weight           INTEGER NOT NULL DEFAULT 1
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_kg_edges_session ON kg_edges(session_id)")

    # ── Chat ──────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id         TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)")

    # ── Scheduled research ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_research (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            topic           TEXT NOT NULL,
            frequency       TEXT NOT NULL DEFAULT 'weekly',
            day_of_week     INTEGER NOT NULL DEFAULT 0,
            hour            INTEGER NOT NULL DEFAULT 9,
            depth           INTEGER NOT NULL DEFAULT 3,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            notify_email    BOOLEAN NOT NULL DEFAULT TRUE,
            last_run_at     TIMESTAMPTZ,
            last_session_id TEXT,
            run_count       INTEGER NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_schedules_user   ON scheduled_research(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_schedules_active ON scheduled_research(is_active)")

    # ── Webhooks ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS webhooks (
            id               TEXT PRIMARY KEY,
            user_id          TEXT NOT NULL,
            url              TEXT NOT NULL,
            events           JSONB NOT NULL DEFAULT '["completed","failed"]',
            secret           TEXT,
            secret_hint      TEXT,
            is_active        BOOLEAN NOT NULL DEFAULT TRUE,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_fired_at    TIMESTAMPTZ,
            total_deliveries INTEGER NOT NULL DEFAULT 0,
            total_failures   INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id           TEXT PRIMARY KEY,
            webhook_id   TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
            session_id   TEXT,
            event        TEXT NOT NULL,
            status_code  INTEGER,
            duration_ms  INTEGER,
            success      BOOLEAN NOT NULL DEFAULT FALSE,
            attempt      INTEGER NOT NULL DEFAULT 1,
            error        TEXT,
            delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_wh_deliveries_wid ON webhook_deliveries(webhook_id)")

    # ── Research chains ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS research_chains (
            id              TEXT PRIMARY KEY,
            user_id         TEXT NOT NULL,
            name            TEXT NOT NULL,
            root_session_id TEXT,
            auto_run        BOOLEAN NOT NULL DEFAULT TRUE,
            status          TEXT NOT NULL DEFAULT 'active',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_chains_user ON research_chains(user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS chain_steps (
            id           TEXT PRIMARY KEY,
            chain_id     TEXT NOT NULL REFERENCES research_chains(id) ON DELETE CASCADE,
            session_id   TEXT,
            topic        TEXT NOT NULL,
            step_order   INTEGER NOT NULL,
            status       TEXT NOT NULL DEFAULT 'pending',
            started_at   TIMESTAMPTZ,
            completed_at TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_chain_steps_chain   ON chain_steps(chain_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chain_steps_session ON chain_steps(session_id)")

    # ── Uploaded documents ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_documents (
            id           TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL,
            filename     TEXT NOT NULL,
            file_type    TEXT NOT NULL,
            text_content TEXT NOT NULL,
            char_count   INTEGER NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_uploaded_docs_user ON uploaded_documents(user_id)")


def downgrade() -> None:
    # Drop in reverse dependency order
    tables = [
        "uploaded_documents", "chain_steps", "research_chains",
        "webhook_deliveries", "webhooks", "scheduled_research",
        "chat_messages", "kg_edges", "kg_session_entities", "kg_entities",
        "api_keys", "collections", "report_comments", "share_tokens",
        "report_versions", "research_cache", "sessions",
        "password_resets", "refresh_tokens", "users",
    ]
    for t in tables:
        op.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
