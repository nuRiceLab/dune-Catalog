# Catalog Security and Reliability Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Checkboxes track implementation; creating this plan does not authorize deployment or production configuration changes.

**Goal:** Close the six security findings, then fix the startup, cancellation, and search regressions identified in the architectural audit.

**Architecture:** Keep Next.js, FastAPI, CILogon, and the existing JWT flow. Add a small active-session registry using Python's `sqlite3` so logout revokes tokens across restarts. Reuse existing API adapters and UI components; require trusted request origins, identify administrators by CILogon subject, and bind FNAL credentials to a catalog session.

**Tech Stack:** Python, FastAPI, Pydantic, PyJWT, httpx, AnyIO, SQLite from the standard library, Next.js, React, TypeScript, Axios.

**Spec:** The architectural and security audits in this conversation, against `cd966aea...1d4d76e`. The requirements and acceptance cases are captured below; there is no separate repository specification.

## Scope and sequence

The user confirmed both audits are in scope, with security first. Tasks 1–5 form the security release. Tasks 6–7 form the reliability follow-up. Task 8 describes verification and rollout for each release. Each task should be a separately reviewable commit.

| Finding | Owning task | Required outcome |
|---|---|---|
| Empty or placeholder JWT secret permits forgery | 1 | Startup refuses insecure configuration; decoding also fails closed |
| Cookies may lack Secure in production | 1 | Production entrypoints consistently issue Secure cookies |
| Missing Conditions DB URL crashes all routes | 1 | Optional integration cannot crash catalog startup |
| Admin access relies on unverified email | 2 | Only explicitly enrolled CILogon identities receive admin access |
| Cookie authentication permits CSRF against state changes | 3 | Untrusted origins cannot mutate application state |
| Logout leaves copied JWT valid | 4 | Every request checks an active session; logout removes it |
| Shared replica cache bypasses FNAL access checks | 5 | Every replica request uses the caller's FNAL credentials |
| Pending FNAL logins and credentials lack cleanup | 5 | State expires, belongs to a session, and is removed on logout |
| Cancellation helper is unused | 6 | Disconnect and timeout reach the upstream operation |
| Search errors appear as successful empty results | 7 | Errors, expired sessions, and empty results are distinct |
| Search URL and controls disagree | 7 | Reloaded and shared URLs restore all search controls |
| Size sorting uses incomplete data | 7 | Sorting is available only when it can be correct |
| Conditions responses can arrive for an old selection | 7 | Switching folder or mode cancels and discards the old response |
| File route decodes names twice | 7 | Percent characters in valid names survive navigation |

The last two rows were found during the review and are small fixes in the same UI paths. Task 2 also closes the existing unrestricted config filename handling while changing that endpoint; that filename issue predates these commits.

## Global constraints

- Follow the supplied AGENTS.md: prefer the smallest clear solution and preserve security, validation, error handling, accessibility, and proportionate tests.
- Add no runtime dependencies. Use installed libraries and the Python standard library.
- Preserve the current CILogon state and PKCE flow and the public `/auth/me` response shape, with an additional identity issuer field if needed by the admin UI.
- Never write credentials or real session cookies to the plan, repository, test output, or logs.
- Use one FastAPI worker for the first release, matching `run.py`. FNAL credentials remain in memory and reconnect after a restart. Document this constraint explicitly; do not claim multi-worker FNAL support.
- Store SQLite on local disk outside this checkout and outside OneDrive/network shares. Production supplies `SESSION_DB_PATH`; a local development path can live under the user's local application data directory.
- A failed session database read must deny access or return a service error, never fall back to signature-only authentication.
- Treat all old sessions as expired during migration. Keep signing secrets unique to this application.
- Keep any live CILogon/FNAL check limited to the operator's test account. Automated checks use synthetic claims and fake upstream responses.
- Planning creates this file only. Implementation, publication, and deployment are separate actions.

## Review focus

1. An operator starts the backend directly through Uvicorn instead of `run.py`: the same security validation must run (Task 1).
2. A different CILogon identity claims an administrator's email: access remains denied (Task 2).
3. A request carries `Origin: null`, no origin headers, a sibling hostname, or a hostname suffix trick: no mutation occurs (Task 3).
4. Logout races with FNAL polling, or the process restarts afterward: neither action restores the logged-out session or its credentials (Tasks 4–5).
5. A slow response completes after navigation or a filter change: it cannot overwrite newer state or trigger more upstream queries (Tasks 6–7).

