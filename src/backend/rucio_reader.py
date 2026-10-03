"""
rucio_reader.py — read-only Rucio replica lookups (place in src/backend/).

Reproduces `rucio replica list file <scope:name> --pfns` for a set of protocols
via  POST {rucio_host}/replicas/list  (newline-delimited JSON), and groups the
result BY SITE (RSE) for display:

    [
      {"rse": "DUNE_US_BNL_SDCC", "type": "disk",
       "pfns": [{"protocol": "root", "pfn": "root://..."},
                {"protocol": "davs", "pfn": "davs://..."}]},
      ...
    ]

Every lookup validates this session and contacts Rucio. If the vault token has expired, get_replicas raises NeedReLogin.
"""

import json

import httpx

from src.backend.htvault import HTVaultError

DEFAULT_RUCIO_HOST = "https://dune-rucio.fnal.gov"
DEFAULT_SCHEMES = ("root",)   # protocols shown to users
MINT_MIN_SECONDS = 600               # ask vault for >=10 min of validity


class NeedReLogin(Exception):
    """The user's vault token is missing/expired; they must re-run begin_auth."""


_TYPE_LABEL = {"DISK": "disk", "TAPE": "tape"}
_PROTO_ORDER = {"root": 0, "davs": 1, "https": 2, "gsiftp": 3, "srm": 4}


def _scheme_of(pfn):
    i = pfn.find("://")
    return pfn[:i].lower() if i > 0 else "unknown"


def parse_replica_sites(lines):
    """x-json-stream body -> list of per-RSE sites, each with its protocols.

    Every RSE is returned (no priority ranking); storage type (disk/tape) is a
    field, not folded into the name.
    """
    sites = {}   # rse -> {"rse", "type", "pfns": [...]}
    for line in lines:
        if not line or not line.strip():
            continue
        rep = json.loads(line)
        for pfn, meta in (rep.get("pfns") or {}).items():
            meta = meta or {}
            rse = meta.get("rse") or "UNKNOWN"
            stype = _TYPE_LABEL.get((meta.get("type") or "").upper(), "unknown")
            site = sites.setdefault(rse, {"rse": rse, "type": stype, "pfns": []})
            if site["type"] == "unknown" and stype != "unknown":
                site["type"] = stype
            site["pfns"].append({"protocol": _scheme_of(pfn), "pfn": pfn})

    out = []
    for rse in sorted(sites):
        s = sites[rse]
        s["pfns"].sort(key=lambda p: (_PROTO_ORDER.get(p["protocol"], 99), p["pfn"]))
        out.append(s)
    return out


class RucioReader:
    def __init__(self, vault, token_store,
                 rucio_host=DEFAULT_RUCIO_HOST, domain="wan",
                 verify=True, timeout=30):
        self.vault = vault
        self.token_store = token_store          # callable(user)->{vault_token,credkey}|None
        self.rucio_host = rucio_host.rstrip("/")
        self.domain = domain
        self._http = httpx.Client(verify=verify, timeout=timeout)

    def _access_token(self, user):
        creds = self.token_store(user)
        if not creds:
            raise NeedReLogin("no stored vault token for user")
        try:
            return self.vault.mint_access_token(
                creds["vault_token"], creds["credkey"],
                minimum_seconds=MINT_MIN_SECONDS)
        except httpx.HTTPStatusError as e:
            if e.response is not None and e.response.status_code in (401, 403):
                raise NeedReLogin("vault token expired") from e
            raise
        except HTVaultError as e:
            raise NeedReLogin(str(e)) from e

    def get_replicas(self, user, scope, name, schemes=DEFAULT_SCHEMES):
        """Authorize this session and fetch current replica records."""
        token = self._access_token(user)
        sites = self._list_replicas(token, scope, name, list(schemes))
        return sites

    def _list_replicas(self, token, scope, name, schemes):
        body = {
            "dids": [{"scope": scope, "name": name}],
            "schemes": schemes,
            "domain": self.domain,
            "ignore_availability": True,
            "all_states": False,
        }
        r = self._http.post(self.rucio_host + "/replicas/list",
                            headers={"X-Rucio-Auth-Token": token,
                                     "Content-Type": "application/json"},
                            json=body)
        if r.status_code in (401, 403):
            raise NeedReLogin("Rucio rejected the access token")
        r.raise_for_status()
        return parse_replica_sites(r.text.splitlines())
