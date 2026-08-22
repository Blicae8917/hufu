---
name: "speckit-specify"
description: "Create or update the feature specification from a natural language feature description."
---

# speckit-specify

Follow `.agents/skills/speckit-specify/SKILL.md`. Do not duplicate that workflow here.

## Script selection

- Linux, or when `pwsh` is unavailable: `.specify/scripts/bash/` with `--json`
- Windows / `pwsh`: `.specify/scripts/powershell/` with `-Json`

Flag map: `-Json` → `--json`; `-RequireTasks` → `--require-tasks`; `-IncludeTasks` → `--include-tasks`; `-PathsOnly` → `--paths-only`; `-Template NAME` → `--template NAME`; `-DryRun` → `--dry-run`.
