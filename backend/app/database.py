"""Database engine, sessions and a small versioned migration system.

Before any migration runs on an existing SQLite file, a timestamped copy of the
database is written next to it (e.g. lifeos.db.bak-20261123-040500), so data can
always be recovered.
"""
from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from typing import Callable, Iterator

from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlmodel import Session, SQLModel, create_engine

log = logging.getLogger("lifeos.db")

_engine = None


def database_url() -> str:
    return os.getenv("DATABASE_URL", "sqlite:///./lifeos.db")


def get_engine():
    global _engine
    if _engine is None:
        url = database_url()
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        _engine = create_engine(url, connect_args=connect_args, echo=False)
    return _engine


def reset_engine() -> None:
    """Used by tests to point the app at a fresh database."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


# ---------------------------------------------------------------- migrations
def _m1_initial(conn: Connection) -> None:
    """v1: tables of the original starter + backup snapshots (created by metadata)."""


def _m2_task_fields(conn: Connection) -> None:
    """v2: tasks gained description, estimated_min and completed_at."""
    cols = {row[1] for row in conn.execute(text("PRAGMA table_info(task)"))}
    if "description" not in cols:
        conn.execute(text("ALTER TABLE task ADD COLUMN description VARCHAR DEFAULT '' NOT NULL"))
    if "estimated_min" not in cols:
        conn.execute(text("ALTER TABLE task ADD COLUMN estimated_min INTEGER DEFAULT 30 NOT NULL"))
    if "completed_at" not in cols:
        conn.execute(text("ALTER TABLE task ADD COLUMN completed_at DATETIME"))


def _m3_course_fields(conn: Connection) -> None:
    """v3: courses gained code and semester."""
    cols = {row[1] for row in conn.execute(text("PRAGMA table_info(course)"))}
    if "code" not in cols:
        conn.execute(text("ALTER TABLE course ADD COLUMN code VARCHAR DEFAULT '' NOT NULL"))
    if "semester" not in cols:
        conn.execute(text("ALTER TABLE course ADD COLUMN semester VARCHAR DEFAULT '' NOT NULL"))


MIGRATIONS: list[tuple[int, Callable[[Connection], None]]] = [
    (1, _m1_initial),
    (2, _m2_task_fields),
    (3, _m3_course_fields),
]
SCHEMA_VERSION = MIGRATIONS[-1][0]


def _sqlite_path() -> str | None:
    url = database_url()
    if url.startswith("sqlite:///") and ":memory:" not in url:
        return url.replace("sqlite:///", "", 1)
    return None


def backup_database_file() -> str | None:
    path = _sqlite_path()
    if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = f"{path}.bak-{stamp}"
    shutil.copy2(path, dest)
    log.info("Database backed up to %s before migration", dest)
    return dest


def migrate() -> int:
    """Create tables and apply pending migrations. Returns the resulting schema version."""
    from . import models  # noqa: F401  (register tables)

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)"))
        row = conn.execute(text("SELECT version FROM schema_version")).first()
        current = row[0] if row else 0
        has_tables = conn.execute(text("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='task'")).scalar() if engine.dialect.name == "sqlite" else 0

    if current < SCHEMA_VERSION and has_tables:
        backup_database_file()

    # Older databases: add new columns before create_all (which never alters existing tables).
    with engine.begin() as conn:
        if has_tables:
            for version, fn in MIGRATIONS:
                if version > current:
                    fn(conn)
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM schema_version"))
        conn.execute(text("INSERT INTO schema_version (version) VALUES (:v)"), {"v": SCHEMA_VERSION})
    return SCHEMA_VERSION
