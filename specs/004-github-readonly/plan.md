# Implementation Plan: 本仓 GitHub 只读投影

**Branch**: `004-github-readonly` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-github-readonly/spec.md`

**Parent Issue**: [#4](https://github.com/Blicae8917/hufu/issues/4)

## Summary

在 M2 本机账本与四命令之上，为本公开仓增加 `task_authority=github` 只读投影。`connect` 可声明 GitHub 正本（仍写本机冷启动，默认不联网）。`status` 默认读 `.hufu/cache/`；只有 `--refresh` 且正本为 GitHub 时才用 Node 内置 `fetch` 做 GET。投影不写入账本工作项生命周期。适配器无写方法。零新增运行时依赖、零凭据、零 Cordis。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与 M1/M2 相同）

**Primary Dependencies**: 继续仅 `typescript` 开发依赖；零运行时依赖；不引入 Octokit / Cordis。HTTP 只读用 `globalThis.fetch`，测试注入 `GitHubPort`

**Storage**: 沿用 `.hufu/ledger/events.jsonl` 与 `write.lock`。新增可重建缓存 `.hufu/cache/github-projection.json`（派生数据，不是正本）。不把议题状态转换追加为 `hufu/work_item.*`

**Testing**: `tsc` + `node:test`；录制夹具 `tests/fixtures/github/`；禁止门禁打真实网络。先失败测试（FR-018）

**Target Platform**: Windows 10+ 与 POSIX；前台 CLI；无守护进程

**Project Type**: 单包 CLI（根目录 `hufu`）

**Performance Goals**: 夹具刷新与视图折叠在 2 秒内；快速开始 10 分钟（刷新可用替身）

**Constraints**: 仅显式刷新联网；无凭据；无写回；版本 `0.1.0`；核心零框架；`validate` 与 `local` 合同不变

**Scale/Scope**: 本公开仓 `Blicae8917/hufu` 的普通 Issue 只读投影 + 同一套 CurrentView；不交付 GitLab/Web/决策机

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。每个 Project 恰好一个正本；GitHub 拥有议题生命周期；投影只读；Handoff/缓存不扩权；议题正文不进授权 |
| II 正交分离与插件优先 | 通过。GitHub 特定逻辑放在 Adapter 之后；领域核心仍零框架；CLI 仍是 Consumer |
| III 公开核心，研究外置 | 通过。夹具可含脱敏的公开议题元数据，不含凭据、本机路径或议题正文进指令 |
| IV 真实事件与证据 | 通过。投影带来源与 freshness；失败保留旧观测；缺失不写 `0`；不把 GitHub 状态流复制进账本 |
| V 唯一责任角色 | 通过。冷启动仍产生当值 `project_lead`；不把 GitHub assignee 当成 RoleBinding |
| VI 默认小型、可移植、可逆 | 通过。无新依赖、无 daemon、无 token 存储；网络仅命令边界 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #4 为准；先失败测试 |
| VIII 有界且经济 | 通过。无后台刷新；不采集效能试点；范围限本仓 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过（有界例外）。Issue #4 与 SPEC 刷新策略已授权「仅显式刷新」的网络读取；仍禁止凭据与后台 |
| ADR 0001 | 通过。GitHub 保留议题所有权；投影含链接/观测时间/freshness；V1 无写方法 |
| ADR 0003 | 通过。不组装 Cordis |

Phase 1 设计后复检：仍通过。`GitHubPort` 只有 list/get 语义；缓存是派生；写回测试锁死。兼容性文件无需为 GitHub REST 增加上游核对本表（本模块不声明对 GitHub 产品版本的浮动支持，夹具锁死响应形状）。

## Project Structure

### Documentation (this feature)

```text
specs/004-github-readonly/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── command-error.v1.md
│   ├── current-view.v1.md
│   └── github-adapter.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── ...                  # M2 模块保持
├── github-ref.ts        # 解析/校验 github:owner/repo#n 与本仓仓库身份
├── github-port.ts       # GitHubPort 接口（只读）
├── github-http.ts       # fetch GET 实现；无写方法
├── projection-cache.ts  # .hufu/cache/github-projection.json
├── connect.ts           # 允许 github（本仓）
├── status.ts            # --refresh 仅 github
├── work-item.ts         # github 正本下拒绝本机打开
└── projector.ts         # 合并账本 + 投影缓存

tests/
├── github-ref.test.ts
├── github-adapter.test.ts   # 只读断言、失败保留、无写回
├── github-status.test.ts
├── github-connect.test.ts
├── github-handoff.test.ts
└── fixtures/github/         # 录制的公开元数据夹具，不含需保密字段
```

**Structure Decision**: 继续扁平 `src/hufu/`。GitHub 传输与解析放在 Adapter 文件，不进入 `contracts.ts` 信封。测试一律临时目录 + 注入 Port。

## Complexity Tracking

> 无违规。显式刷新联网已由 #4 / SPEC 授权，不是新开的后台服务。
