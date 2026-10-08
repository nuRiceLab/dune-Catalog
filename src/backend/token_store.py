"""Session-scoped, expiring FNAL credentials; restart requires reconnection."""
import threading
import time


class InMemoryVaultTokenStore:
    def __init__(self):
        self._d = {}
        self._lock = threading.Lock()

    def put(self, session_id, vault_token, credkey, expires_at):
        with self._lock:
            self._prune()
            if expires_at > time.time():
                self._d[session_id] = {
                    "vault_token": vault_token, "credkey": credkey,
                    "expires_at": expires_at,
                }

    def get(self, session_id):
        with self._lock:
            self._prune()
            return self._d.get(session_id)

    def delete(self, session_id):
        with self._lock:
            return self._d.pop(session_id, None)

    def _prune(self):
        now = time.time()
        for key in [key for key, item in self._d.items() if item["expires_at"] <= now]:
            self._d.pop(key, None)
