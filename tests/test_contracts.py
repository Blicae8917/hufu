from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from hufu.contracts import ContractError, validate_task  # noqa: E402


class ValidateTaskTests(unittest.TestCase):
    def test_accepts_a_minimal_native_task(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "task-42",
            "project": {
                "id": "demo-project",
                "repository": "https://example.com/demo/project.git",
            },
            "source": "native",
            "objective": "Validate the first public task contract.",
            "authorization_scope": ["read repository", "write local report"],
            "terminal_conditions": ["contract tests pass", "human review remains open"],
        }

        task = validate_task(payload)

        self.assertEqual(task.task_id, "task-42")
        self.assertEqual(task.project.id, "demo-project")
        self.assertEqual(task.source, "native")
        self.assertEqual(task.authorization_scope, ("read repository", "write local report"))

    def test_accepts_an_external_task_without_owning_external_status(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "external-7",
            "project": {"id": "demo-project", "repository": "git@example.com:demo/project.git"},
            "source": "external",
            "objective": "Run the authorized local verification.",
            "authorization_scope": ["run local tests"],
            "terminal_conditions": ["verification result is recorded"],
            "external_ref": "tracker:7",
        }

        task = validate_task(payload)

        self.assertEqual(task.external_ref, "tracker:7")
        self.assertFalse(hasattr(task, "external_status"))

    def test_rejects_a_missing_objective(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "task-42",
            "project": {"id": "demo-project", "repository": "https://example.com/demo.git"},
            "source": "native",
            "authorization_scope": ["read repository"],
            "terminal_conditions": ["report is produced"],
        }

        with self.assertRaisesRegex(ContractError, "objective"):
            validate_task(payload)

    def test_rejects_an_unknown_source(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "task-42",
            "project": {"id": "demo-project", "repository": "https://example.com/demo.git"},
            "source": "shadow-control-plane",
            "objective": "Do something.",
            "authorization_scope": ["read repository"],
            "terminal_conditions": ["report is produced"],
        }

        with self.assertRaisesRegex(ContractError, "source"):
            validate_task(payload)

    def test_rejects_an_empty_authorization_scope(self) -> None:
        payload = {
            "schema_version": "0.1",
            "task_id": "task-42",
            "project": {"id": "demo-project", "repository": "https://example.com/demo.git"},
            "source": "native",
            "objective": "Do something.",
            "authorization_scope": [],
            "terminal_conditions": ["report is produced"],
        }

        with self.assertRaisesRegex(ContractError, "authorization_scope"):
            validate_task(payload)


if __name__ == "__main__":
    unittest.main()
