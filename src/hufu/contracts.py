from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


SCHEMA_VERSION = "0.1"
ALLOWED_SOURCES = frozenset({"native", "external"})


class ContractError(ValueError):
    """Raised when a task envelope does not satisfy the public contract."""


@dataclass(frozen=True)
class ProjectRef:
    id: str
    repository: str


@dataclass(frozen=True)
class TaskEnvelope:
    schema_version: str
    task_id: str
    project: ProjectRef
    source: str
    objective: str
    authorization_scope: tuple[str, ...]
    terminal_conditions: tuple[str, ...]
    external_ref: str | None = None


def _required_text(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{field} must be a non-empty string")
    return value.strip()


def _required_text_list(payload: Mapping[str, Any], field: str) -> tuple[str, ...]:
    value = payload.get(field)
    if not isinstance(value, list) or not value:
        raise ContractError(f"{field} must be a non-empty list of strings")
    if any(not isinstance(item, str) or not item.strip() for item in value):
        raise ContractError(f"{field} must contain only non-empty strings")
    return tuple(item.strip() for item in value)


def validate_task(payload: Mapping[str, Any]) -> TaskEnvelope:
    """Validate external data and return an immutable task envelope."""
    if not isinstance(payload, Mapping):
        raise ContractError("task must be a JSON object")

    schema_version = _required_text(payload, "schema_version")
    if schema_version != SCHEMA_VERSION:
        raise ContractError(f"schema_version must be {SCHEMA_VERSION}")

    source = _required_text(payload, "source")
    if source not in ALLOWED_SOURCES:
        allowed = ", ".join(sorted(ALLOWED_SOURCES))
        raise ContractError(f"source must be one of: {allowed}")

    project_payload = payload.get("project")
    if not isinstance(project_payload, Mapping):
        raise ContractError("project must be a JSON object")
    project = ProjectRef(
        id=_required_text(project_payload, "id"),
        repository=_required_text(project_payload, "repository"),
    )

    external_ref_value = payload.get("external_ref")
    if external_ref_value is not None and (
        not isinstance(external_ref_value, str) or not external_ref_value.strip()
    ):
        raise ContractError("external_ref must be a non-empty string when provided")

    return TaskEnvelope(
        schema_version=schema_version,
        task_id=_required_text(payload, "task_id"),
        project=project,
        source=source,
        objective=_required_text(payload, "objective"),
        authorization_scope=_required_text_list(payload, "authorization_scope"),
        terminal_conditions=_required_text_list(payload, "terminal_conditions"),
        external_ref=external_ref_value.strip() if external_ref_value is not None else None,
    )
