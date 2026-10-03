"""Security regressions run locally with synthetic credentials and no upstream calls."""
import asyncio
import os
import tempfile
import time
import sqlite3
from pathlib import Path
import unittest
from unittest.mock import patch
from unittest.mock import Mock

os.environ.update({
    "JWT_SECRET_KEY": "test-only-signing-key-" + "x" * 48,
    "CILOGON_CLIENT_ID": "audit-client",
    "CILOGON_CLIENT_SECRET": "audit-client-secret",
    "CILOGON_REDIRECT_URI": "https://catalog.example.invalid/auth/callback",
    "FRONTEND_URL": "https://catalog.example.invalid/dunecatalog",
    "ENVIRONMENT": "production",
    "SESSION_DB_PATH": str(Path(tempfile.gettempdir()) / "dune-audit-sessions.sqlite3"),
})

import jwt
from src.backend import auth
from src.lib.condb_api import ConditionsDBAPI
from fastapi.testclient import TestClient

with patch("src.lib.mcatapi.MetaCatAPI"):
    from src.backend import main


class ConfigurationTests(unittest.TestCase):
    def test_missing_key_cannot_verify_a_forged_token(self):
        token = jwt.encode({"sub": "audit", "exp": 4102444800}, "", algorithm="HS256")
        with patch.object(auth, "JWT_SECRET_KEY", ""):
            self.assertIsNone(auth.decode_token(token))

    def test_short_and_placeholder_keys_cannot_issue_sessions(self):
        for key in ("", " ", "change-me", "short", " " * 48):
            with self.subTest(key=repr(key)), patch.object(auth, "JWT_SECRET_KEY", key):
                with self.assertRaises(RuntimeError):
                    auth.create_access_token({"sub": "audit"})

    def test_missing_expiry_is_rejected(self):
        token = jwt.encode({"sub": "audit"}, auth.JWT_SECRET_KEY, algorithm="HS256")
        self.assertIsNone(auth.decode_token(token))

    def test_missing_condb_url_does_not_crash(self):
        api = ConditionsDBAPI(base_url=None)
        self.assertFalse(api.get_run_conditions("test", 1)["success"])

    def test_production_requires_https_configuration(self):
        self.assertTrue(hasattr(auth, "validate_security_configuration"))
        with patch.object(auth, "FRONTEND_URL", "http://catalog.example.invalid"):
            with self.assertRaises(RuntimeError):
                auth.validate_security_configuration()

    def test_direct_app_startup_validates_secret(self):
        with patch.object(auth, "JWT_SECRET_KEY", ""):
            with self.assertRaises(RuntimeError):
                with TestClient(main.app):
                    pass

    def test_oauth_cookies_are_secure_in_production(self):
        with patch.object(auth, "get_discovery_document", return_value={
            "authorization_endpoint": "https://cilogon.org/authorize"
        }):
            response = asyncio.run(auth.login_start())
        for cookie in response.headers.getlist("set-cookie"):
            self.assertIn("Secure", cookie)
            self.assertIn("HttpOnly", cookie)
            self.assertIn("SameSite=lax", cookie)

    def test_unconfigured_condb_returns_service_unavailable(self):
        with patch.object(main.condb_router.condb_api, "base_url", ""):
            main.app.dependency_overrides[auth.get_current_user] = lambda: auth.UserInfo(sub="audit")
            try:
                response = TestClient(main.app).post("/runConditions", json={"run": 1}, headers={"Origin": "https://catalog.example.invalid"})
                self.assertEqual(response.status_code, 503)
            finally:
                main.app.dependency_overrides.clear()


