"""Security regressions run locally with synthetic credentials and no upstream calls."""
import asyncio
import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

os.environ.update({
    "JWT_SECRET_KEY": "test-only-signing-key-" + "x" * 48,
    "CILOGON_CLIENT_ID": "audit-client",
    "CILOGON_CLIENT_SECRET": "audit-client-secret",
    "CILOGON_REDIRECT_URI": "https://catalog.example.invalid/auth/callback",
    "FRONTEND_URL": "https://catalog.example.invalid/dunecatalog",
    "ENVIRONMENT": "production",
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


if __name__ == "__main__":
    unittest.main()