## File responsibilities

| Files | Changes |
|---|---|
| `src/backend/auth.py`, `run.py` | Configuration checks, identity decisions, JWT/session validation, cookie settings |
| `src/backend/main.py` | Startup validation, trusted-origin dependency, logout orchestration, safe config writes, cancellable query routes |
| `src/backend/session_store.py` (new) | Small SQLite active-session registry; no ORM or general storage interface |
| `src/backend/token_store.py`, `rucio_router.py`, `rucio_reader.py`, `htvault.py` | Session-scoped FNAL credentials, pending login expiry, cache removal, token revocation |
| `src/config/admins.json`, `src/app/admin/users/page.tsx` | Administrator identity schema and editing |
| `src/lib/auth.ts`, `src/context/AuthContext.tsx`, `src/components/Header.tsx`, `src/lib/rucio.ts` | Accurate logout behavior and protected FNAL polling |
| `src/lib/condb_api.py`, `src/backend/condb_router.py` | Optional startup configuration and cancellable requests |
| `src/backend/cancellable.py`, `src/lib/mcatapi.py` | Cancellation propagation, request-owned upstream connections, bounded aggregate work |
| `src/lib/api.ts`, `src/app/page.tsx`, `src/components/SearchBar.tsx`, `DatasetDialog.tsx`, `DatasetTable.tsx`, `ConditionsDbPanel.tsx` | Errors, URL state, honest sorting, stale-request handling |
| `src/app/file/[namespace]/[name]/page.tsx` | Use route parameters without a second decode |
| `.env.example`, `.gitignore`, `README.md` | Required configuration, admin migration, deployment limits, state-file exclusions |
| `tests/test_security.py`, `tests/test_queries.py` (new) | Focused standard-library regression checks using existing FastAPI/httpx tooling |

## Task 1: Fail closed at startup and make cookie behavior explicit

**Files:** `auth.py`, `main.py`, `run.py`, `condb_api.py`, `condb_router.py`, `.env.example`, `README.md`, `tests/test_security.py`.

**Interfaces:** Add `validate_security_configuration() -> None` in `auth.py`; call it from the FastAPI startup path and the runner. It raises a configuration error without including secret values.

- [ ] Add a regression check for empty, whitespace-only, short, and example signing keys. The current empty-key case must demonstrate that a synthetic token can pass `require_admin`; the corrected code must refuse it.
- [ ] Require a generated signing secret of at least 32 bytes. Use `secrets.token_urlsafe(48)` in the setup instructions. Reject known example values; length is a minimum requirement, not a claim that arbitrary strings have sufficient entropy.
- [ ] Keep a defensive invalid-key check in `decode_token`, so callers that bypass application startup cannot authenticate with an empty key. Require `sub` and `exp`, retain the fixed algorithm allowlist, and add the session requirements in Task 4.

```python
def validate_security_configuration() -> None:
    if len(JWT_SECRET_KEY.encode("utf-8")) < 32 or not JWT_SECRET_KEY.strip():
        raise RuntimeError("Configure JWT_SECRET_KEY with a generated application-specific secret")

def decode_token(token: str):
    if len(JWT_SECRET_KEY.encode("utf-8")) < 32:
        return None
    # Retain the existing invalid/expired-token exception handling.
    return jwt.decode(
        token, JWT_SECRET_KEY, algorithms=["HS256"],
        options={"require": ["sub", "exp"]},
    )
```

- [ ] Make development an explicit mode. After `.env` loading, `run.py --production` sets `ENVIRONMENT=production` before importing backend modules. Direct backend startup defaults to production-safe settings. Production requires HTTPS callback and frontend URLs and sets `Secure` on both OAuth and session cookies; HTTP exceptions are limited to explicit localhost development.
- [ ] Replace the usable example secret with an empty assignment and a generation instruction. Validate the CILogon client ID, client secret, redirect URI, and frontend URL at startup with clear messages.
- [ ] Normalize `CONDB_BASE_URL` with `(base_url or "").rstrip("/")`. Leave the integration optional: calls to its endpoints return 503 when it is not configured, while normal catalog and auth routes remain available. Add the optional setting to `.env.example` and document it.
- [ ] Verify startup without ConDB configuration, startup rejection with a missing signing key, direct Uvicorn startup validation, and production cookie attributes. Add no live upstream dependency to these tests.

