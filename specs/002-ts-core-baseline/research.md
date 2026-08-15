# Research: 002-ts-core-baseline

## 1. 语言与包管理器

- **Decision**: Node.js `>=22.19.0` + 严格 TypeScript ESM + pnpm。`package.json` 的 `packageManager` 锁定 pnpm 主版本，不写入上游 11.7.0 的精确复刻义务。
- **Rationale**: ADR 0003 已定目标栈；`docs/COMPATIBILITY.md` 记录的 Node 下限是 `^22.19.0 || >=24.0.0`。本模块零 Cordis，只需能在 Windows/POSIX 跑 CLI 与 `node:test`。pnpm 是已接受包管理器，但第一张模块只选最小工具。
- **Alternatives considered**: 继续 Python（违反 #2 退役条款）；Node 20（低于已核对下限）；照搬 Vitest/Oxlint/tsdown/pnpm 11.7.0 整包（ADR 明确禁止）。

## 2. 测试与构建

- **Decision**: `tsc` 编译 `src/` 与 `tests/` 到 `dist/`；用 Node 内置 `node:test` 跑编译后的测试。不引入测试框架或打包器。
- **Rationale**: 足以证明信封校验、退出码和未知命令失败；零额外运行时。符合「最小门禁」。
- **Alternatives considered**: Vitest（额外依赖，本模块无正当成本）；`tsx` 直接跑 TS（多一个运行时依赖）；tsdown 打包（上游单仓工具，本模块不需要分发 bundle）。

## 3. 历史 0.0.1 标签

- **Decision**: 实现开始后、删除 Python 之前，在提交 `638213a`（设计正本合并前、版本仍为 0.0.1 的最后主线提交）打 annotated 标签 `v0.0.1` 并推送到 origin。合并本模块前必须能 `git checkout v0.0.1` 并按该树 README 跑通当时验证。
- **Rationale**: 当前远程没有任何标签，规格 FR-003 无法被满足，除非本模块补打。`638213a` 是 0.0.1 Python 基线的最后状态；其后 `b26d082` 已把版本改成 0.1.0。
- **Alternatives considered**: 标签打在 `97a7237`（缺少随后的公开仓启动文档）；打在当前 0.1.0 文档提交上（标签内容已不是 0.0.1 实现）。

## 4. 最小可运行入口

- **Decision**: 保留 `hufu validate <file>`，行为与 0.0.1 对齐（成功 stdout 为排序后的 JSON 摘要，失败 stderr + 退出码 2）。未知子命令（含 connect/doctor/status/handoff）以非 0 退出，且不创建 `.hufu/`。
- **Rationale**: 规格默认保留唯一可演示能力；四命令不得成功路径。
- **Alternatives considered**: 只打印版本的空壳（过渡期失去公开可演示能力）；本模块实现四命令（超出 #2 范围）。

## 5. 门禁替换

- **Decision**: 当前强制门禁改为：
  1. `pnpm test`（编译 + `node:test`）
  2. `node scripts/check-version.mjs`
  3. `git diff --check`
  同一变更修改 `AGENTS.md`、Constitution「交付流程与质量门禁」、README 快速开始、CONTRIBUTING。
- **Rationale**: 宪法要求工具链迁移在同一已接受模块中同步实现、文档、自动化规则和等价门禁。
- **Alternatives considered**: 先留 Python 门禁再另开 Issue 删除（违反退役条件）；只改 README 不改 Constitution（文档漂移）。

## 6. 信封合同版本

- **Decision**: 继续使用 `schema_version = "0.1"` 与 `source ∈ {native, external}`。不在本模块升级为 `local`/`github`/`gitlab`。
- **Rationale**: 规格 FR-005；正本迁移属于 #3。
- **Alternatives considered**: 本模块顺便改 source 枚举（会把账本合同提前，阻塞独立验收）。
