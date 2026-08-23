# Implementation Plan: 端到端试点验收（大纲）

**Branch**: `015-e2e-pilot` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Parent Issue**: [#60](https://github.com/Blicae8917/hufu/issues/60)

**本 Plan 的实现范围（本波）**: 仅大纲。不写夹具运行时。

## Summary

锁定公开安全夹具形状、必须覆盖的故障场景，以及「真实环境试点未授权生产写」。不创建 Goal/Todo/PM/Wave Engine。

## Technical Context

本波无新依赖、无网络、无夹具代码。测试仅为 `tests/015-e2e-pilot-spec.test.ts`。

## Constitution Check

| 原则 | 结论 |
| --- | --- |
| I | 通过。GitLab 仍是唯一议题权威 |
| III | 通过。仅示例主机 |
| IV / VIII | 通过。缺失不写 `0`；有界试点 |
| VII | 通过。夹具测试可延后到 #57–#59 有代码 |
| ADR 0007 | 通过。本票是 (d) |

不得引入 Goal / Todo 引擎。
