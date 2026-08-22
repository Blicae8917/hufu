---
name: "speckit-plan"
description: "Execute the implementation planning workflow using the plan template to generate design artifacts."
---

# speckit-plan

Follow `.agents/skills/speckit-plan/SKILL.md`. Do not duplicate that workflow here.

## Script selection

- Linux, or when `pwsh` is unavailable: `.specify/scripts/bash/` with `--json`
- Windows / `pwsh`: `.specify/scripts/powershell/` with `-Json`

Flag map: `-Json` → `--json`; `-RequireTasks` → `--require-tasks`; `-IncludeTasks` → `--include-tasks`; `-PathsOnly` → `--paths-only`; `-Template NAME` → `--template NAME`; `-DryRun` → `--dry-run`.
