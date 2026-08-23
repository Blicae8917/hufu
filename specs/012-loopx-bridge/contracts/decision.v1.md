# Decision 过桥合同 v1

本文件锁死 Decision 侧哪些字段可以进入 Hufu↔LoopX 桥载荷。Canonical 决策正文只完整保存在 Hufu 一次。实现授权见 #58 / ADR 0007；本波仍不交付 Adapter。

本票属于 ADR 0006 第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥。引用 [#50](https://github.com/Blicae8917/hufu/issues/50)（设计史）与 [ADR 0005](../../../docs/adr/0005-zero-copy-decision-transfer.md)。

## 可过桥

| 字段 | 含义 | 禁止夹带 |
| --- | --- | --- |
| `decision_id` | Hufu 已保存的决策身份 | 新的决策正文 |
| `version` | 当前物化版本 | 在 LoopX 侧自增版本 |
| `content_digest` | 与 Hufu 本侧物化结果逐字节一致 | 重算时改写 Packet |
| `outcome_digest` | 可选；`business_outcome` 的不透明摘要 | `business_outcome` 原文 |
| `state_digest` | 可选；权威状态成分的不透明摘要 | `authoritative_state` 叙述或 Issue 正文 |
| `acceptance_digest` | 可选；验收成分的不透明摘要 | `acceptance_metric` 原文 |
| `ExecutionEnvelopeRef` | `{ envelope_id, decision_ref, content_digest }` | `EXECUTION_ENVELOPE` 正文、`ROUTE_ACK` 正文 |

以上合称 `DecisionRef`。信封、ACK、Handoff、Session 换届和 Renderer 已经只传引用；桥必须遵守同一规则。

## 必须留在 Hufu

- 初始 `DECISION_PACKET` 语义正文
- `EXECUTION_ENVELOPE`
- `ROUTE_ACK`（含非空 `added_scope`）
- `FACT_DELTA` / `DECISION_DELTA` / `EFFECT_DELTA` 正文
- `verified_facts[].proposition`、`unknowns`、`non_goals`、`true_stoplines`、`simplest_safe_route`、`recheck_when`

`ROUTE_ACK` 是非审批性 readiness observation，不得过桥为授权或审批状态。

## 必须留在 LoopX

LoopX 自有 Goal / Todo 文本、控制面「决策」或 Journal 条目不得改写或替代 Hufu `DECISION_PACKET`。

## 失败关闭

1. 桥载荷出现 `business_outcome`、`acceptance_metric`、`simplest_safe_route`、`authority_scope_ref` 全文或议题 `body`
2. LoopX 侧重写 `content_digest` 对应的正文
3. 把 `ROUTE_ACK`、Handoff 或 Session 换届包当作新的决策正本
4. 一个 decision stream 被完整保存第二次

对应未来错误码：`BRIDGE_AUTHORITY_REJECTED` 或 `CONTRACT_INVALID`。

## 与 008 的关系

008 TypedResult 必须引用既有 `decision_id` / `envelope_id`，但它本身不是 DecisionRef，也不得经本桥升格为裁决正文。见 [008-non-promotion.v1.md](./008-non-promotion.v1.md)。
