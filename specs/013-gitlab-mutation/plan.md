# Implementation Plan: GitLabTaskMutationProvider（受控写回）

**Branch**: `013-gitlab-mutation` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Parent Issue**: [#57](https://github.com/Blicae8917/hufu/issues/57)

**本 Plan 的实现范围（本波）**: 无运行时。只固定合同、宪章引用与通过的约束测试。

## Summary

按 ADR 0007 (a) 与 Constitution 系统边界修订，锁定独立写端口、五种 kind、preview / execute / readback、绑定字段、幂等 / readback 纪律、HTTP 例外与「真实生产 execute 未授予」。本波不改 `src/` 写回路径。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x、ESM。本波不新增编译单元。

**Primary Dependencies**: 零新增。不引入 GitLab SDK。

**Storage**: 未来实现才追加 `mutation.prepared` 与 `EFFECT_DELTA`；本波不新增账本事件。

**Testing**: 本波 `tests/013-gitlab-mutation-spec.test.ts` 必须通过。失败 Adapter 测试见 `tasks.md`，不得本波落地。

**Constraints**: 版本 `0.1.0`；无真实主机 / token；无生产 execute。

## Constitution Check

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本 | 通过。GitLab 仍拥有议题生命周期；写回是受控 Effect，不是第二套正本 |
| II 正交分离 | 通过。写端口在 Adapter 之后；不改 Host Agent Loop |
| III 公开核心 | 通过。仅示例主机 |
| IV 真实事件 | 通过。完成只能在 readback / projection 之后；缺失不写 `0` |
| V 角色 | 通过。`actor_binding` 引用既有角色，不从 GitLab assignee 推断 RoleBinding |
| VI 默认可逆 | 通过。本波无网络副作用；未来 execute 仍被生产闸门挡住 |
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
```

未来实现 PR 才可增加 `src/hufu/gitlab-task-mutation-provider.ts` 一类文件；不得修改只读 `gitlab-port.ts` 去加写方法。
