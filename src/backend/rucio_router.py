"""
rucio_router.py — FastAPI router for the read-only replica feature.
Place in src/backend/ and include it from src/backend/main.py:

    from src.backend import rucio_router
    app.include_router(rucio_router.router)

Endpoints (under the same base as the other backend routes):
  POST /rucio/login/start  -> {login_id, auth_url}
  GET  /rucio/login/poll   -> {status: pending|complete}
  GET  /rucio/replicas     -> {replicas:[{rse, pfn}, ...]}  (401 reauth_required)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from src.backend import auth
from src.backend.htvault import HTVaultClient, HTVaultError
from src.backend.rucio_reader import RucioReader, NeedReLogin, DEFAULT_SCHEMES
from src.backend.token_store import InMemoryVaultTokenStore

router = APIRouter(prefix="/rucio", tags=["rucio"])

vault = HTVaultClient(issuer="dune", role="default")
tokens = InMemoryVaultTokenStore()
reader = RucioReader(vault, token_store=tokens.get,
                     rucio_host="https://dune-rucio.fnal.gov", domain="wan")

_PENDING = {}  # login_id -> {"user", "session"}


@router.post("/login/start")
def login_start(user: auth.UserInfo = Depends(auth.get_current_user)):
    started = vault.begin_auth()
    login_id = uuid.uuid4().hex
    _PENDING[login_id] = {"user": user.sub, "session": started["session"]}
    return {"login_id": login_id, "auth_url": started["auth_url"]}


@router.get("/login/poll")
def login_poll(login_id: str,
               user: auth.UserInfo = Depends(auth.get_current_user)):
    entry = _PENDING.get(login_id)
    if not entry or entry["user"] != user.sub:
        raise HTTPException(404, "unknown login_id")
    try:
        result = vault.poll_once(entry["session"])
    except HTVaultError as e:
        _PENDING.pop(login_id, None)
        raise HTTPException(400, str(e))
    if result is None:
        return {"status": "pending"}
    tokens.put(user.sub, result["vault_token"], result["credkey"])
    _PENDING.pop(login_id, None)
    return {"status": "complete"}

@router.get("/replicas")
def replicas(scope: str = Query(...),
             name: str = Query(...),
             user: auth.UserInfo = Depends(auth.get_current_user)):
    try:
        sites = reader.get_replicas(user.sub, scope, name, schemes=DEFAULT_SCHEMES)
    except NeedReLogin:
        raise HTTPException(
            status_code=401,
            detail={"error": "reauth_required",
                    "message": "Your FNAL session has expired — please reconnect "
                               "to FNAL to refresh access."})
    return {"scope": scope, "name": name, "sites": sites}
