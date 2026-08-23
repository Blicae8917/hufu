# Implementation Plan: 自建 GitLab AuthorityProvider

**Branch**: `011-gitlab-authority` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-gitlab-authority/spec.md`

**Parent Issue**: [#49](https://github.com/Blicae8917/hufu/issues/49)

**本 Plan 的实现范围**: **无。** 本文件只固定设计合同与未来实现闸门。本 PR 不得改 Adapter、CLI 或 `src/` 运行时。

## Summary

按 ADR 0006 类 (1) 设计自建 GitLab 作为 `task_authority=gitlab` 的 AuthorityProvider，并与已交付 #8 / `007-gitlab-readonly` 只读投影划界。本 PR 落地完整 Spec Kit 与一条通过的设计约束测试；版本保持 `0.1.0`。写回默认关闭。Constitution I 与「系统边界」的只读 / 写回禁令不因本 Kit 而修订；未来写回实现在维护者批准修订之前保持阻断。

## Technical Context

**Language/Version**: 当前基线不变：Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM。本 PR 不新增编译单元以外的运行时代码（仅新增设计约束测试）。

**Primary Dependencies**: 零新增运行时依赖。不引入 GitLab SDK。未来实现若需要认证读取，只能引用宿主既有凭据机制，不得把凭据写入本仓库。

**Storage**: 不新增账本事件。不把自建实例 URL 写入公开仓。未来实现若连接自建实例，连接记录仍不得存储凭据。

**Testing**: 本 PR 仅 `tests/011-gitlab-authority-spec.test.ts`（必须通过）。未来实现 PR 的第一条任务才是会失败的适配器测试，不得在本 PR 落地。

**Target Platform**: 与现有 CLI 相同（Windows 与 POSIX）；本 PR 不改变可观察 CLI 行为。

**Project Type**: 单包 CLI + Spec Kit 文档；本 PR 只增加 `specs/011-gitlab-authority/` 与一条测试。

**Performance Goals**: 设计对照（quickstart）10 分钟；门禁测试与现有套件同样在无网络下完成。

**Constraints**: 设计 only；不授权实现；不扩大 007；不把 `gitlab.com` SaaS 默认为可写正本；公开仓无凭据 / 无真实私有 Endpoint；不修订 Constitution；版本 `0.1.0`。

**Scale/Scope**: 一份设计合同，回答「自建实例何时能当任务正本」。不交付写回、LoopX 桥、Renderer、M10–M15 或出站 Runtime。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过（设计）。仍恰好一个 `task_authority`；GitLab 拥有议题生命周期；Hufu 只投影。Journal/Receipt 不扩权。**已核实张力**：Constitution I 要求 GitHub/GitLab 议题只作为只读 Projection。本 Kit 描述的未来写回不得在本 PR 实现，也不得把 Kit 落地当成已修订该条。 |
| II 正交分离与插件优先 | 通过。未来 GitLab 特定状态仍必须放在 Adapter 之后；本 PR 不改 Host Agent Loop，不引入出站 Runtime。 |
| III 公开核心，研究外置 | 通过。仅示例占位 `https://gitlab.example.com`（示例）、`http://192.0.2.10:41101`（示例，RFC 5737 TEST-NET-1）、`http://gitlab.example.com:41101`（示例）与 `example-group/example-project`（示例）；无凭据、无客户名、无家庭 / 机房细节。 |
| IV 真实事件与证据 | 通过。本 PR 不伪造观测；设计文本禁止把缺失写成 `0`。 |
| V 唯一责任角色 | 通过。不把 GitLab assignee 升格为 RoleBinding。 |
| VI 默认小型、可移植、可逆 | 通过。本 PR 无新依赖、无 daemon、无凭据存储、无写回。 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；实现行为的失败测试留给未来 PR 的首批任务。本 PR 的设计约束测试必须通过。 |
| VIII 有界且经济 | 通过。不采集效能试点；不把本票扩成控制面。 |
| 版本纪律 | 通过。保持 `0.1.0`，不打标签。 |
| 系统边界：第一版 Adapter 只读，外部写回不在已接受范围 | **已核实，保持。** 落地本 Spec Kit **不修订** Constitution。任何后续写回实现在维护者批准 Constitution 修订之前保持阻断。本栏不是授权写回的例外。 |
| ADR 0001 | 通过。V1 投影只读；写回需要新的决策，不能当 Adapter 便利功能。 |
| ADR 0003 | 通过。不组装新 Cordis 插件；出站 Runtime 不是已接受方向。 |
| ADR 0006 | 通过。本票证明属于类 (1) 自建 GitLab AuthorityProvider；不是实现授权；不复活 M10–M15。 |

Phase 1 设计后复检：仍通过。合同把 007 只读边界、自建身份 / 失败关闭、以及「不扩大 007」分成独立文件。`docs/SPEC.md`、AGENTS.md、007 合同与 Constitution 正文均不在本 PR 修改面。

## Project Structure

### Documentation (this feature)

```text
specs/011-gitlab-authority/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── gitlab-authority.v1.md
│   ├── identity-auth-fail-closed.v1.md
│   ├── 007-non-expansion.v1.md
│   ├── cli.md
│   ├── command-error.v1.md
│   └── current-view.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

本 PR **不得**增加下列实现文件。路径只供未来实现票对照，且须先有失败测试。

```text
# 未来实现票（本 PR 不创建）
src/hufu/
├── gitlab-ref.ts              # 保持 007：拒绝自建 Host
├── gitlab-instance-ref.ts     # 未来：gitlab-instance: 解析（新建，不塞进 007 解析器）
├── gitlab-port.ts             # 保持只读 list；未来不得默认可写方法
└── ...

tests/
├── 011-gitlab-authority-spec.test.ts   # 本 PR：通过的设计约束测试
└── gitlab-authority-adapter.test.ts    # 未来实现票首个失败测试；本 PR 不落地
```

**Structure Decision**: 文档树镜像 007。运行时保持 007。自建引用若未来实现，必须使用独立解析文件，禁止修改 `gitlab-ref.ts` 去接受自建 Host。

## Complexity Tracking

> 无违规。Constitution 写回禁令被记录为**未来实现阻断**，不是本设计票的例外申请。不在本 PR 增加网络、凭据或 Adapter。
