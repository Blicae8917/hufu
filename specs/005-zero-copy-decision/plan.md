# Implementation Plan: 零拷贝决策流

**Branch**: `005-zero-copy-decision` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-zero-copy-decision/spec.md`

**Parent Issue**: [#6](https://github.com/Blicae8917/hufu/issues/6)

## Summary

在 M2 账本与 M3 本仓 GitHub 只读投影之上，实现完整零拷贝决策流：初始裁决正文只完整保存一次；信封、路线确认、三类增量与交接只传引用和摘要；CurrentView 派生执行护栏；语义重基只在既有命令边界同步求值。新增单一产品命令 `hufu decide`（互斥载荷文件）。零新增运行时依赖、零 Cordis、无后台、无写回。版本保持 `0.1.0`。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与 M1–M3 相同）

**Primary Dependencies**: 继续仅 `typescript` 开发依赖；零运行时依赖；不引入 Cordis。摘要沿用 RFC 8785 有界子集 + SHA-256（`digest.ts`）

**Storage**: 沿用 `.hufu/ledger/events.jsonl` 与 `write.lock`。决策记录是账本事件，不是第二套文件正本。GitHub 投影缓存仍只由 `status --refresh` 写入。

**Testing**: `tsc` + `node:test`；夹具 `tests/fixtures/decision/`；门禁不打真实网络、不执行外部效果。先失败测试（FR-025）

**Target Platform**: Windows 10+ 与 POSIX；前台 CLI；无守护进程

**Project Type**: 单包 CLI（根目录 `hufu`）

**Performance Goals**: 夹具回放与护栏求值在 2 秒内；快速开始 15 分钟（SC-001）

**Constraints**: 无后台轮询；无凭据；无议题写回；无外部效果执行；版本 `0.1.0`；核心零框架；`validate` 与既有四命令成功/失败合同保持

**Scale/Scope**: 本机 `local` 与本仓 `github` 两种已连接正本上的一条决策流；不交付 GitLab / Cordis / 会商 / Web / 出站 Runtime

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。决策只引用 `task_authority` 与已有 `AuthorizationGrant`；确认与护栏不扩权；议题正文不进裁决 |
| II 正交分离与插件优先 | 通过。决策是执行事实，不拥有工作项生命周期；CLI 仍是 Consumer；核心零框架 |
| III 公开核心，研究外置 | 通过。夹具不含凭据、本机路径或议题正文 |
| IV 真实事件与证据 | 通过。只追加；缺读回不得写 `0`/已发生；投影可重建 |
| V 唯一责任角色 | 通过。信封/确认按当值 `project_lead`/`mission_lead`/`owner` 校验；同一人可多绑但不得跳过步骤 |
| VI 默认小型、可移植、可逆 | 通过。无新依赖、无 daemon、无网络（github 记下裁决不刷新） |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #6 为准；先失败测试 |
| VIII 有界且经济 | 通过。无后台检测；不采集效能试点；护栏只挡 Hufu 前向动作 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过。不新增网络入口；`status --refresh` 仍仅 M3 |
| ADR 0001 | 通过。决策在执行事实轴；不写回任务正本 |
| ADR 0003 | 通过。不组装 Cordis |
| ADR 0005 | 通过。一份正文、信封只引用、ACK 非审批、三类 Delta、事件驱动重基；四道必答题已写入规格 |

Phase 1 设计后复检：仍通过。`hufu decide` 是有界 Consumer，不是第二套任务系统。CurrentView 新增决策槽为派生，无裁决时 `data_insufficient`。`view_schema_version` 保持 `1`（与 M3 相同：加字段、旧槽语义不变）。

## Project Structure

### Documentation (this feature)

```text
specs/005-zero-copy-decision/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── command-error.v1.md
│   ├── current-view.v1.md
│   └── decision.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── ...                      # M2/M3 模块保持
├── decide.ts                # hufu decide 命令入口：读文件、校验角色、追加
├── decision-schema.ts       # Packet/Envelope/ACK/Delta 载荷校验
├── decision-digest.ts       # 裁决 content_digest 与三项成分摘要
├── guardrails.ts            # 护栏与语义重基纯函数（无 I/O、无定时器）
├── envelope.ts              # 增加决策事件类型
├── projector.ts             # 折叠决策引用、信封、ACK、护栏
├── handoff.ts               # 下一步只含引用；护栏挡住前向动作
├── cli.ts                   # 注册 decide
└── errors.ts                # 新增失败码

tests/
├── decide-packet.test.ts
├── decide-envelope.test.ts
├── decide-ack.test.ts
├── decide-delta.test.ts
├── decide-guardrail.test.ts
├── decide-status-handoff.test.ts
└── fixtures/decision/       # 合法/非法 JSON 载荷，不含议题正文
```

**Structure Decision**: 继续扁平 `src/hufu/`。校验与摘要与护栏分成纯模块，便于夹具单测；`decide.ts` 只做命令与账本追加。不把决策写入 `contracts.ts` 的 `0.0.1` TaskEnvelope。

## Complexity Tracking

> 无违规。新增一个产品命令是规格允许的有界操作入口，不是网页、守护进程或出站运行时。
