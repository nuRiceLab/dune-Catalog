"""Active catalog sessions. Store identifiers and expiry, never raw credentials."""
import sqlite3
import time
from contextlib import closing
from pathlib import Path


class SessionStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=5)) as connection, connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS sessions "
                "(jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)"
            )

    def register(self, jti: str, expires_at: int) -> None:
        with closing(sqlite3.connect(self.path, timeout=5)) as connection, connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            connection.execute("INSERT INTO sessions VALUES (?, ?)", (jti, expires_at))

    def is_active(self, jti: str) -> bool:
        with closing(sqlite3.connect(self.path, timeout=5)) as connection:
            return connection.execute(
                "SELECT 1 FROM sessions WHERE jti = ? AND expires_at > ?",
                (jti, int(time.time())),
            ).fetchone() is not None

    def revoke(self, jti: str) -> None:
        with closing(sqlite3.connect(self.path, timeout=5)) as connection, connection:
            connection.execute("DELETE FROM sessions WHERE jti = ? OR expires_at <= ?",
                               (jti, int(time.time())))