**Check:** `python -m unittest discover -s tests -p test_security.py -v`.

## Task 2: Migrate administrators to stable CILogon identities

**Files:** `auth.py`, `main.py`, `src/config/admins.json`, `src/app/admin/users/page.tsx`, `src/lib/auth.ts`, `README.md`, `tests/test_security.py`.

**Interfaces:** Use administrator records with `issuer: str`, `sub: str`, and optional display-only `email: str`. Add `set_admin_identities(records) -> None` and `is_admin(issuer: str, sub: str) -> bool`; replace all email-based callers together. Expose `identity_issuer` on public user information.

- [ ] Pin authorization to the fixed CILogon issuer `https://cilogon.org` and the exact `sub` returned by the server's authenticated CILogon exchange. Check the discovery issuer against that expected issuer. Email and display name never affect authorization.
- [ ] Store the identity issuer separately from the application's JWT issuer. Task 4 uses `iss="dune-catalog"`; the CILogon identity belongs in `identity_issuer`.
- [ ] Use the following JSON shape. Start with no automatically enrolled identities; actual production subjects are a rollout prerequisite, not values inferred from existing email addresses.

```json
{"admins": []}
```

```python
def is_admin(issuer: str, sub: str) -> bool:
    return (issuer, sub) in _admin_identities

# Representative regression case; these are synthetic identities.
set_admin_identities([{"issuer": "https://cilogon.org", "sub": "audit-admin"}])
assert is_admin("https://cilogon.org", "audit-admin")
assert not is_admin("https://cilogon.org", "different-person")
assert not is_admin("https://untrusted.example.invalid", "audit-admin")
```

- [ ] Update both form and JSON modes of the admin editor. Validate every identity on the backend before replacing `admins.json`; reject old string/email entries, malformed records, and an empty replacement from the admin endpoint. Initial operator provisioning may use an empty list until enrollment is complete.
- [ ] Protect the config API's filename parameter with an exact allowlist: `config.json`, `admins.json`, `dataset_access_stats.json`, `helpContent.json`. Resolve paths inside `CONFIG_PATH`, reject escapes, and preserve HTTP 400/403 errors instead of converting them to 500.
- [ ] Write replacement config files into the same directory and use `os.replace` after validation. Reload the in-process allowlist only after a successful write. This keeps authorization state consistent with the file on disk.
- [ ] Document migration: each intended administrator signs in, obtains their own authenticated identity from `/auth/me`, and the operator verifies and enrolls that identity before rollout. Do not retain an email fallback or a first-user-becomes-admin rule.
- [ ] Check two subjects sharing the same email, missing subjects, wrong issuers, malformed admin JSON, denied filename traversal, and immediate loss of admin access after removal.

**Checks:** security regression command above; `npx tsc --noEmit`; one browser check of the admin editor with a synthetic backend.

## Task 3: Protect state changes against forged browser requests

**Files:** `auth.py`, `main.py`, `rucio_router.py`, `src/lib/rucio.ts`, `README.md`, `tests/test_security.py`.

**Interfaces:** Add `require_trusted_origin(request: Request) -> None` as a global FastAPI dependency. Change `/rucio/login/poll` to POST with JSON `{ "login_id": string }`; GET returns 405.

- [ ] Derive the permitted frontend origin from configured `FRONTEND_URL` using `urllib.parse.urlsplit`; an origin contains scheme, host, and port, not `/dunecatalog`. Use the same environment-specific set for CORS. Production does not automatically include localhost origins.
- [ ] Reject unsafe methods unless `Origin` exactly matches a trusted origin. When Origin is absent, use the parsed origin of Referer. Reject absent headers, `null`, malformed URLs, lookalike suffixes, and sibling domains. An untrusted Origin cannot be rescued by a trusted Referer.

```python
def require_trusted_origin(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    if origin is None:
        referer = urlsplit(request.headers.get("referer", ""))
        origin = f"{referer.scheme}://{referer.netloc}"
    if origin not in TRUSTED_ORIGINS:
        raise HTTPException(status_code=403, detail="Untrusted request origin")

app = FastAPI(dependencies=[Depends(auth.require_trusted_origin)])
```

