#!/usr/bin/env python3
"""Create or complete SharedSpace's local Docker Compose configuration."""

import argparse
import fcntl
import os
from pathlib import Path
import re
import secrets
import tempfile
from urllib.parse import quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
ASSIGNMENT = re.compile(
    r"""^[ \t]*(?:export[ \t]+)?(?P<key>[A-Za-z_]\w*)[ \t]*=(?P<leading>[ \t]*)"""
    r"""(?P<value>'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[^\r\n]*)""",
    re.MULTILINE,
)
SECRET_LENGTHS = {
    "POSTGRES_PASSWORD": 24,
    "MINIO_ROOT_PASSWORD": 24,
    "JWT_SECRET": 32,
    "OFFICE_JWT_SECRET": 32,
}
POSTGRES_KEYS = ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")


def assignments(text):
    return {match["key"]: match for match in ASSIGNMENT.finditer(text)}


def value_text(match):
    if match is None:
        return ""
    raw = match["value"].strip()
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1].replace("\\'", "'")
    if raw.startswith('"') and raw.endswith('"'):
        if re.search(r"\\|\$[\w{]", raw):
            raise ValueError(f"укажите DATABASE_URL вручную для {match['key']} с подстановками")
        return raw[1:-1]
    if raw.startswith("#") and match["leading"]:
        return ""
    raw = re.split(r"\s+#", raw, maxsplit=1)[0].rstrip()
    if re.search(r"\$[\w{]", raw):
        raise ValueError(f"укажите DATABASE_URL вручную для {match['key']} с подстановками")
    return raw


def is_empty(match):
    raw = match["value"].strip()
    return not raw or raw in ("''", '""') or (raw.startswith("#") and bool(match["leading"]))


def dotenv_value(value):
    if re.fullmatch(r"[A-Za-z0-9_./:@?%=&+\-]*", value):
        return value
    return "'" + value.replace("'", "\\'") + "'"


def complete_env(template, existing):
    defaults = {key: match["value"] for key, match in assignments(template).items()}
    defaults.update(
        APP_URL="http://localhost:3000",
        MINIO_PUBLIC_ENDPOINT="localhost",
        SMTP_FROM="",
        DOMAIN="",
    )
    current = assignments(existing if existing is not None else "")
    missing = {
        key for key in defaults
        if key not in current or (
            key in (*SECRET_LENGTHS, *POSTGRES_KEYS, "MINIO_ROOT_USER", "DATABASE_URL")
            and is_empty(current[key])
        )
    }
    for key, size in SECRET_LENGTHS.items():
        if key in missing:
            defaults[key] = secrets.token_hex(size)

    if "DATABASE_URL" in missing:
        user, password, db = (
            quote(defaults[key] if key in missing else value_text(current[key]), safe="")
            for key in POSTGRES_KEYS
        )
        defaults["DATABASE_URL"] = f"postgres://{user}:{password}@postgres:5432/{db}?sslmode=disable"
    elif missing.intersection(POSTGRES_KEYS):
        dsn = urlsplit(value_text(current["DATABASE_URL"]))
        if dsn.hostname == "postgres" and dsn.scheme in ("postgres", "postgresql"):
            parts = (dsn.username, dsn.password, dsn.path.removeprefix("/"))
            for key, part in zip(POSTGRES_KEYS, parts):
                if key not in missing:
                    continue
                if not part:
                    raise ValueError(f"укажите {key} вручную для заданного DATABASE_URL")
                defaults[key] = unquote(part)

    if existing is None:
        return patch_values(template, assignments(template), defaults)
    updated = patch_values(existing, current, {key: defaults[key] for key in missing if key in current})
    new_keys = [key for key in defaults if key in missing and key not in current]
    if not new_keys:
        return updated
    newline = "\r\n" if "\r\n" in existing else "\n"
    if updated and not updated.endswith("\n"):
        updated += newline
    if updated:
        updated += newline
    return updated + newline.join(f"{key}={dotenv_value(defaults[key])}" for key in new_keys) + newline


def patch_values(text, matches, values):
    for key in sorted(values, key=lambda key: matches[key].start("value"), reverse=True):
        match = matches[key]
        value = dotenv_value(values[key])
        if match["value"].startswith("#") and match["leading"]:
            value += " " + match["value"]
        text = text[:match.start("value")] + value + text[match.end("value"):]
    return text


def write_env(path):
    # Lock the directory so simultaneous calls see the published file.
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(directory, fcntl.LOCK_EX)
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise ValueError("укажите обычный файл для записи конфигурации")
        existing = path.read_bytes().decode("utf-8") if path.exists() else None
        updated = complete_env((ROOT / ".env.example").read_text(encoding="utf-8"), existing)
        if updated == existing:
            return "Настройки уже заполнены."
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".sharedspace-env-", delete=False) as temp:
            temporary_path = Path(temp.name)
            try:
                temp.write(updated.encode("utf-8"))
                temp.close()
                os.replace(temporary_path, path)
            finally:
                temporary_path.unlink(missing_ok=True)
        return "Создан локальный .env." if existing is None else "Недостающие настройки добавлены."
    finally:
        os.close(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".env", help="output file (default: project .env)")
    args = parser.parse_args()
    try:
        print(write_env(args.output))
    except (OSError, ValueError) as error:
        parser.exit(1, f"Не удалось подготовить .env: {error}\n")


if __name__ == "__main__":
    main()
