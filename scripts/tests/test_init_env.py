import concurrent.futures
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]


class InitEnvTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / ".env"

    def generate(self):
        return subprocess.check_output(
            ["python3", "scripts/init-env.py", "--output", str(self.path)], cwd=ROOT, text=True
        )

    def compose(self, *args, office=False):
        env = {**os.environ, "COMPOSE_PROFILES": "", "OFFICE_ENABLED": "true" if office else "false"}
        for line in self.path.read_text().splitlines():
            key = line.split("=", 1)[0]
            if key not in ("COMPOSE_PROFILES", "OFFICE_ENABLED"):
                env.pop(key, None)
        command = ["docker", "compose", "-f", "docker-compose.dev.yml", "--env-file", str(self.path)]
        if office:
            command += ["--profile", "office"]
        return subprocess.check_output([*command, "config", *args], cwd=ROOT, env=env, text=True)

    def test_concurrent_initialization_and_compose(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.generate(), range(8)))
        self.assertEqual(sum("Создан" in result for result in results), 1)
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        original = self.path.read_bytes()
        self.generate()
        self.assertEqual(self.path.read_bytes(), original)

        plain = json.loads(self.compose("--format", "json"))["services"]
        office = json.loads(self.compose("--format", "json", office=True))["services"]
        self.assertNotIn("onlyoffice", plain)
        backend = office["backend"]["environment"]
        editor = office["onlyoffice"]["environment"]
        postgres = office["postgres"]["environment"]
        minio = office["minio"]["environment"]
        dsn = urlsplit(backend["DATABASE_URL"])
        self.assertEqual(dsn.hostname, "postgres")
        self.assertEqual(dsn.username, postgres["POSTGRES_USER"])
        self.assertEqual(dsn.password, postgres["POSTGRES_PASSWORD"])
        self.assertEqual(dsn.path, "/" + postgres["POSTGRES_DB"])
        self.assertEqual(backend["APP_URL"], "http://localhost:3000")
        self.assertEqual(backend["OFFICE_ENABLED"], "true")
        self.assertEqual(backend["OFFICE_JWT_SECRET"], editor["JWT_SECRET"])
        self.assertEqual(backend["MINIO_ROOT_PASSWORD"], minio["MINIO_ROOT_PASSWORD"])
        secrets = {backend["JWT_SECRET"], editor["JWT_SECRET"], dsn.password, minio["MINIO_ROOT_PASSWORD"]}
        self.assertEqual(len(secrets), 4)
        self.assertTrue(all(len(value) >= 32 for value in secrets))
        self.assertTrue(all(secret not in "".join(results) for secret in secrets))

    def test_dev_start_selects_office_profile_from_compose_environment(self):
        self.generate()
        original = self.path.read_text()
        env = {**os.environ, "COMPOSE_PROFILES": ""}
        env.pop("OFFICE_ENABLED", None)
        for name in ("dev", "dev-up"):
            for enabled in ("true", "false"):
                with self.subTest(target=name, office=enabled):
                    self.path.write_text(original.replace("OFFICE_ENABLED=false", f"OFFICE_ENABLED={enabled}"))
                    output = subprocess.check_output(
                        ["make", "-n", name, f"ENV_FILE={self.path}"], cwd=ROOT, env=env, text=True
                    )
                    self.assertEqual("--profile office" in output, enabled == "true")

        output = subprocess.check_output(
            ["make", "-n", "dev-up", f"ENV_FILE={self.path}"],
            cwd=ROOT, env={**env, "OFFICE_ENABLED": "true"}, text=True,
        )
        self.assertIn("--profile office", output)

    def test_prod_deploy_builds_before_replacing_services(self):
        self.generate()
        env = {**os.environ, "COMPOSE_PROFILES": "", "PROD_OFFICE_LOCAL": "false"}
        for local in (False, True):
            with self.subTest(local=local):
                output = subprocess.check_output(
                    ["make", "-n", "prod-deploy", f"ENV_FILE={self.path}"],
                    cwd=ROOT,
                    env={**env, "PROD_OFFICE_LOCAL": str(local).lower()},
                    text=True,
                )
                self.assertEqual("--profile office" in output, local)
                self.assertNotIn(" down", output)
                self.assertLess(output.index("build backend frontend"), output.index("up -d --no-build --wait"))
                self.assertLess(output.index("nginx nginx -t"), output.index("--force-recreate nginx"))
                if local:
                    self.assertLess(output.index("--wait-timeout 420 onlyoffice"), output.index("up -d --no-build --wait"))

    def test_existing_config_is_preserved_and_dsn_escaped(self):
        original = (
            b"# Keep comment\r\nPOSTGRES_USER=dev\r\nPOSTGRES_DB=my_database\r\n"
            b"POSTGRES_PASSWORD='p@ss/word:#'\r\nJWT_SECRET='existing-secret'\r\n"
            b"OFFICE_JWT_SECRET=  # keep secret comment\r\n"
            b"SMTP_USER='custom user'\r\nCUSTOM='preserve this'\r\n"
        )
        self.path.write_bytes(original)
        self.generate()
        text = self.path.read_bytes()
        for line in original.splitlines(keepends=True):
            if not line.startswith(b"OFFICE_JWT_SECRET"):
                self.assertIn(line, text)
        self.assertIn(b" # keep secret comment\r\n", text)
        backend = json.loads(self.compose("--format", "json"))["services"]["backend"]["environment"]
        self.assertEqual(unquote(urlsplit(backend["DATABASE_URL"]).password), "p@ss/word:#")

    def test_missing_credentials_are_taken_from_existing_local_dsn(self):
        self.path.write_text(
            "DATABASE_URL=postgres://newuser:p%40ss%24word@postgres:5432/newdb?sslmode=disable\n"
        )
        self.generate()
        # config --environment reports literal input values instead of the
        # escaped dollar syntax used in rendered Compose configuration.
        env = dict(line.split("=", 1) for line in self.compose("--environment").splitlines() if "=" in line)
        self.assertEqual(env["POSTGRES_USER"], "newuser")
        self.assertEqual(env["POSTGRES_PASSWORD"], "p@ss$word")
        self.assertEqual(env["POSTGRES_DB"], "newdb")


if __name__ == "__main__":
    unittest.main()