- [ ] Apply the dependency to login-related POSTs, logout, config saves, and query POSTs consistently. Keep the CILogon GET callback protected by its existing state and PKCE checks. Change FNAL polling to POST because completing it mutates credential state.
- [ ] Reproduce the prior no-Content-Type attack locally: submit a valid synthetic admin cookie with an untrusted Origin and JSON bytes. Assert 403 and assert that no write is attempted. Also check missing/null origins, legitimate origin and Referer requests, CORS preflight, and the OAuth callback.
- [ ] Update the frontend polling helper and any API documentation in the same commit.

**Check:** security regression command; `npx tsc --noEmit`.

## Task 4: Make catalog logout revoke the session

**Files:** new `src/backend/session_store.py`, `auth.py`, `main.py`, `src/lib/auth.ts`, `AuthContext.tsx`, `Header.tsx`, `.env.example`, `.gitignore`, `README.md`, `tests/test_security.py`.

**Interfaces:** A concrete `SessionStore(path)` owns `initialize()`, `register(jti: str, expires_at: int)`, `is_active(jti: str) -> bool`, and `revoke(jti: str)`. It opens a short-lived SQLite connection for each operation. Internal authenticated-user data carries `session_id` and `session_expires_at`, excluded from public response serialization.

- [ ] Add the minimal SQLite schema with parameterized queries. Prune expired rows during writes; enforce expiry during reads. Database errors surface as unavailable authentication, with no signature-only fallback.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    jti TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
);
```

- [ ] At login, generate `jti = secrets.token_urlsafe(32)`, register the session before issuing its cookie, and include `jti`, `exp`, `sub`, `iss="dune-catalog"`, `aud="dune-catalog-api"`, and `identity_issuer` in the signed token. Do not persist raw JWTs or FNAL credentials in this database.
- [ ] Both `get_current_user` and `/auth/me` must call the same verification path: validate the signature and required claims, expected application issuer/audience, expiry, and active session. Reject legacy tokens lacking the new claims or registry entry.
- [ ] Logout reads the current cookie, deletes the active-session entry before returning success, and clears the cookie. It is idempotent for expired or already revoked sessions. If persistence fails for an active session, return a service error instead of reporting a successful revocation.
- [ ] Use the existing `auth_logout` route in `main.py` to orchestrate FNAL cleanup from Task 5 after local revocation. This avoids importing the Rucio router back into `auth.py`.
- [ ] Stop swallowing logout failures in `src/lib/auth.ts`. `AuthContext` clears local state only after server confirmation. `Header` displays a retryable logout error using the existing toast component.
- [ ] Add these persistence checks alongside endpoint checks:

```python
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / "sessions.sqlite3"
    first = SessionStore(path)
    first.initialize()
    first.register("audit-session", int(time.time()) + 60)
    assert SessionStore(path).is_active("audit-session")
    first.revoke("audit-session")
    assert not SessionStore(path).is_active("audit-session")
```

- [ ] Verify copied-cookie rejection after logout and after reopening the registry, expired sessions, absent session rows, registry unavailability, repeated logout, and a network failure at the frontend. No real signing secret is required for these checks.

**Checks:** security regression command; `npx tsc --noEmit`.

## Task 5: Bind FNAL access to the catalog session and remove unsafe caching

**Files:** `rucio_router.py`, `rucio_reader.py`, `token_store.py`, `htvault.py`, `main.py`, `src/lib/rucio.ts`, `README.md`, `tests/test_security.py`.

**Dependencies:** Task 3's POST polling and Task 4's validated `session_id`.

**Interfaces:** Keep the existing token store, keyed by catalog `session_id` instead of user `sub`. Extend entries with `expires_at`; `delete(session_id)` returns removed credentials for cleanup. Add `clear_session(session_id: str) -> None` to the Rucio module for the logout route. Add `HTVaultClient.revoke_token(vault_token: str) -> None`.

- [ ] Remove the global replica cache and its custom TTL class. Each request obtains the caller's access token and asks Rucio for replicas. This avoids serving results after FNAL authorization changes and removes the cross-user cache boundary. Reintroduce caching only after a measured need and a defined authorization/invalidation policy.
- [ ] Key credentials and pending login ownership by `session_id`. Limit each session to one pending login, expire it after five minutes, and prune expired entries on start/poll. Honor the vault's polling interval, including `slow_down`, in the frontend.
- [ ] Preserve `lease_duration` from vault responses and cap local credential lifetime at the earlier of vault expiry and catalog session expiry. Remove expired credentials on access and opportunistically on writes.
- [ ] On successful polling, recheck catalog session activity before and after storing the returned credential. If the session was revoked, delete the entry and revoke the newly returned vault token. This prevents a late poll from restoring credentials after logout.
- [ ] On logout, remove pending state and credentials immediately. Request provider revocation with a short timeout using the existing httpx client:

```python
def revoke_token(self, vault_token: str) -> None:
    response = self._http.post(
        self._url("auth/token/revoke-self"),
        headers={"X-Vault-Token": vault_token},
        timeout=5.0,
    )
    response.raise_for_status()
