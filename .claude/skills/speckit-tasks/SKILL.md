---
name: "speckit-tasks"
description: "Generate an actionable, dependency-ordered tasks.md for the feature based on available design artifacts."
---

# speckit-tasks

Follow `.agents/skills/speckit-tasks/SKILL.md`. Do not duplicate that workflow here.

## Script selection

- Linux, or when `pwsh` is unavailable: `.specify/scripts/bash/` with `--json`
- Windows / `pwsh`: `.specify/scripts/powershell/` with `-Json`

Flag map: `-Json` → `--json`; `-RequireTasks` → `--require-tasks`; `-IncludeTasks` → `--include-tasks`; `-PathsOnly` → `--paths-only`; `-Template NAME` → `--template NAME`; `-DryRun` → `--dry-run`.
