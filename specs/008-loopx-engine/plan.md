# Implementation Plan: LoopX 第一批机制接入

**Branch**: `008-loopx-engine` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-loopx-engine/spec.md`

**Parent Issue**: [#9](https://github.com/Blicae8917/hufu/issues/9)

## Summary

在已交付的本机账本、只读投影与零拷贝决策流之上，增加**可选** `engine-loopx` 机制：显式选用后，可用既有 `hufu decide` 记录类型化结果、核验回执，并把无进展/缺读回约束折叠进 CurrentView。引擎不是 `task_authority`。默认不绑定引擎时，#6/#8 合同不变。不引入 LoopX 发行包、不复制上游源码、不组装新的 Cordis 插件、无调度器/心跳/配额/自动开工。效果读回继续走 `decide --effect`。版本保持 `0.1.0`。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与 M1–M6 相同）

**Primary Dependencies**: 继续仅 `typescript` 开发依赖；零新增运行时依赖；`package.json` / workspace 不得出现 `loopx`。不 vendoring 上游源码。机制按 Hufu 自有合同在 `src/hufu/` 重写

**Storage**: 沿用 `.hufu/ledger/events.jsonl` 与 `write.lock`。引擎选用、类型化结果与回执是账本事件，不是第二套文件正本，也不是任务生命周期

**Testing**: `tsc` + `node:test`；夹具 `tests/fixtures/engine/`；门禁不打真实网络、不执行外部效果、不要求 LoopX CLI。先失败测试（FR-017）

**Target Platform**: Windows 10+ 与 POSIX；前台 CLI；无守护进程

**Project Type**: 单包 CLI（根目录 `hufu`）；不新增 workspace 包

**Performance Goals**: 夹具折叠与护栏求值在 2 秒内；快速开始 15 分钟（SC-001）

**Constraints**: 无后台；无凭据；无议题写回；无外部效果执行；无 LoopX 默认依赖；版本 `0.1.0`；核心零框架；未绑定引擎时既有命令合同不变

**Scale/Scope**: 一条已连接 Project 上的可选机制引擎（typed result / Receipt / readback / 有界恢复）；不交付完整 LoopX 控制面、Goal/Todo/Registry 正本、会商、Web、出站 Runtime

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。引擎不进 `task_authority`；回执/结果/Journal 不扩权；Goal/Todo/Registry 映射失败关闭 |
| II 正交分离与插件优先 | 通过。引擎是执行机制 Provider；策略在 Adapter 之后；不改 Host Agent Loop；核心零框架 |
| III 公开核心，研究外置 | 通过。不复制上游源码；夹具不含客户项目、本机路径或私有 Endpoint |
| IV 真实事件与证据 | 通过。只追加；缺读回不得写 `0`/已发生；无进展只停前向动作 |
| V 唯一责任角色 | 通过。选用与结果/回执按当值执行角色校验；不把上游 Goal owner 升格为 RoleBinding |
| VI 默认小型、可移植、可逆 | 通过。无新依赖、无 daemon、无自动 Agent、可逆关闭=不绑定引擎 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #9 为准；先失败测试 |
| VIII 有界且经济 | 通过。不采集效能试点（#10）；无调度/心跳/配额 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过。本模块不新增网络入口 |
| ADR 0001 | 通过。引擎在执行事实轴 |
| ADR 0003 | 通过。机制目录而非完整控制面；不引入 LoopX npm/Python 依赖；不复制源码故仍遵守「本批不搬控制面」。上游 HEAD 已改 Apache-2.0，本模块不改钉实现基线、不搬 HEAD 源码；若日后复制必须先修订 ADR 许可证表述并更新 NOTICE |
| ADR 0005 | 通过。复用效果增量与读回；不另建决策正本 |

Phase 1 设计后复检：仍通过。`decide --engine/--result/--receipt` 是既有 Consumer 的有界标志，不是第五套任务系统。`view_schema_version` 保持 `1`。兼容性核对本仍为 LoopX `58f545ae` / `0.4.7`（MIT）；HEAD `v0.4.8` Apache-2.0 仅为观测。

## Project Structure

### Documentation (this feature)

```text
specs/008-loopx-engine/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── command-error.v1.md
│   ├── current-view.v1.md
│   └── engine-loopx.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── engine-loopx.ts      # EnginePort：校验选用、拒绝控制面字段、分类结果
├── engine-schema.ts     # 选用 / TypedResult / Receipt 载荷校验
├── decide.ts            # 增加 --engine / --result / --receipt
├── guardrails.ts        # 无进展停止前向动作（无 timer）
├── projector.ts         # 折叠 engine / typed_result / receipt 槽
├── envelope.ts          # 增加引擎事件类型
├── connect.ts           # 拒绝 task_authority=loopx / engine
├── errors.ts            # 本模块稳定错误码
└── cli.ts               # 解析新增互斥标志

tests/
├── engine-bind.test.ts
├── engine-result.test.ts
├── engine-receipt.test.ts
├── engine-recovery.test.ts
├── engine-boundary.test.ts
├── engine-deps.test.ts          # package.json 不得依赖 loopx
└── fixtures/engine/             # 合法/非法 JSON，不含 Goal 正本或上游源码
```

**Structure Decision**: 继续扁平 `src/hufu/`。引擎校验与分类放在独立 Adapter 文件，不进入 `contracts.ts` 信封，也不把 LoopX Goal 解析塞进 `github-ref.ts` / `gitlab-ref.ts`。测试一律临时目录。不新增 `packages/loopx`。

## Complexity Tracking

> 无违规。在 `hufu decide` 上增加三个互斥文件标志，是规格允许的既有命令扩展，不是新的产品级出站命令、网页或守护进程。独立 `engine-loopx.ts` 相对把 Goal 写入工作项模型更符合 ADR 0003。