```

- [ ] Provider revocation failure never restores local access. Report a sanitized operational failure; distinguish local logout from confirmed provider revocation. Verify support using the operator's test account before claiming provider revocation is guaranteed by FNAL policy.
- [ ] Check two users, two browser sessions for the same user, absent/expired vault credentials, pending-login replacement and expiry, logout during a held poll, and provider revocation failure. Assert that raw credentials never appear in returned JSON or logs.
- [ ] Document one-worker FNAL support and reconnect-after-restart behavior. Keep credentials out of SQLite rather than adding persistent secret storage without a demonstrated need.

**Check:** security regression command; `npx tsc --noEmit`. Vault's documented endpoint is [revoke-self](https://developer.hashicorp.com/vault/api-docs/auth/token#revoke-a-token-self).

## Task 6: Connect cancellation and bound upstream work

**Files:** `main.py`, `cancellable.py`, `mcatapi.py`, `condb_router.py`, `condb_api.py`, new `tests/test_queries.py`, `README.md`.

**Interfaces:** Reuse `run_cancellable(request, work, timeout_s=...)`. Existing MetaCat methods already accept `is_cancelled`; pass the predicate through every relevant call. Add the same cooperative predicate to ConDB methods where they parse or perform follow-up work.

- [ ] Convert dataset, file, detail, size, and ConDB query endpoints to `async def` wrappers with separate body and HTTP request parameters. Keep blocking upstream calls in the helper's worker thread.

```python
result = await run_cancellable(
    http_request,
    lambda cancelled: metacat_api.get_datasets(
        body.query, body.category, body.tab, body.officialOnly,
        body.customMql, is_cancelled=cancelled,
    ),
    timeout_s=METACAT_TIMEOUT_S,
)
```

- [ ] Inspect the pinned MetaCat transport before wiring response closure. Use operation-owned client/stream state, not the shared client's mutable `LastResponse`. Close that operation's actual stream in `finally`; one cancelled query must not close another user's connection.
- [ ] Propagate the actual `QueryCancelled` exception type rather than matching its name. Ensure the AnyIO task group preserves expected HTTP errors instead of wrapping them into a generic 500.
- [ ] Remove per-request multiplication of aggregate executors. Use a single bounded executor for size work and a bounded admission check; reject saturation with 503 instead of accepting an unbounded queue. Cancel queued work on disconnect and check cancellation before every new aggregate or provenance lookup.
- [ ] Keep explicit upstream socket timeouts. A running blocking socket operation cannot be force-killed by cancelling its awaiting task; document that it may continue until the next cancellation check or socket timeout. Do not promise instant termination of computation inside MetaCat.
- [ ] Test success, timeout, client disconnect, cancellation while queued, no follow-up lookup after cancellation, and two concurrent streams where cancelling one leaves the other intact. Use fake streams and events, not live MetaCat or minute-long sleeps.

```python
class DisconnectedRequest:
    async def is_disconnected(self):
        return True

