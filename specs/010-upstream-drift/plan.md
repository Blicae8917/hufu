# Implementation Plan: M9 上游漂移核对门禁

**Branch**: `010-upstream-drift` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)
**GitHub Issue**: [#27](https://github.com/Blicae8917/hufu/issues/27)

## Summary

把 `docs/COMPATIBILITY.md` 里记录的上游 HEAD 观测做成只读门禁。#41 将门禁拆成 `static` / `observe` / `release`：普通 CI 只做表完整性；观测报告 `drift` 但不视为不兼容；发布完整性对 tag 移动与不可达 fail closed。不克隆上游当授权、不改文档、不升已接受基线。`observe`/`release` 下 `HUFU_DENY_NETWORK=1` 标「未核对」且不得算通过。版本保持 `0.1.0`。

## Technical Context

**Language/Version**: Node.js `>=22.19.0` ESM（`scripts/check-upstream-drift.mjs`）
**Primary Dependencies**: 无新依赖。子进程调用本机 `git ls-remote`。
**Storage**: 无。只读 `docs/COMPATIBILITY.md`。
**Testing**: node:test；注入 ls-remote；零真实上游网络。
**Target Platform**: GitHub Actions `ubuntu-latest` 与维护者本机。
**Project Type**: 仓库门禁脚本，不是产品命令。
**Performance Goals**: 每个上游一次 ls-remote，预期数秒内结束。
**Constraints**: Constitution IV/VI/VIII；AGENTS.md 网络须有设计决策（本 Issue）；不得写 `0`。
**Scale/Scope**: 两行公开上游（DeepSeek Harness `master`、LoopX `main`）。

## Constitution Check

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本 | 通过。门禁不是授权，也不改 Issue 状态。 |
| II 正交分离 | 通过。不改 Host Loop，不新增 Provider。 |
| III 公开核心 | 通过。只读公开 git ref，不镜像源码。 |
| IV 真实事件与证据 | 通过。观测带来源与时间；缺失为 `unavailable` / `data_insufficient`，不写 `0`。 |
| VI 默认小型可逆 | 通过。单文件脚本，无 daemon。 |
| VII Spec 驱动 | 通过。与风险相称的 Spec/Plan/Tasks；先失败测试。 |
| VIII 有界且经济 | 通过。见下节成本假设。 |
| 无凭据 | 通过。匿名 ls-remote，无 Token。 |
| 版本纪律 | 通过。保持 `0.1.0`。 |

## 成本假设与效能验证（Constitution VIII）

- **预期减少的操作者时间**：每次交付前不必手工 `git ls-remote` 并对照长文；假「提交未变」会在 CI 失败而不是在下一份强制读物里再错一天。
- **成本假设**：每个上游一次匿名 ls-remote，无 API 配额，无 Token；墙钟约数秒。Token 用量不适用，标为不可用而不是 `0`。
- **验证路径**：`tests/upstream-drift.test.ts` 覆盖 match、HEAD 前进、tag 移动、不可达、离线与契约错误；普通 CI 跑 `--mode=static`，观测入口独立。不把 CI 次数写成产品用量。

## Complexity Tracking

无违规。新增网络仅限 CI/显式运行脚本的匿名 `git ls-remote`，由本 Module Issue 授权。`pnpm test` 仍零真实上游网络。

## Project Structure

```text
specs/010-upstream-drift/
├── spec.md
├── plan.md
├── tasks.md
└── contracts/gate.md
scripts/check-upstream-drift.mjs
tests/upstream-drift.test.ts
docs/COMPATIBILITY.md   # 增加门禁核对表，不改已核对基线
.github/workflows/ci.yml
```

## Implementation

1. 先写失败测试。
2. 实现解析与注入式 ls-remote。
3. 在 COMPATIBILITY.md 增加机器可读门禁表（记录当前 HEAD 观测，不是把基线改成 HEAD）。
4. 接入 CI。
