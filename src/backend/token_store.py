"""
token_store.py — per-user store for the long-lived FNAL vault token.

The vault token (valid days-to-weeks) is the user's credential. This default
implementation keeps it in memory, per process: simple, and fine for a catalog
tool. Consequences to accept:
  - tokens are lost on restart -> the user just reconnects to FNAL once
  - not shared across uvicorn workers -> each worker holds its own; harmless

If you ever need tokens to survive restarts, replace this class with one that
encrypts at rest (e.g. cryptography.Fernet) and persists; keep the same
put/get/delete interface so nothing else changes.
"""

import threading


class InMemoryVaultTokenStore:
    def __init__(self):
        self._d = {}
        self._lock = threading.Lock()

    def put(self, user, vault_token, credkey):
        with self._lock:
            self._d[user] = {"vault_token": vault_token, "credkey": credkey}

    def get(self, user):
        with self._lock:
            return self._d.get(user)

    def delete(self, user):
        with self._lock:
            self._d.pop(user, None)
