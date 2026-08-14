from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .contracts import ContractError, validate_task


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hufu")
    subcommands = parser.add_subparsers(dest="command", required=True)
    validate = subcommands.add_parser("validate", help="validate a task envelope")
    validate.add_argument("task_file", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)

    try:
        payload = json.loads(args.task_file.read_text(encoding="utf-8"))
        task = validate_task(payload)
    except (OSError, json.JSONDecodeError, ContractError) as error:
        print(f"invalid task contract: {error}", file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "project_id": task.project.id,
                "schema_version": task.schema_version,
                "source": task.source,
                "task_id": task.task_id,
                "valid": True,
            },
            sort_keys=True,
        )
    )
    return 0
