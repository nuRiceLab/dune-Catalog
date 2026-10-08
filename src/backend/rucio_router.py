"""Read-only replica queries and session-scoped FNAL connections."""
import logging
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.backend import auth
from src.backend.htvault import HTVaultClient
from src.backend.rucio_reader import RucioReader, NeedReLogin, DEFAULT_SCHEMES
from src.backend.token_store import InMemoryVaultTokenStore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rucio", tags=["rucio"])
vault = HTVaultClient(issuer="dune", role="default")
tokens = InMemoryVaultTokenStore()
reader = RucioReader(vault, token_store=tokens.get)

# ponytail: process-local credentials require one worker; use shared secure storage
# if deployment needs multiple workers. Restart intentionally requires reconnection.
_PENDING = {}
_PENDING_LOCK = threading.Lock()
_LOGIN_TTL = 300


class LoginPollRequest(BaseModel):
    login_id: str


def _revoke_vault_token(token: str) -> bool:
    try:
        vault.revoke_token(token)
        return True
    except Exception as error:
        logger.warning("FNAL revocation could not be confirmed (%s)", type(error).__name__)
        return False


def clear_session(session_id: str):
    with _PENDING_LOCK:
        _PENDING.pop(session_id, None)
        credentials = tokens.delete(session_id)
    return _revoke_vault_token(credentials["vault_token"]) if credentials else None


@router.post("/login/start")
def login_start(user: auth.UserInfo = Depends(auth.get_current_user)):
    entry = {
        "login_id": uuid.uuid4().hex,
        "expires_at": min(time.time() + _LOGIN_TTL, user.session_expires_at),
        "next_poll": 0.0, "polling": False,
    }
    with _PENDING_LOCK:
        now = time.time()
        for key in [key for key, value in _PENDING.items() if value["expires_at"] <= now]:
            _PENDING.pop(key, None)
        if entry["expires_at"] <= now:
            raise HTTPException(401, "Session expired")
        _PENDING[user.session_id] = entry
    try:
        started = vault.begin_auth()
    except Exception:
        with _PENDING_LOCK:
            if _PENDING.get(user.session_id) is entry:
                _PENDING.pop(user.session_id, None)
        raise
    with _PENDING_LOCK:
        if _PENDING.get(user.session_id) is not entry or entry["expires_at"] <= time.time():
            raise HTTPException(401, "Session or FNAL login expired; reconnect")
        entry["session"] = started["session"]
    return {
        "login_id": entry["login_id"], "auth_url": started["auth_url"],
        "poll_interval": started["session"]["poll_interval"],
    }


@router.post("/login/poll")
def login_poll(request: LoginPollRequest,
               user: auth.UserInfo = Depends(auth.get_current_user)):
    with _PENDING_LOCK:
        entry = _PENDING.get(user.session_id)
        if not entry or entry["login_id"] != request.login_id:
            raise HTTPException(404, "Unknown login")
        if entry["expires_at"] <= time.time():
            _PENDING.pop(user.session_id, None)
            raise HTTPException(410, "FNAL login expired")
        interval = entry["session"]["poll_interval"]
        if entry["polling"] or entry["next_poll"] > time.time():
            return {"status": "pending", "poll_interval": interval}
        entry["polling"] = True
    try:
        result = vault.poll_once(entry["session"])
    except Exception as error:
        with _PENDING_LOCK:
            if _PENDING.get(user.session_id) is entry:
                _PENDING.pop(user.session_id, None)
        logger.warning("FNAL login polling failed (%s)", type(error).__name__)
        raise HTTPException(502, "FNAL login failed; reconnect and try again")
    if result is None:
        interval = entry["session"]["poll_interval"]
        with _PENDING_LOCK:
            entry["polling"] = False
            entry["next_poll"] = time.time() + interval
        return {"status": "pending", "poll_interval": interval}
    accepted = False
    previous_credentials = None
    try:
        expires_at = min(user.session_expires_at,
                         time.time() + max(0, int(result.get("lease_duration") or 0)))
        with _PENDING_LOCK:
            if (_PENDING.get(user.session_id) is entry
                    and entry["expires_at"] > time.time()
                    and expires_at > time.time()):
                previous_credentials = tokens.delete(user.session_id)
                tokens.put(user.session_id, result["vault_token"], result["credkey"], expires_at)
                _PENDING.pop(user.session_id, None)
                accepted = True
    finally:
        if previous_credentials and previous_credentials["vault_token"] != result["vault_token"]:
            _revoke_vault_token(previous_credentials["vault_token"])
        if not accepted:
            _revoke_vault_token(result["vault_token"])
    if not accepted:
        raise HTTPException(401, "Session or FNAL login expired; reconnect")
    return {"status": "complete"}


@router.get("/replicas")
def replicas(scope: str = Query(...), name: str = Query(...),
             user: auth.UserInfo = Depends(auth.get_current_user)):
    try:
        sites = reader.get_replicas(user.session_id, scope, name, schemes=DEFAULT_SCHEMES)
    except NeedReLogin:
        # A reconnect may have installed a newer token while this lookup ran.
        # Expired entries are already pruned by the store.
        raise HTTPException(401, detail={
            "error": "reauth_required", "message": "Reconnect to FNAL to refresh access."
        })
    return {"scope": scope, "name": name, "sites": sites}
