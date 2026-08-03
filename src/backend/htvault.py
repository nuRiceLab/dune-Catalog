"""
htvault.py — reproduce the htgettoken -> htvault (FNAL) flow in the backend.

Place in src/backend/. Uses httpx (already a dune-Catalog dependency).

Endpoints on the vault server (default https://htvaultprod.fnal.gov:8200),
issuer "dune", role "default":
  POST /v1/auth/oidc-dune/oidc/auth_url   -> {data:{auth_url, state, nonce, ...}}
  POST /v1/auth/oidc-dune/oidc/poll       -> pending: {errors:[authorization_pending]}
                                             done:    {auth:{client_token, metadata:{credkey}}}
  GET  /v1/auth/token/lookup-self         -> {data:{ttl}}
  GET  /v1/secret/oauth/creds/dune/<credkey>:default?minimum_seconds=N
                                          -> {data:{access_token}}   (the Rucio token)

The browser returns to vault's OWN callback, so the backend never gets an auth
code — it POLLS. The long-lived vault token is the user's credential: store it
server-side (see token_store.py) and mint short-lived access tokens per request.
"""

import secrets

import httpx


class HTVaultError(Exception):
    pass


class HTVaultClient:
    def __init__(self,
                 vault_url="https://htvaultprod.fnal.gov:8200",
                 issuer="dune",
                 role="default",
                 verify=True,
                 timeout=30):
        self.vault_url = vault_url.rstrip("/")
        self.issuer = issuer
        self.role = role
        self.oidc_path = "auth/oidc-%s/oidc" % issuer
        self._http = httpx.Client(verify=verify, timeout=timeout)

    def _url(self, path):
        return "%s/v1/%s" % (self.vault_url, path.lstrip("/"))

    # Step 1: start OIDC auth. -------------------------------------------- #
    def begin_auth(self, redirect_uri=None):
        if redirect_uri is None:
            redirect_uri = "%s/v1/%s/callback" % (self.vault_url, self.oidc_path)
        client_nonce = secrets.token_urlsafe()
        body = {"role": self.role, "client_nonce": client_nonce,
                "redirect_uri": redirect_uri}
        r = self._http.post(self._url(self.oidc_path + "/auth_url"), json=body)
        r.raise_for_status()
        data = (r.json() or {}).get("data") or {}

        auth_url = data.pop("auth_url", "")
        if not auth_url:
            raise HTVaultError("no auth_url in vault response")
        data.pop("user_code", None)
        poll_interval = int(data.pop("poll_interval", 5) or 5)

        use_device_wait = "state" not in data
        poll_payload = dict(data)
        poll_payload["client_nonce"] = client_nonce
        if use_device_wait:
            poll_payload["role"] = self.role

        return {
            "auth_url": auth_url,
            "session": {
                "poll_payload": poll_payload,
                "poll_interval": poll_interval,
                "endpoint": "device_wait" if use_device_wait else "poll",
            },
        }

    # Step 2: poll once. None while pending, else {vault_token, credkey}. -- #
    def poll_once(self, session):
        r = self._http.post(
            self._url("%s/%s" % (self.oidc_path, session["endpoint"])),
            json=session["poll_payload"])
        try:
            resp = r.json()
        except ValueError:
            r.raise_for_status()
            raise HTVaultError("non-JSON poll response")

        if "errors" in resp:
            err = (resp["errors"] or ["unknown"])[0]
            if err in ("authorization_pending", "slow_down"):
                if err == "slow_down":
                    session["poll_interval"] = session.get("poll_interval", 5) * 2
                return None
            raise HTVaultError("vault auth error: %s" % err)

        auth = resp.get("auth") or {}
        token = auth.get("client_token")
        if not token:
            raise HTVaultError("no client_token in poll response")
        return {
            "vault_token": token,
            "credkey": (auth.get("metadata") or {}).get("credkey"),
            "lease_duration": auth.get("lease_duration"),
        }

    # Step 3: mint a fresh Rucio access token (no user interaction). ------- #
    def mint_access_token(self, vault_token, credkey,
                          minimum_seconds=60, scopes=None, audience=None):
        kind = "sts" if (scopes or audience) else "creds"
        path = "secret/oauth/%s/%s/%s:%s" % (kind, self.issuer, credkey, self.role)
        params = {"minimum_seconds": minimum_seconds}
        if scopes:
            params["scopes"] = scopes
        if audience:
            params["audiences"] = audience
        r = self._http.get(self._url(path),
                           headers={"X-Vault-Token": vault_token}, params=params)
        r.raise_for_status()
        data = (r.json() or {}).get("data") or {}
        tok = data.get("access_token")
        if not tok:
            raise HTVaultError("no access_token in vault secret response")
        return tok

    def vault_token_ttl(self, vault_token):
        r = self._http.get(self._url("auth/token/lookup-self"),
                           headers={"X-Vault-Token": vault_token})
        r.raise_for_status()
        return int(((r.json() or {}).get("data") or {}).get("ttl", 0))