# The test worker waits on cancellation and records whether it starts a second
# upstream call; assert that the second call never occurs.
```

**Check:** `python -m unittest discover -s tests -p test_queries.py -v`.

## Task 7: Restore accurate search behavior

**Files:** `src/lib/api.ts`, `src/app/page.tsx`, `SearchBar.tsx`, `DatasetDialog.tsx`, `DatasetTable.tsx`, `ConditionsDbPanel.tsx`, `src/app/file/[namespace]/[name]/page.tsx`, `src/lib/mcatapi.py`.

- [ ] Remove the success-shaped empty returns from `searchDataSets` and `searchFiles`. Let request errors reach their callers. Keep aborts silent, show timeouts and ordinary errors explicitly, and refresh authentication/show sign-in on 401. Update every caller, including the dataset dialog, so genuine empty results alone produce the empty-state message.
- [ ] Make URL parameters the source of the committed search. Populate query, category, official-only, custom MQL, and tab controls from them. Keep unsent edits local, and remove the tab-reset effect that overwrites restored values. Keep the back-to-results URL synchronized when opening a shared search directly.
- [ ] Treat unknown dataset size as `null` rather than conflating it with zero. Use `r.size ?? sizeMap[dsKey(r)]`; retain the distinct unavailable sentinel. Disable size sorting while any result has an unknown/unavailable size, with a brief explanation. Do not launch queries for every dataset simply to make sorting available.
- [ ] Abort the active Conditions DB request before resetting results on folder or mode changes. Clear loading state at that transition; ignore every result whose signal has been aborted.

```typescript
function resetResults() {
  inFlightRef.current?.abort()
  inFlightRef.current = null
  setLoading(false)
  setConditions(null)
  setSearchResults(null)
  setError(null)
}
```

- [ ] Use `useParams` values directly on the file page; remove the second `decodeURIComponent`. Search for callers of the duplicate `file-detail-page.tsx`; if it is unused, delete it instead of maintaining two implementations.
- [ ] Verify with synthetic browser responses: a 500, a 401, a timeout, an empty success, a shared URL with all filters, browser back navigation, a largest dataset outside page one, a valid zero-byte dataset, folder change during a held request, and names containing `%` or literal `%2F`.
- [ ] Use the available collaborative browser for these interaction checks and retain the acceptance steps in the change description. Do not add a frontend test framework solely for this patch. Keep persistent automated regressions for security and upstream cancellation in the two Python test files.

**Checks:** `npx tsc --noEmit`, `npm run build`, and the focused browser cases above. The current `npm run lint` invokes `next lint`; do not present it as a passing gate without first checking that the installed Next.js version supports it.

## Task 8: Verify and roll out in two releases

- [ ] Before each implementation commit, run its focused checks and inspect the diff for unrelated edits. Before release, run both Python regression files, TypeScript checking, and the production build.
- [ ] Security release includes Tasks 1–5 together. Stage a generated signing key, HTTPS URLs, the local session database path, and the independently verified admin identity records. Confirm actual deployment has one backend worker before enabling the in-memory FNAL workflow.
- [ ] Use a staging account to verify the complete sequence: CILogon login, administrator recognition, catalog query, FNAL connect, replica lookup, logout, and rejection of the old session cookie. Confirm the production cookie has Secure/HttpOnly/SameSite and that rejected origins cause no side effects.
- [ ] Deploy the security release with fresh session state and inform users that they must sign in again and reconnect to FNAL. Do not copy real secrets into this repository. Actual deployment remains a separately authorized step.
- [ ] Release Tasks 6–7 after their focused checks and browser verification. Monitor sanitized error counts, response timeouts, and rejected saturated requests; do not log cookies or credential-bearing request headers.
- [ ] Roll back application changes only to a version retaining the security fixes. If session state must be restored from backup, rotate the signing key and require fresh login so deleted sessions cannot reappear.

## Completion criteria

- All six security findings have their regression checks passing.
- A missing optional ConDB URL cannot prevent startup.
- Search failures cannot be mistaken for no matches.
- Restored search controls agree with the query that produced the results.
- Size ordering is never presented as complete when sizes are missing.
- Cancellation does not start more upstream work or interrupt another user's stream.
- The documented single-worker and blocking-socket limits match the implementation.
- Production exposure remains unverified until the authorized staging/deployment checks are performed.

## Sources for security decisions

- [CILogon: user identifiers and other claims](https://www.cilogon.org/oidc): use issuer and subject; email may be unverified or unstable.
- [OWASP: CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): validate request origins and do not treat sibling domains as trusted solely because they are same-site.
- [Vault: token API](https://developer.hashicorp.com/vault/api-docs/auth/token#revoke-a-token-self): revoke-self is a POST authenticated with the vault token being revoked.
