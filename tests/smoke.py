from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
env = os.environ.copy()
env["PYTHONPATH"] = str(ROOT / "src")

result = subprocess.run(
    [sys.executable, "-m", "hufu", "validate", str(ROOT / "examples/task.json")],
    cwd=ROOT,
    env=env,
    capture_output=True,
    text=True,
    check=False,
)

if result.returncode != 0:
    raise SystemExit(result.stderr)

summary = json.loads(result.stdout)
if summary.get("valid") is not True or summary.get("task_id") != "example-001":
    raise SystemExit(f"unexpected validation output: {summary}")

print("smoke check passed")
