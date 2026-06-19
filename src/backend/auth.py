"""CILogon OIDC authentication (Authorization Code Flow with PKCE).

Flow overview
-------------
1. Browser hits ``GET /auth/login`` -> we generate ``state`` and a PKCE
   ``code_verifier``/``code_challenge`` pair, stash them in short-lived,
   httpOnly cookies, and redirect the user to the CILogon authorization
   endpoint.
2. After the user authenticates at CILogon, the browser is redirected to
   ``GET /auth/callback?code=...&state=...``. We validate ``state``, exchange
   ``code`` + ``code_verifier`` for tokens at CILogon's token endpoint, then
   call the userinfo endpoint to fetch profile claims.
3. We mint our own HS256 JWT containing those claims and store it in an
   httpOnly ``dunecat_token`` cookie, then redirect the user back to the
   frontend.
4. ``GET /auth/me`` and ``Depends(get_current_user)`` verify the JWT on every
   subsequent request.

Adapted from the sibling ``dune-pro-ai-agent`` project. This module reads its
configuration straight from environment variables (loaded from ``.env`` by
``run.py``) to match the rest of the DUNE Catalog backend, and gates admin
access with an email allowlist (``src/config/admins.json``) instead of MetaCat
usernames.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration (from environment / .env)
# ---------------------------------------------------------------------------

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRY_MINUTES", "1440"))
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

CILOGON_CLIENT_ID = os.getenv("CILOGON_CLIENT_ID", "")
CILOGON_CLIENT_SECRET = os.getenv("CILOGON_CLIENT_SECRET", "")
CILOGON_REDIRECT_URI = os.getenv("CILOGON_REDIRECT_URI", "")
CILOGON_DISCOVERY_URL = os.getenv(
    "CILOGON_DISCOVERY_URL",
    "https://cilogon.org/.well-known/openid-configuration",
)
CILOGON_SCOPES = os.getenv(
    "CILOGON_SCOPES", "openid email profile org.cilogon.userinfo"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001/dunecatalog")

# Cookie names
TOKEN_COOKIE = "dunecat_token"
STATE_COOKIE = "dunecat_oauth_state"
VERIFIER_COOKIE = "dunecat_oauth_verifier"

# Short-lived cookies used only during the OAuth round-trip.
_OAUTH_COOKIE_TTL_SECONDS = 10 * 60  # 10 minutes

# Cached OIDC discovery document (fetched lazily on first use).
_discovery_cache: Optional[dict[str, Any]] = None

# Admin email allowlist, populated by ``set_admin_emails`` at startup and
# whenever admins.json is edited via the admin config API.
_admin_emails: set[str] = set()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class UserInfo(BaseModel):
    sub: str
    email: Optional[str] = None
    name: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    idp_name: Optional[str] = None
    is_admin: bool = False


class AuthResponse(BaseModel):
    authenticated: bool
    message: str
    user: Optional[UserInfo] = None


# ---------------------------------------------------------------------------
# Admin allowlist
# ---------------------------------------------------------------------------


def set_admin_emails(emails: list[str]) -> None:
    """Replace the in-memory admin allowlist (case-insensitive emails)."""
    global _admin_emails
    _admin_emails = {e.strip().lower() for e in emails if e and e.strip()}
    logger.info("Loaded %d admin email(s)", len(_admin_emails))


def is_admin(email: Optional[str]) -> bool:
    """Return True if ``email`` is on the admin allowlist."""
    if not email:
        return False
    return email.strip().lower() in _admin_emails


# ---------------------------------------------------------------------------
# OIDC discovery
# ---------------------------------------------------------------------------


async def get_discovery_document() -> dict[str, Any]:
    """Fetch and cache the CILogon OIDC discovery document."""
    global _discovery_cache
    if _discovery_cache is None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(CILOGON_DISCOVERY_URL)
            resp.raise_for_status()
            _discovery_cache = resp.json()
        logger.debug("Loaded CILogon OIDC discovery from %s", CILOGON_DISCOVERY_URL)
    return _discovery_cache


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _generate_pkce_pair() -> tuple[str, str]:
    """Return a ``(code_verifier, code_challenge)`` pair for PKCE S256."""
    verifier = _base64url_encode(secrets.token_bytes(32))
    challenge = _base64url_encode(hashlib.sha256(verifier.encode("ascii")).digest())
    return verifier, challenge


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_access_token(
    claims: dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Mint an HS256 JWT with the given claims plus an ``exp``."""
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY is not configured")
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {**claims, "exp": expire}
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> Optional[dict[str, Any]]:
    """Return the decoded claims if the token is valid, else ``None``."""
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        logger.debug("Rejected expired JWT")
        return None
    except jwt.InvalidTokenError as exc:
        logger.debug("Rejected invalid JWT: %s", exc)
        return None