class AdminBoundaryTests(unittest.TestCase):
    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_email_does_not_establish_admin_identity(self):
        self.assertTrue(hasattr(auth, "set_admin_identities"))
        auth.set_admin_identities([{"issuer": "https://cilogon.org", "sub": "admin-sub"}])
        self.assertTrue(auth._claims_to_user_info({
            "identity_issuer": "https://cilogon.org", "sub": "admin-sub"
        }).is_admin)
        self.assertFalse(auth._claims_to_user_info({
            "identity_issuer": "https://cilogon.org", "sub": "other-sub",
            "email": "admin@example.invalid"
        }).is_admin)
        self.assertFalse(auth._claims_to_user_info({
            "identity_issuer": "https://untrusted.example.invalid", "sub": "admin-sub"
        }).is_admin)

    def test_untrusted_origins_cannot_write_config(self):
        main.app.dependency_overrides[main.verify_admin] = lambda: "audit"
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "CONFIG_PATH", directory):
            for origin in (None, "null", "https://evil.example.invalid",
                           "https://catalog.example.invalid.attacker.invalid"):
                headers = {} if origin is None else {"Origin": origin}
                response = TestClient(main.app).post(
                    "/admin/config?file=helpContent.json",
                    content=b'{"data":{"audit":true}}', headers=headers,
                )
                self.assertEqual(response.status_code, 403)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_trusted_origin_cannot_escape_config_directory(self):
        main.app.dependency_overrides[main.verify_admin] = lambda: "audit"
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "CONFIG_PATH", directory):
            client = TestClient(main.app)
            for filename in ("../escape.json", "sub/admins.json", "admins.json "):
                response = client.post("/admin/config", params={"file": filename},
                    json={"data": {}}, headers={"Origin": "https://catalog.example.invalid"})
                self.assertEqual(response.status_code, 400)

    def test_invalid_admin_list_does_not_replace_valid_file(self):
        main.app.dependency_overrides[main.verify_admin] = lambda: "audit"
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "CONFIG_PATH", directory):
            path = Path(directory) / "admins.json"
            path.write_text('{"admins":[{"issuer":"https://cilogon.org","sub":"admin-sub"}]}')
            previous = path.read_text()
            for records in ([], ["admin@example.invalid"], [{"issuer": "https://cilogon.org", "sub": " "}]):
                response = TestClient(main.app).post("/admin/config?file=admins.json",
                    json={"data": {"admins": records}},
                    headers={"Origin": "https://catalog.example.invalid"})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(path.read_text(), previous)

    def test_trusted_origin_or_referer_can_save(self):
        main.app.dependency_overrides[main.verify_admin] = lambda: "audit"
        with tempfile.TemporaryDirectory() as directory, patch.object(main, "CONFIG_PATH", directory):
            for headers in (
                {"Origin": "https://catalog.example.invalid"},
                {"Referer": "https://catalog.example.invalid/dunecatalog/admin"},
            ):
                response = TestClient(main.app).post("/admin/config?file=helpContent.json",
                    json={"data": {"audit": True}}, headers=headers)
                self.assertEqual(response.status_code, 200)
            self.assertIn('"audit": true', (Path(directory) / "helpContent.json").read_text())

    def test_referer_does_not_override_bad_origin(self):
        response = TestClient(main.app).post("/auth/logout", headers={
            "Origin": "null", "Referer": "https://catalog.example.invalid/",
        })
        self.assertEqual(response.status_code, 403)

    def test_poll_cannot_change_credentials_via_get(self):
        self.assertEqual(TestClient(main.app).get("/rucio/login/poll?login_id=audit").status_code, 405)


