# Implementation Plan: DeepSeek 原生插件与双入口视图对等

**Branch**: `006-deepseek-native-plugin` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-deepseek-native-plugin/spec.md`

**Parent Issue**: [#7](https://github.com/Blicae8917/hufu/issues/7)

## Summary

在已交付的独立 CLI（Standalone Profile）之上，增加 DeepSeek Profile 组合层：可安装的 Bundle 插件、真装真卸、与独立入口对同一事件夹具折叠结构相等的 CurrentView。领域核心保持零 Cordis；`@deepseek-ai/cordis` 只出现在 `packages/hufu-dsh`。不修改 Host Agent Loop，不出站 Runtime，不把 Session 日志当项目正本。版本保持 `0.1.0`。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与 M1–M6 相同）

**Primary Dependencies**:
- 根包 `hufu`：继续仅 `typescript` 开发依赖，**零运行时依赖、零 Cordis**
- `packages/hufu-dsh`：运行时依赖 `@deepseek-ai/cordis@4.0.1`（当前唯一已验证实现）；通过 workspace 依赖根包领域核心
- 不把 DeepSeek Harness 的 Vitest / Oxlint / tsdown / pnpm 11 整包搬进本仓库门禁
- 真装真卸以隔离目录 + 官方 Bundle 契约为准；不把 `dsh` 二进制当作门禁硬依赖（见 research）

**Storage**: 两种入口都经 Hufu StorageDomain 使用工作区 `.hufu/ledger/events.jsonl`。本模块不启用 Host JSON Storage Provider。Host Session 存储不是项目正本。

**Testing**: 根目录 `pnpm test` 仍为 `tsc && node --test`，并运行 `hufu-dsh` 契约测试。夹具 `tests/fixtures/dsh/`。隔离 `DSH_HOME` / 临时 Profile。先失败测试（FR-018）。门禁不写回议题、不改维护者日常 Profile。

**Target Platform**: POSIX 为真装真卸与快速开始的验收环境；Windows 上独立入口合同保持，插件装载测试若无法隔离 Harness 主目录则报告 `UNAVAILABLE`，不得假绿。

**Project Type**: pnpm workspace：根包 CLI + `packages/hufu-dsh` 插件包

**Performance Goals**: 夹具双入口各回放 3 次在 5 秒内；快速开始 20 分钟（SC-001）

**Constraints**: 核心零框架；无 daemon；无出站 Session；无议题写回；版本 `0.1.0`；工具名使用 `hufu.*` 前缀；补丁整块替换、自包含

**Scale/Scope**: 一个隔离 Profile 上的 Hufu 组合；复用既有 `local` / 本仓 `github` 与决策流合同。不交付 GitLab / LoopX / 会商 / Web / 出站 Runtime

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。插件只调用既有 connect/status/decide；Session 日志不是正本；工具不签发授权 |
| II 正交分离与插件优先 | 通过。明确 Service / Provider / Consumer；Cordis 只在 DeepSeek 组合层；不改 Agent Loop |
| III 公开核心，研究外置 | 通过。夹具不含凭据、本机绝对路径、客户数据 |
| IV 真实事件与证据 | 通过。卸载不删账本；缺观测不得写 `0` |
| V 唯一责任角色 | 通过。不改变角色绑定合同；工具传入既有 `--actor` 语义 |
| VI 默认小型、可移植、可逆 | 通过。新增依赖限于插件包的已验证 Cordis；可卸；无 daemon |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #7 为准；先失败测试 |
| VIII 有界且经济 | 通过。无后台；不采集效能试点；Token 不填零 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过。不新增产品网络入口；`status --refresh` 仍仅 GitHub 显式刷新 |
| ADR 0001 | 通过。Host 不是 task_authority |
| ADR 0003 | 通过。核心零 Cordis；测试声明 `@deepseek-ai/cordis`；不声称兼容上游 `cordis` |
| ADR 0005 | 通过。决策夹具对等；不把 Host 缓存当第二份裁决正文 |

Phase 1 设计后复检：仍通过。`packages/hufu-dsh` 是 Profile Module，不是第二套领域核心。CurrentView 规范化比较不升 `view_schema_version`。

## Project Structure

### Documentation (this feature)

```text
specs/006-deepseek-native-plugin/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── plugin-bundle.md
│   ├── tools.md
│   ├── current-view-parity.md
│   └── command-error.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
pnpm-workspace.yaml                 # ".", "packages/hufu-dsh"
packages/hufu-dsh/
├── package.json                    # name: hufu-dsh；dsh.bundle.patch；依赖 workspace:hufu 与 @deepseek-ai/cordis
├── cordis.patch.yml                # 自包含插件行
├── src/
│   ├── plugin.ts                   # Cordis 插件：注入 ctx.hufu、注册工具、可撤销 Effect
│   ├── tools.ts                    # hufu.validate/connect/doctor/status/handoff/decide
│   ├── storage-domain.ts           # 包装既有 JSONL 账本
│   └── runtime-identity.ts         # 导出 CORDIS_IMPLEMENTATION 常量
└── tests/                          # 若与根测试分离；根 tests/dsh/ 亦可

src/hufu/                           # 领域核心与 CLI：禁止 import cordis
tests/dsh/
├── runtime-identity.test.ts
├── mount-tools.test.ts
├── view-parity.test.ts
├── unmount.test.ts
├── missing-observation.test.ts
├── bundle-fail-closed.test.ts
└── agent-loop-boundary.test.ts
tests/fixtures/dsh/                 # 版本化 events.jsonl 与非法 bundle 夹具
```

**Structure Decision**: 根包保持独立 CLI；DeepSeek 组合放入 `packages/hufu-dsh`，避免 Cordis 泄漏进领域核心。插件通过导入 `hufu` 的领域函数，不解析 CLI stdout。

## Complexity Tracking

> 新增 workspace 与 Cordis 依赖是 ADR 0003 已接受的 Profile Module 边界，不是第四套任务系统。不引入 daemon、网页或出站 Runtime。
