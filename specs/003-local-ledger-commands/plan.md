# Implementation Plan: 本机账本与四个有界命令

**Branch**: `003-local-ledger-commands` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-local-ledger-commands/spec.md`

**Parent Issue**: [#3](https://github.com/Blicae8917/hufu/issues/3)

## Summary

在 M1 零 Cordis TypeScript 核心上增加单安装、单写者的本机 `local` JSONL 账本，以及 `connect` / `doctor` / `status` / `handoff` 四个有界命令。冷启动固定写入指挥官身份、首份 `AuthorizationGrant` 与当值 `project_lead`。CurrentView 按三轴物化。不引入网络默认路径、数据库、守护进程、Cordis 或外部正本。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（`module`/`moduleResolution` = `Node16`）

**Primary Dependencies**: 继续仅 `typescript` 开发依赖；零运行时依赖；零 Cordis / LoopX。规范化摘要在核心内实现 RFC 8785 有界子集，哈希用 `node:crypto`

**Storage**: 工作区 `.hufu/ledger/events.jsonl`（LF、一行一条 JSON）；独占锁 `.hufu/ledger/write.lock`；可选可重建缓存 `.hufu/cache/`（本模块可为空）。已在 `.gitignore`

**Testing**: `tsc` + `node:test`（编译后跑 `dist/tests/`）；先失败测试再实现（FR-021）

**Target Platform**: Windows 10+ 与 POSIX；前台 CLI；无守护进程、无监听端口

**Project Type**: 单包 CLI（根目录 `package.json`，发行名 `hufu`）

**Performance Goals**: 冷启动与回放不超过约 1000 条事件的样例账本在 2 秒内完成；快速开始 10 分钟预算

**Constraints**: 无默认网络、无凭据、无后台、无遥测；版本保持 `0.1.0`；核心零框架依赖；单写者 fail closed；`validate` 合同不变

**Scale/Scope**: 四命令 + 账本 + CurrentView + 授权本体；不交付决策状态机、GitHub Adapter、Web

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。只实现 `local`；`AuthorizationGrant` 是唯一授权本体；Journal/Handoff 不扩权 |
| II 正交分离与插件优先 | 通过。领域核心仍零框架；CLI 只做 Consumer；StorageDomain 以 TypeScript 接口表达，不引入 Cordis |
| III 公开核心，研究外置 | 通过。不写入本机绝对路径、凭据或内部项目名 |
| IV 真实事件与证据 | 通过。只追加自有事实；缺失标 `unavailable`/`data_insufficient`；不把缺失写成 `0` |
| V 唯一责任角色 | 通过。冷启动产生恰好一个当值 `project_lead`；指挥官不要求 SessionBinding |
| VI 默认小型、可移植、可逆 | 通过。JSONL + 前台 CLI；无数据库/队列/daemon；锁失败即拒绝 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；先失败测试；进度以 #3 为准 |
| VIII 有界且经济 | 通过。不增加控制面；不采集效能试点；`status` 不联网 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过。显式刷新留给 #4 |
| ADR 0001 | 通过。`local` 拥有本机 WorkItem 生命周期；Handoff 是执行事实；CLI 不拥有状态 |
| ADR 0003 | 通过。Standalone CLI 组装同一核心；不组装 Cordis |

Phase 1 设计后复检：仍通过。`contracts/` 只描述本地 CLI、事件信封与视图 JSON，无网络接口。锁与修复尾部是本机文件操作，不是后台服务。

## Project Structure

### Documentation (this feature)

```text
specs/003-local-ledger-commands/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── event-envelope.v1.md
│   ├── command-error.v1.md
│   └── current-view.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── version.ts          # 保持 0.1.0
├── contracts.ts        # 保持 TaskEnvelope / validate
├── errors.ts           # 错误码、退出码映射、CommandError
├── digest.ts           # RFC 8785 有界规范化 + SHA-256
├── envelope.ts         # 共享事件信封校验
├── storage.ts          # StorageDomain 接口与 JSONL 单写者实现
├── projector.ts        # 回放 → CurrentView
├── work-item.ts        # 打开本机 WorkItem（领域服务，无新产品命令）
├── connect.ts
├── doctor.ts
├── status.ts
├── handoff.ts
├── cli.ts              # 路由 validate + 四命令
└── main.ts

tests/
├── contracts.test.ts   # 保持
├── cli.test.ts         # validate 保持；四命令改为成功/失败合同
├── digest.test.ts
├── envelope.test.ts
├── ledger.test.ts
├── connect.test.ts
├── doctor.test.ts
├── status.test.ts
├── handoff.test.ts
└── replay.test.ts
```

**Structure Decision**: 继续根目录单包、`src/hufu/` 扁平模块。不建 apps/packages，不引入 Cordis 插件树。测试仍由 `tsc` 输出到 `dist/` 后用 `node --test dist/tests/` 运行。`.hufu/` 已忽略，测试必须使用临时目录。

## Complexity Tracking

> 无违规，本表留空。
