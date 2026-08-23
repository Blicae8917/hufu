# Implementation Plan: GitLabTaskMutationProvider（受控写回）

**Branch**: `codex/issue-66-gitlab-production-binding` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Parent Issue**: [#57](https://github.com/Blicae8917/hufu/issues/57)

**本 Plan 的实现范围（#66）**: 仅收紧既有库级 provider 与对应测试；不接真实 endpoint，不增加 CLI / Host / LoopX 能力。

## Summary

在 #57 已交付端口上增加六个失败关闭闸门：显式 production grant、Ledger exact refs、读口 + exact 写 allowlist、六状态互斥标签、真实 EvidenceRef 关闭、revision-safe prepared 恢复。仍不对真实项目执行写。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x、ESM。只修改既有 provider 编译单元。

**Primary Dependencies**: 零新增。不引入 GitLab SDK。

**Storage**: 复用 `mutation.prepared` / `EFFECT_DELTA` / receipt；只在 prepared payload 增加可审计 `production_execute_grant_ref`。

**Testing**: 严格 RED→GREEN；定向 provider 测试、公开安全 e2e、`pnpm test`、check-version、diff-check。

**Constraints**: 版本 `0.1.0`；无真实主机 / token；无生产 execute。

## Constitution Check

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本 | 通过。GitLab 仍拥有议题生命周期；写回是受控 Effect，不是第二套正本 |
| II 正交分离 | 通过。写端口在 Adapter 之后；不改 Host Agent Loop |
| III 公开核心 | 通过。仅示例主机 |
| IV 真实事件 | 通过。完成只能在 readback / projection 之后；缺失不写 `0` |
| V 角色 | 通过。`actor_binding` 引用既有角色，不从 GitLab assignee 推断 RoleBinding |
| VI 默认可逆 | 通过。测试只用 fake transport；当前项目无 production grant 时 execute 失败关闭 |
| VII Spec 驱动 | 通过。完整 kit；实现失败测试留给 #57 实现 PR |
| VIII 有界 | 通过。五种 kind，无透传 |
| 系统边界修订 | 通过。五种 kind 与禁止项与 Constitution 一致 |
| ADR 0007 | 通过。本票是 (a) |

## Project Structure

```text
specs/013-gitlab-mutation/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
└── checklists/requirements.md

tests/013-gitlab-mutation-spec.test.ts
tests/gitlab-task-mutation-provider.test.ts
tests/e2e-pilot-fixture.ts
src/hufu/gitlab-task-mutation-provider.ts
```

#66 只修改既有 `gitlab-task-mutation-provider.ts`；不得修改只读 `gitlab-port.ts` 去加写方法。
