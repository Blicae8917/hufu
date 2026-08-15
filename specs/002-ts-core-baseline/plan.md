# Implementation Plan: 当前工作基线与历史基线退役

**Branch**: `002-ts-core-baseline` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-ts-core-baseline/spec.md`

**Parent Issue**: [#2](https://github.com/Blicae8917/hufu/issues/2)

## Summary

把主线从「Python 信封校验基线 + 尚未实现的目标栈声明」收成一套当前有效入口：严格 TypeScript ESM 领域核心、同一套文档与门禁、保留最小信封校验，并在合并前用标签冻结 0.0.1。四个产品命令必须明确失败。不引入 Cordis、网络、凭据或账本。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`（与已核对的 DeepSeek 工具链下限对齐，但不引入其运行时）、TypeScript 5.x 严格模式、ESM（`module`/`moduleResolution` = `Node16`）

**Primary Dependencies**: 仅 `typescript` 作为开发依赖；零运行时依赖；零 Cordis / LoopX / 测试框架包。包管理器为 pnpm（`packageManager` 字段锁定主版本，不照搬上游 11.7.0 单仓）

**Storage**: 无。本模块不写 `.hufu/`、不写账本、不缓存外部投影

**Testing**: Node.js 内置 `node:test` + `tsc` 编译后执行；先写失败测试再写实现（FR-012）

**Target Platform**: Windows 10+ 与 POSIX；命令行，无守护进程

**Project Type**: 单包 CLI（仓库根目录 `package.json`，发行名 `hufu`）

**Performance Goals**: 本地校验一份样例信封在 2 秒内完成；安装与全量当前验证按规格 15 分钟预算

**Constraints**: 无网络、无凭据、无后台、无遥测；核心不得依赖 Host 插件运行时；版本保持 `0.1.0`；文档/规则/门禁必须同一交付替换

**Scale/Scope**: 约 1 个命令（`validate`）、1 个拒绝未知子命令的入口、替换门禁与退役 Python 树；不交付四命令与 Adapter

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。不引入 `task_authority`、不签发授权、信封仍是 0.0.1 的 `native`/`external` 文档合同 |
| II 正交分离与插件优先 | 通过。领域核心零框架依赖；Cordis 不进入本模块 |
| III 公开核心，研究外置 | 通过。不写入本机路径、内部项目或凭据 |
| IV 真实事件与证据 | 通过。不增加 Ledger；不把缺失写成 `0` |
| V 唯一责任角色 | 不适用（不绑定角色） |
| VI 默认小型、可移植、可逆 | 通过。最小工具集；历史基线用标签可逆 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；先失败测试；进度仍以 #2 为准 |
| VIII 有界且经济 | 通过。不增加编排控制面，不采集效能试点 |
| 版本纪律 | 通过。保持 `0.1.0`，不提升 MAJOR/MINOR |
| 门禁迁移 | 通过。本模块同一变更替换 Python 门禁为等价 Node 命令，并同步 AGENTS / Constitution / README |
| 无网络/凭据/后台 | 通过 |

Phase 1 设计后复检：仍通过。`contracts/` 只描述本地 CLI 与信封 JSON，不引入网络接口。

## Project Structure

### Documentation (this feature)

```text
specs/002-ts-core-baseline/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── task-envelope.v0.1.json
│   └── cli.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
package.json
pnpm-lock.yaml
tsconfig.json
src/hufu/
├── version.ts
├── contracts.ts
├── cli.ts
└── main.ts
scripts/
└── check-version.mjs
tests/
├── contracts.test.ts
└── cli.test.ts
examples/task.json
```

退役（同一交付从主线删除，不删除历史标签中的副本）：

```text
pyproject.toml
src/hufu/*.py
tests/test_*.py
tests/smoke.py
tests/smoke.sh
scripts/check_version.py
scripts/check-version.sh
```

**Structure Decision**: 单包根目录布局。不建 apps/packages 单仓，不引入 Cordis 插件树。测试与源码分目录，由 `tsc` 输出到 `dist/` 后用 `node --test` 运行。

## Complexity Tracking

> 无违规，本表留空。
