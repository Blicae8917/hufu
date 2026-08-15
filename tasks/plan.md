# 历史计划指针

状态：自 2026-08-14 起不再作为活跃规划正本

本文件保留 Hufu 在采用 Spec Kit 前的规划位置。它不是活跃计划、Backlog、授权来源或进度跟踪器。

## 当前正本

- GitHub Milestone 和 Module Issue 拥有交付进度及依赖状态。
- 路线图或集合 Issue 只提供 Module Issue 索引和依赖图，不复制子 Issue 状态。
- `specs/<feature>/spec.md` 拥有已接受的功能合同。
- 同一功能目录中的 `plan.md` 和 `tasks.md` 拥有该功能的设计及可执行任务拆解。
- `.specify/memory/constitution.md`、已接受 ADR、`docs/SPEC.md` 和
  `docs/ARCHITECTURE.md` 管理项目级不变量和边界。

## 历史记录

最初的本地计划建立了公开 `0.0.1` 基线：供应商中立的 `TaskEnvelope`、确定性验证 CLI
和无运行时依赖的测试。它还把类型化 Receipt、Provider Projection 和 Effect 恢复记录为未来候选切片。

这些候选切片只是规划输入。本文件不授权其中任何一项工作。
后续实现必须从已接受的 GitHub Module Issue 和对应 Spec Kit 功能目录开始。