def _claims_to_user_info(claims: dict[str, Any]) -> UserInfo:
    email = claims.get("email")
    return UserInfo(
        sub=str(claims.get("sub", "")),
        email=email,
        name=claims.get("name"),
        given_name=claims.get("given_name"),
        family_name=claims.get("family_name"),
        idp_name=claims.get("idp_name"),
        is_admin=is_admin(email),
    )


def get_current_user(request: Request) -> UserInfo:
    """FastAPI dependency that resolves the authenticated user or 401s."""
    token = request.cookies.get(TOKEN_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    claims = decode_token(token)
    if claims is None or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Not authenticated")

    return _claims_to_user_info(claims)


def require_admin(request: Request) -> UserInfo:
    """FastAPI dependency: authenticated AND on the admin allowlist."""
    user = get_current_user(request)
    if not user.is_admin:
        logger.warning(
            "Admin access denied for sub=%s email=%s", user.sub, user.email
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return user


# ---------------------------------------------------------------------------
# OIDC flow: /auth/login -> CILogon
# ---------------------------------------------------------------------------


def _oauth_cookie_kwargs() -> dict[str, Any]:
    return {
        "httponly": True,
        "secure": IS_PRODUCTION,
        "samesite": "lax",
        "max_age": _OAUTH_COOKIE_TTL_SECONDS,
        "path": "/",
    }


async def login_start() -> RedirectResponse:
    """Kick off the CILogon authorization-code + PKCE flow."""
    if not CILOGON_CLIENT_ID or not CILOGON_REDIRECT_URI:
        logger.error("CILogon is not configured (missing client id / redirect uri)")
        return _frontend_redirect("/", auth_error="not_configured")

    discovery = await get_discovery_document()
    authorization_endpoint = discovery["authorization_endpoint"]

    state = secrets.token_urlsafe(32)
    verifier, challenge = _generate_pkce_pair()

    params = {
        "response_type": "code",
        "client_id": CILOGON_CLIENT_ID,
        "redirect_uri": CILOGON_REDIRECT_URI,
        "scope": CILOGON_SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    redirect_url = f"{authorization_endpoint}?{urlencode(params)}"

    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    cookie_kwargs = _oauth_cookie_kwargs()
    response.set_cookie(STATE_COOKIE, state, **cookie_kwargs)
    response.set_cookie(VERIFIER_COOKIE, verifier, **cookie_kwargs)

    logger.info("Redirecting user to CILogon authorization endpoint")
    return response


# ---------------------------------------------------------------------------
# OIDC flow: /auth/callback <- CILogon
# ---------------------------------------------------------------------------


def _frontend_redirect(path: str = "/", **query: str) -> RedirectResponse:
    """Build a 302 redirect to ``FRONTEND_URL + path`` with optional query."""
    base = FRONTEND_URL.rstrip("/")
    path = path if path.startswith("/") else f"/{path}"
    url = f"{base}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


def _clear_oauth_cookies(response: Response) -> None:
    response.delete_cookie(STATE_COOKIE, path="/")
    response.delete_cookie(VERIFIER_COOKIE, path="/")


async def login_callback(request: Request) -> RedirectResponse:
    """Handle the CILogon redirect, exchange code for tokens, issue JWT."""
    query = request.query_params

    # CILogon returned an error (e.g., user canceled).
    if error := query.get("error"):
        logger.warning(
            "CILogon returned error=%s description=%s",
            error,
            query.get("error_description"),
        )
        response = _frontend_redirect("/", auth_error=error)
        _clear_oauth_cookies(response)
        return response

    code = query.get("code")
    state = query.get("state")
    expected_state = request.cookies.get(STATE_COOKIE)
    verifier = request.cookies.get(VERIFIER_COOKIE)

    if (
        not code
        or not state
        or not expected_state
        or state != expected_state
        or not verifier
    ):
        logger.warning(
            "Invalid OAuth callback (code=%s, state_match=%s, verifier_present=%s)",
            bool(code),
            bool(state) and state == expected_state,
            bool(verifier),
        )
        response = _frontend_redirect("/", auth_error="invalid_state")
        _clear_oauth_cookies(response)
        return response

    discovery = await get_discovery_document()
    token_endpoint = discovery["token_endpoint"]
    userinfo_endpoint = discovery["userinfo_endpoint"]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": CILOGON_REDIRECT_URI,
                    "client_id": CILOGON_CLIENT_ID,
                    "client_secret": CILOGON_CLIENT_SECRET,
                    "code_verifier": verifier,
                },
                headers={"Accept": "application/json"},
            )
            token_resp.raise_for_status()
            tokens = token_resp.json()

            access_token = tokens.get("access_token")
            if not access_token:
                raise RuntimeError("CILogon token response did not include access_token")

            userinfo_resp = await client.get(
                userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_resp.raise_for_status()
            userinfo = userinfo_resp.json()
    except (httpx.HTTPError, RuntimeError) as exc:
        logger.exception("CILogon token/userinfo exchange failed: %s", exc)
        response = _frontend_redirect("/", auth_error="token_exchange_failed")
        _clear_oauth_cookies(response)
        return response

    sub = userinfo.get("sub")
    if not sub:
        logger.error("CILogon userinfo is missing 'sub' claim: %s", userinfo)
        response = _frontend_redirect("/", auth_error="missing_subject")
        _clear_oauth_cookies(response)
        return response

    claims = {
        "sub": sub,
        "email": userinfo.get("email"),
        "name": userinfo.get("name"),
        "given_name": userinfo.get("given_name"),
        "family_name": userinfo.get("family_name"),
        "idp_name": userinfo.get("idp_name"),
    }
    jwt_token = create_access_token(
        claims,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    response = _frontend_redirect("/")
    response.set_cookie(
        key=TOKEN_COOKIE,
        value=jwt_token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    _clear_oauth_cookies(response)

    logger.info(
        "User %s (sub=%s) logged in via CILogon idp=%s",
        userinfo.get("email") or "<no-email>",
        sub,
        userinfo.get("idp_name"),
    )
    return response


# ---------------------------------------------------------------------------
# Session helpers: /auth/me and /auth/logout
# ---------------------------------------------------------------------------


async def logout(response: Response) -> AuthResponse:
    response.delete_cookie(key=TOKEN_COOKIE, path="/")
    logger.info("User logged out")
    return AuthResponse(authenticated=False, message="Logout successful")


async def check_auth(request: Request) -> AuthResponse:
    token = request.cookies.get(TOKEN_COOKIE)
    if not token:
        return AuthResponse(authenticated=False, message="Not authenticated")

    claims = decode_token(token)
    if claims is None or not claims.get("sub"):
        return AuthResponse(authenticated=False, message="Not authenticated")

    return AuthResponse(
        authenticated=True,
        message="Authenticated",
        user=_claims_to_user_info(claims),
    )
