---
name: "speckit-taskstoissues"
description: "Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts."
---

# speckit-taskstoissues

Follow `.agents/skills/speckit-taskstoissues/SKILL.md`. Do not duplicate that workflow here.

## Script selection

- Linux, or when `pwsh` is unavailable: `.specify/scripts/bash/` with `--json`
- Windows / `pwsh`: `.specify/scripts/powershell/` with `-Json`

Flag map: `-Json` → `--json`; `-RequireTasks` → `--require-tasks`; `-IncludeTasks` → `--include-tasks`; `-PathsOnly` → `--paths-only`; `-Template NAME` → `--template NAME`; `-DryRun` → `--dry-run`.
