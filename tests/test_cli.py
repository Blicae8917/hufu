from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ValidateCommandTests(unittest.TestCase):
    def test_validate_prints_a_machine_readable_summary(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "task-42",
            "project": {"id": "demo-project", "repository": "https://example.com/demo.git"},
            "source": "native",
            "objective": "Validate a task.",
            "authorization_scope": ["read repository"],
            "terminal_conditions": ["validation succeeds"],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            task_file = Path(temp_dir) / "task.json"
            task_file.write_text(json.dumps(payload), encoding="utf-8")
            env = os.environ.copy()
            env["PYTHONPATH"] = str(PROJECT_ROOT / "src")

            result = subprocess.run(
                [sys.executable, "-m", "hufu", "validate", str(task_file)],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(result.stdout),
            {
                "project_id": "demo-project",
                "schema_version": "0.1",
                "source": "native",
                "task_id": "task-42",
                "valid": True,
            },
        )

    def test_validate_returns_two_for_an_invalid_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            task_file = Path(temp_dir) / "task.json"
            task_file.write_text("{}", encoding="utf-8")
            env = os.environ.copy()
            env["PYTHONPATH"] = str(PROJECT_ROOT / "src")

            result = subprocess.run(
                [sys.executable, "-m", "hufu", "validate", str(task_file)],
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 2)
        self.assertIn("schema_version", result.stderr)


if __name__ == "__main__":
    unittest.main()
