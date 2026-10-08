"""Loopback-only browser fixture: real API/auth/config, synthetic upstream data.

Run from the repo root: python tests/browser_server.py
Point the frontend at http://localhost:8082 and run it on localhost:3002.
"""
import atexit
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import threading
import time

import uvicorn
from fastapi import Response

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
temporary = tempfile.TemporaryDirectory(prefix="dunecatalog-browser-")
atexit.register(temporary.cleanup)
directory = Path(temporary.name)
os.environ.update({
    "ENVIRONMENT": "development",
    "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "CILOGON_CLIENT_ID": "browser-test",
    "CILOGON_CLIENT_SECRET": "browser-test",
    "CILOGON_REDIRECT_URI": "http://localhost:8082/auth/callback",
    "FRONTEND_URL": "http://localhost:3002/dunecatalog",
})

from src.backend import auth, main
from src.lib import mcatapi

main.CONFIG_PATH = str(directory)
(directory / "admins.json").write_text(json.dumps({"admins": ["browser@example.invalid"]}))
state = {"fail_sizes": True, "delay": 0.1, "size_requests": 0,
         "active": 0, "max_active": 0, "queries": 0}
lock = threading.Lock()


@main.app.get("/__test__/login")
def login(response: Response, email: str = "browser@example.invalid", subject: str = "browser-test"):
    token = auth.create_access_token({"sub": subject, "email": email,
        "identity_issuer": auth.CILOGON_ISSUER, "name": "Browser Test"})
    response.set_cookie(auth.TOKEN_COOKIE, token, httponly=True, samesite="lax")
    return {"authenticated": True}


@main.app.get("/__test__/state")
def read_state():
    return state


@main.app.post("/__test__/state")
def set_state(settings: dict):
    with lock:
        if settings.pop("clear_sizes", False):
            mcatapi._dataset_size_cache.clear()
        state.update(settings)
    return state


def datasets(query, category, tab, official_only, custom_mql=None, is_cancelled=lambda: False):
    state["queries"] += 1
    return {"success": True, "mqlQuery": "datasets matching audit:*", "results": [
        {"namespace": "audit", "name": f"dataset-{i:02}", "creator": "test",
         "created": 0, "files": 1, "size": 0 if i == 0 else None}
        for i in range(50)
    ]}


real_sizes = main.metacat_api.get_dataset_sizes


def sizes(datasets, is_cancelled=lambda: False):
    with lock:
        state["size_requests"] += 1
        fail = state["fail_sizes"]
    if fail:
        from fastapi import HTTPException
        raise HTTPException(503, "Synthetic temporary size-service failure")
    return real_sizes(datasets, is_cancelled=is_cancelled)


def aggregate(query, is_cancelled, **kwargs):
    with lock:
        state["active"] += 1
        state["max_active"] = max(state["max_active"], state["active"])
    try:
        time.sleep(state["delay"])
        mcatapi._check_cancelled(is_cancelled)
        index = int(query.rsplit("-", 1)[1])
        return {"total_size": index * 1000}
    finally:
        with lock:
            state["active"] -= 1


main.metacat_api.get_datasets = datasets
main.metacat_api.get_dataset_sizes = sizes
main.metacat_api._consume_query = aggregate

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=8082)
