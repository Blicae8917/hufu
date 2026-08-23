# Specification Quality Checklist: Hufu↔LoopX Authority / Decision / Evidence 桥

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- 本仓第一读者是维护者。规格沿用 003 / 005 / 008 的字段名与失败类别写法；未写入具体网络接口或 Adapter API 形状到 spec.md（这些只出现在 plan / contracts，且标明「未来实现才物化」）。
- 三端字段白名单、008 非升格、第 (2) 类归属、以及「#50 设计史 / #58 实现授权 / 本波不交付 Adapter」记在 Assumptions 与 FR，不作为未决澄清。
- 无 [NEEDS CLARIFICATION]。原 #50 设计波只交付合同，#58 已交付引用桥；#68 的 RunOnce Consumer 增量按下列复核项交付。

## #68 RunOnce 增量复核（2026-08-23）

- [x] 固定兼容基线为 LoopX v0.5.2 / `423035f402e2f1703f076c3cfe60c14c5803433f`
- [x] 默认关闭；显式 `BridgeActivationReceipt` 才可激活
- [x] Plan 绑定真实 `ExecutionEnvelopeRef` 与真实 `SessionBindingRef`
- [x] RunOncePort、独立 Validator 与 readback 未齐备时不得 Execute
- [x] Effect readback 与 Receipt 完整前不得允许下一 Turn
- [x] 失败、超时、重复 Turn 与重启恢复不盲重试
- [x] wrapper 只通过 `runtime_locator_ref` 绑定，不在公开仓写本机路径
- [x] 无 LoopX 依赖、无 vendor、无真实 Host、无 Scheduler / while-loop
