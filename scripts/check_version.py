from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def extract(pattern: str, path: Path) -> str:
    match = re.search(pattern, path.read_text(encoding="utf-8"), re.MULTILINE)
    if match is None:
        raise SystemExit(f"version not found in {path.name}")
    return match.group(1)


versions = {
    "package": extract(r'^__version__ = "([^"]+)"$', ROOT / "src/hufu/__init__.py"),
    "pyproject": extract(r'^version = "([^"]+)"$', ROOT / "pyproject.toml"),
    "version_doc": extract(r"Current version: `([^`]+)`", ROOT / "VERSION.md"),
}

if len(set(versions.values())) != 1:
    raise SystemExit(f"version mismatch: {versions}")

print(f"version check passed: {next(iter(versions.values()))}")