class SessionTests(unittest.TestCase):
    def setUp(self):
        from src.backend.session_store import SessionStore
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        store = SessionStore(Path(directory.name) / "sessions.sqlite3")
        store.initialize()
        patcher = patch.object(auth, "sessions", store)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_logout_invalidates_a_copied_cookie(self):
        token = auth.create_access_token({"sub": "audit", "identity_issuer": "https://cilogon.org"})
        response = TestClient(main.app).post("/auth/logout", headers={
            "Origin": "https://catalog.example.invalid", "Cookie": f"dunecat_token={token}"
        })
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(auth.decode_token(token))

    def test_session_registry_persists_revocation(self):
        from src.backend.session_store import SessionStore
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sessions.sqlite3"
            first = SessionStore(path)
            first.initialize()
            first.register("audit", int(time.time()) + 60)
            self.assertTrue(SessionStore(path).is_active("audit"))
            first.revoke("audit")
            self.assertFalse(SessionStore(path).is_active("audit"))
            first.register("expired", int(time.time()) - 1)
            self.assertFalse(first.is_active("expired"))

    def test_registry_failure_never_allows_signature_only_authentication(self):
        from fastapi import HTTPException
        token = auth.create_access_token({"sub": "audit", "identity_issuer": "https://cilogon.org"})
        with patch.object(auth.sessions, "is_active", side_effect=sqlite3.OperationalError):
            with self.assertRaises(HTTPException) as error:
                auth.decode_token(token)
            self.assertEqual(error.exception.status_code, 503)

    def test_internal_session_fields_are_not_returned_to_browser(self):
        token = auth.create_access_token({"sub": "audit", "identity_issuer": "https://cilogon.org"})
        response = TestClient(main.app).get("/auth/me", headers={"Cookie": f"dunecat_token={token}"})
        self.assertTrue(response.json()["authenticated"])
        self.assertNotIn("session_id", response.json()["user"])

    def test_late_poll_cannot_restore_logged_out_credentials(self):
        from fastapi import HTTPException
        router = main.rucio_router
        user = auth.UserInfo(sub="audit", session_id="race", session_expires_at=int(time.time()) + 60)
        auth.sessions.register("race", user.session_expires_at)
        with patch.object(router.vault, "begin_auth", return_value={
            "auth_url": "https://fnal.example.invalid", "session": {"poll_interval": 5}
        }):
            started = router.login_start(user)
        def complete_after_logout(session):
            auth.sessions.revoke("race")
            router.clear_session("race")
            return {"vault_token": "late-token", "credkey": "audit", "lease_duration": 60}
        with (
            patch.object(router.vault, "poll_once", side_effect=complete_after_logout),
            patch.object(router.vault, "revoke_token") as revoke,
        ):
            with self.assertRaises(HTTPException) as error:
                router.login_poll(router.LoginPollRequest(login_id=started["login_id"]), user)
            self.assertEqual(error.exception.status_code, 401)
            self.assertIsNone(router.tokens.get("race"))
            revoke.assert_called_once_with("late-token")

    def test_fnal_poll_is_serialized_and_honors_provider_interval(self):
        router = main.rucio_router
        user = auth.UserInfo(sub="audit", session_id="polling", session_expires_at=int(time.time()) + 60)
        auth.sessions.register("polling", user.session_expires_at)
        with patch.object(router.vault, "begin_auth", return_value={
            "auth_url": "https://fnal.example.invalid", "session": {"poll_interval": 5}
        }):
            started = router.login_start(user)
        request = router.LoginPollRequest(login_id=started["login_id"])
        def pending(session):
            self.assertEqual(router.login_poll(request, user)["status"], "pending")
            session["poll_interval"] = 10
            return None
        with patch.object(router.vault, "poll_once", side_effect=pending) as poll:
            self.assertEqual(router.login_poll(request, user)["poll_interval"], 10)
            router.login_poll(request, user)
            poll.assert_called_once()
        router.clear_session("polling")

    def test_expired_fnal_credentials_and_pending_logins_are_removed(self):
        from fastapi import HTTPException
        router = main.rucio_router
        user = auth.UserInfo(sub="audit", session_id="expiry", session_expires_at=int(time.time()) + 60)
        auth.sessions.register("expiry", user.session_expires_at)
        router.tokens.put("expiry", "token", "key", time.time() - 1)
        self.assertIsNone(router.tokens.get("expiry"))
        with patch.object(router.vault, "begin_auth", return_value={
            "auth_url": "https://fnal.example.invalid", "session": {"poll_interval": 5}
        }):
            first = router.login_start(user)
            second = router.login_start(user)
        self.assertNotEqual(first["login_id"], second["login_id"])
        router._PENDING["expiry"]["expires_at"] = 0
        with self.assertRaises(HTTPException) as error:
            router.login_poll(router.LoginPollRequest(login_id=second["login_id"]), user)
        self.assertEqual(error.exception.status_code, 410)
        self.assertNotIn("expiry", router._PENDING)

    def test_provider_revocation_failure_does_not_restore_local_access(self):
        router = main.rucio_router
        token = auth.create_access_token({"sub": "audit", "identity_issuer": "https://cilogon.org"})
        claims = auth.decode_token(token)
        router.tokens.put(claims["jti"], "test-token", "key", claims["exp"])
        with patch.object(router.vault, "revoke_token", side_effect=RuntimeError("sensitive")):
            response = TestClient(main.app).post("/auth/logout", headers={
                "Origin": "https://catalog.example.invalid", "Cookie": f"dunecat_token={token}"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["fnal_revoked"])
        self.assertIsNone(auth.decode_token(token))
        self.assertIsNone(router.tokens.get(claims["jti"]))
        self.assertNotIn("sensitive", response.text)

    def test_stale_replica_failure_preserves_reconnected_credentials(self):
        from fastapi import HTTPException
        from src.backend.rucio_reader import NeedReLogin
        router = main.rucio_router
        user = auth.UserInfo(sub="audit", session_id="reconnect")
        def stale_lookup(*args, **kwargs):
            router.tokens.put("reconnect", "new-token", "key", time.time() + 60)
            raise NeedReLogin()
        try:
            with patch.object(router.reader, "get_replicas", side_effect=stale_lookup):
                with self.assertRaises(HTTPException) as error:
                    router.replicas("audit", "file", user)
                self.assertEqual(error.exception.status_code, 401)
                self.assertEqual(router.tokens.get("reconnect")["vault_token"], "new-token")
        finally:
            router.tokens.delete("reconnect")

    def test_replica_lookups_always_check_callers_credentials(self):
        from src.backend.rucio_reader import RucioReader, NeedReLogin
        vault = Mock()
        vault.mint_access_token.return_value = "synthetic-access-token"
        reader = RucioReader(vault, lambda session: (
            {"vault_token": "synthetic-vault-token", "credkey": "audit"}
            if session == "authorized" else None))
        try:
            with patch.object(reader, "_list_replicas", return_value=[]):
                self.assertEqual(reader.get_replicas("authorized", "audit", "file"), [])
                with self.assertRaises(NeedReLogin):
                    reader.get_replicas("other-session", "audit", "file")
        finally:
            reader._http.close()


if __name__ == "__main__":
    unittest.main()
