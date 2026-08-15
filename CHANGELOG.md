# 变更日志

本文件记录项目中所有值得关注的变更。

## [0.1.0] - 未发布

### 新增

- 中文产品规范、架构说明、Constitution、ADR 0001–0005 与上游兼容性基线的候选设计正本。
- 零 Cordis 依赖的严格 TypeScript ESM 领域核心骨架，以及与 `0.0.1` 对齐的 `hufu validate`。
- 本机 `local` JSONL 账本与四个有界命令 `connect` / `doctor` / `status` / `handoff`，
  以及由回放得到的三轴 CurrentView。本模块不包含决策状态机
  （执行信封、路线确认、增量、语义重基）或 GitHub / GitLab 投影。

### 变更

- 发行包名由 `hufu-console` 改为 `hufu`。
- 当前工作基线由 Python 迁到 Node.js / pnpm；主线门禁改为 `pnpm test`、
  `node scripts/check-version.mjs` 与 `git diff --check`。
- `0.0.1` Python 实现从主线移除，历史由标签 `v0.0.1` 保留。
- `0.1.0` 发布门在设计上收敛为只读影子纵切（四个有界命令、`local` 与本仓库 GitHub
  只读投影、三轴 CurrentView）。四个有界命令与本机账本已在本模块交付；GitHub
  只读投影仍由后续 Module 交付。本基线不包含决策状态机。

## [0.0.1] - 2026-08-13

- 建立最初的本地开源项目骨架：最小 `TaskEnvelope` 合同、本地验证 CLI
  和无运行时依赖的测试。
