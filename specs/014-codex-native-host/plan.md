# Implementation Plan: Codex NativeHost RuntimeProvider + SessionBinding

**Branch**: `014-codex-native-host` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Parent Issue**: [#59](https://github.com/Blicae8917/hufu/issues/59)

**本 Plan 的实现范围（本波）**: 无 Runtime。只固定接口、Binding 字段与失败关闭。

## Summary

按 ADR 0007 (c)，锁定 Codex NativeHost 的最小接口、Consumer 映射、SessionBinding 唯一性与 Provider 不等价。本波不调用宿主 thread。

## Technical Context

**Language/Version**: 与仓库 TypeScript 基线相同。本波不新增编译单元。

**Primary Dependencies**: 零新增。不引入 Codex SDK，不引入 `loopx`。

**Testing**: 本波 `tests/014-codex-native-host-spec.test.ts` 必须通过。失败 Runtime 测试见 `tasks.md`。

**Constraints**: 版本 `0.1.0`；无静默回退；无原始 transcript。

## Constitution Check

| 原则 | 结论 |
| --- | --- |
| I 授权 | 通过。Binding 引用既有 `authority_ref`，不从 transcript 推断授权 |
| II 插件优先 | 通过。RuntimeProvider 在 Adapter 之后；不改 Host Agent Loop |
| III 公开安全 | 通过。无真实 Session ID / 本机路径 |
| IV 证据 | 通过。无 readback 不得声称投递 |
| V 换届 | 通过。`supersedes` + Handoff |
| VI 可逆 | 通过。本波无后台服务 |
| VII Spec | 通过。实现失败测试留给 #59 |
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

未来实现才可增加 `src/hufu/codex-native-host.ts`。独立 CLI 缺失宿主工具时必须失败关闭。
