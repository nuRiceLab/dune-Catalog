"""Security regressions run locally with synthetic credentials and no upstream calls."""
import asyncio
import os
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
                response = TestClient(main.app).post("/runConditions", json={"run": 1})
                self.assertEqual(response.status_code, 503)
            finally:
                main.app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
