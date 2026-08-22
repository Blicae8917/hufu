@AGENTS.md

# Claude Code 入口

本文件只负责把仓库规则投递给 Claude Code，不复制 `AGENTS.md` 正文。

## 技能

Spec Kit 技能位于 `.agents/skills/`（Codex 布局，十个 `speckit-*`）。
Claude Code 通过 `.claude/skills/` 下的同名入口发现它们；入口指向上述正文，不要另写一套流程。

## 脚本选择

`.specify/scripts/powershell/` 与 `.specify/scripts/bash/` 并存，JSON 字段名保持一致。

- Linux，或 `pwsh` 不可用：使用 `.specify/scripts/bash/*.sh`，开关为 `--json`、`--require-tasks`、`--include-tasks`、`--paths-only`、`--template NAME`、`--dry-run`
- Windows，或已安装 `pwsh`：可继续使用 `.specify/scripts/powershell/*.ps1`，开关为 `-Json`、`-RequireTasks`、`-IncludeTasks`、`-PathsOnly`、`-Template NAME`、`-DryRun`

不要在 Linux 会话中把缺少 `pwsh` 当成可以跳过 Spec Kit。
