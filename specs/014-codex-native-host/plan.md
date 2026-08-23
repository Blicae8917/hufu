# Implementation Plan: Codex NativeHost RuntimeProvider + SessionBinding

**Branch**: `codex/issue-67-codex-app-consumer-v2` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Parent Issues**: [#59](https://github.com/Blicae8917/hufu/issues/59)、[#67](https://github.com/Blicae8917/hufu/issues/67)

**本 Plan 的实现范围**: 在 #59 packet-only Provider 旁增加 #67 Codex App Consumer v2；不调用真实 Host。

## Summary

按 ADR 0007 (c)，保留 Codex NativeHost 最小接口与 Provider 不等价，在同一模块增加两阶段耐久
Consumer。Host工具调用由外部 Consumer 在 prepare与complete之间完成；Hufu只拥有 packet、binding、
receipt和readback事实。

## Technical Context

**Language/Version**: 与仓库 TypeScript 基线相同。

**Primary Dependencies**: 零新增。不引入 Codex SDK，不引入 `loopx`。

**Testing**: `tests/codex-native-host-consumer-v2.test.ts` 严格 RED→GREEN；同时回归 #59 与 #60。

**Constraints**: 版本 `0.1.0`；无静默回退；无原始 transcript。

## Constitution Check

| 原则 | 结论 |
| --- | --- |
| I 授权 | 通过。Binding 引用既有 `authority_ref`，不从 transcript 推断授权 |
| II 插件优先 | 通过。RuntimeProvider 在 Adapter 之后；不改 Host Agent Loop |
| III 公开安全 | 通过。无真实 Session ID / 本机路径 |
| IV 证据 | 通过。无 readback 不得声称投递 |
| V 换届 | 通过。`supersedes` + Handoff |
| VI 可逆 | 通过。无后台服务；prepared action 可从 Ledger恢复 |
| VII Spec | 通过。#67 每个行为切片先写失败测试 |
| VIII 有界 | 通过。一次调用一次有界 wait，无无限循环 |
| ADR 0007 | 通过。本票是 (c) |

## Project Structure

```text
specs/014-codex-native-host/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
└── checklists/requirements.md
```

实现继续位于 `src/hufu/codex-native-host.ts`；不新增 CLI入口。独立 CLI缺失宿主工具时仍失败关闭。
