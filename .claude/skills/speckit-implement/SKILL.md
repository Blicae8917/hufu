---
name: "speckit-implement"
description: "Execute the implementation plan by processing and executing all tasks defined in tasks.md"
---

# speckit-implement

Follow `.agents/skills/speckit-implement/SKILL.md`. Do not duplicate that workflow here.

## Script selection

- Linux, or when `pwsh` is unavailable: `.specify/scripts/bash/` with `--json`
- Windows / `pwsh`: `.specify/scripts/powershell/` with `-Json`

Flag map: `-Json` → `--json`; `-RequireTasks` → `--require-tasks`; `-IncludeTasks` → `--include-tasks`; `-PathsOnly` → `--paths-only`; `-Template NAME` → `--template NAME`; `-DryRun` → `--dry-run`.
