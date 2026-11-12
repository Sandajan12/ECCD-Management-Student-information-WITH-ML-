"""Production CA selection keeps verified TLS and explicit deployment overrides."""
from datetime import datetime, timezone
from pathlib import Path
import runpy
import ssl
import unittest
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from pydantic import ValidationError

from backend.config.settings import BACKEND_DIR, Settings


def configuration(**changes):
    values = dict(
        _env_file=None, DATABASE_URL="postgresql://localhost/test?sslmode=verify-full",
        SECRET_KEY="SyntheticTlsTestSecret0123456789abcdef", ENVIRONMENT="production",
        BACKUP_ENCRYPTION_KEY="unused", BACKUP_IV="unused", ENABLE_OTP=True,
        EMAIL_TRANSPORT="brevo_api", BREVO_API_KEY="xkeysib-synthetic-config-test-secret",
        MAIL_FROM="otp@school.example.com", DATABASE_SSL_ROOT_CERT=None,
    )
    # Ignore private developer/provider values; these cases are configuration only.
    with patch.dict("os.environ", {}, clear=True):
        return Settings(**{**values, **changes})


class DatabaseTlsTests(unittest.TestCase):
    def test_bundled_ca_is_valid_supabase_root(self):
        path = Path(BACKEND_DIR) / "certs" / "prod-ca-2021.crt"
        data = path.read_bytes()
        self.assertNotIn(b"PRIVATE KEY", data)
        certificate = x509.load_pem_x509_certificate(data)
        self.assertTrue(certificate.extensions.get_extension_for_class(x509.BasicConstraints).value.ca)
        certificate.verify_directly_issued_by(certificate)
        now = datetime.now(timezone.utc)
        self.assertLess(certificate.not_valid_before_utc, now)
        self.assertGreater(certificate.not_valid_after_utc, now)
        self.assertEqual(certificate.fingerprint(hashes.SHA256()).hex(),
                         "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa")
        ssl.create_default_context(cafile=str(path))

    def test_production_selects_bundled_ca_for_missing_or_system_roots(self):
        bundled = str(Path(BACKEND_DIR) / "certs" / "prod-ca-2021.crt")
        for root in (None, "", "system"):
            for query in ("", "&sslrootcert=system"):
                with self.subTest(root=root, query=query):
                    value = configuration(DATABASE_SSL_ROOT_CERT=root,
                        DATABASE_URL="postgresql://localhost/test?sslmode=verify-full" + query)
                    self.assertEqual(value.DATABASE_SSL_ROOT_CERT, bundled)
                    with patch("backend.config.settings.settings", value), patch("sqlalchemy.create_engine") as create:
                        runpy.run_path(str(Path(BACKEND_DIR) / "config" / "database.py"),
                                       run_name="backend.config._tls_config_test")
                    self.assertEqual(create.call_args.kwargs["connect_args"]["sslrootcert"], bundled)
                    self.assertIn("sslmode=verify-full", create.call_args.args[0])

    def test_explicit_ca_paths_keep_existing_precedence(self):
        url = "postgresql://localhost/test?sslmode=verify-full&sslrootcert=/url/ca.crt"
        self.assertIsNone(configuration(DATABASE_URL=url).DATABASE_SSL_ROOT_CERT)
        self.assertEqual(configuration(DATABASE_URL=url, DATABASE_SSL_ROOT_CERT="/configured/ca.crt").DATABASE_SSL_ROOT_CERT,
                         "/configured/ca.crt")

    def test_development_does_not_replace_system_or_missing_roots(self):
        for root in (None, "system", "/local/ca.crt"):
            with self.subTest(root=root):
                value = configuration(ENVIRONMENT="development", DATABASE_SSL_ROOT_CERT=root,
                                      DATABASE_URL="postgresql://localhost/test")
                self.assertEqual(value.DATABASE_SSL_ROOT_CERT, root)

    def test_missing_bundle_and_weaker_tls_fail_closed(self):
        with patch("backend.config.settings.os.path.isfile", return_value=False):
            with self.assertRaisesRegex(ValidationError, "Bundled Supabase CA certificate is missing"):
                configuration()
        for mode in ("disable", "allow", "prefer", "require", "verify-ca"):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValidationError, "sslmode=verify-full"):
                configuration(DATABASE_URL="postgresql://localhost/test?sslmode=" + mode)
