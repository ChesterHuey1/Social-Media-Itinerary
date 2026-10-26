"""uv run python -m pinpoint.auth set-password [--stdin]

Asks for a new password (twice) and writes its hash to backend/.env as APP_PASSWORD_HASH. Creates
SESSION_SECRET too if it is missing. The password itself is never written anywhere.
Changing SESSION_SECRET in .env signs every browser out.
"""

import argparse
import getpass
import re
import secrets
import sys

from pinpoint.auth import hash_password
from pinpoint.config import BACKEND_DIR

ENV_FILE = BACKEND_DIR / ".env"


def set_env_value(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    return pattern.sub(line, text) if pattern.search(text) else f"{text.rstrip()}\n{line}\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["set-password"])
    parser.add_argument("--stdin", action="store_true", help="read the password from standard input instead")
    args = parser.parse_args()

    if args.stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        password = getpass.getpass("New password: ")
        if getpass.getpass("Again: ") != password:
            sys.exit("The two passwords differ. Nothing changed.")
    if len(password) < 10:
        sys.exit("Use at least 10 characters. Nothing changed.")

    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    text = set_env_value(text, "APP_PASSWORD_HASH", hash_password(password))
    if not re.search(r"^SESSION_SECRET=.+$", text, re.MULTILINE):
        text = set_env_value(text, "SESSION_SECRET", secrets.token_hex(32))
    ENV_FILE.write_text(text, encoding="utf-8")
    print("Password set. Restart the backend to use it.")


if __name__ == "__main__":
    main()
