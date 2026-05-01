from __future__ import annotations

import sqlite3


SCHEMA_VERSION = 2


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA temp_store=MEMORY")
    connection.execute("PRAGMA foreign_keys=ON")
    _initialize_meta(connection)
    _initialize_jobs(connection)
    _initialize_images(connection)
    _set_schema_version(connection, SCHEMA_VERSION)
    connection.commit()


def _initialize_meta(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


def _initialize_jobs(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            status TEXT NOT NULL,
            prompt TEXT NOT NULL,
            workflow TEXT NOT NULL,
            quality TEXT NOT NULL DEFAULT '',
            size TEXT NOT NULL DEFAULT '',
            compat_profile_id TEXT NOT NULL DEFAULT '',
            output_profile_id TEXT NOT NULL DEFAULT '',
            image_count INTEGER NOT NULL DEFAULT 0,
            payload TEXT NOT NULL
        )
        """
    )
    _add_column_if_missing(connection, "jobs", "quality", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(connection, "jobs", "size", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(connection, "jobs", "compat_profile_id", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(connection, "jobs", "output_profile_id", "TEXT NOT NULL DEFAULT ''")
    _add_column_if_missing(connection, "jobs", "image_count", "INTEGER NOT NULL DEFAULT 0")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC, id DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON jobs(updated_at DESC, id DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_jobs_prompt ON jobs(prompt)")


def _initialize_images(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS job_images (
            job_id TEXT NOT NULL,
            slot INTEGER NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            preview_url TEXT NOT NULL DEFAULT '',
            width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0,
            placeholder_color TEXT NOT NULL DEFAULT '',
            placeholder_accent_color TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY (job_id, slot),
            FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_job_images_job_id ON job_images(job_id, slot)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_job_images_created_at ON job_images(created_at DESC, job_id, slot)")


def _add_column_if_missing(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _set_schema_version(connection: sqlite3.Connection, version: int) -> None:
    connection.execute(
        """
        INSERT INTO schema_meta (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (str(version),),
    )
