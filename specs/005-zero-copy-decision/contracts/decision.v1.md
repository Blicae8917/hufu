# 决策记录合同 v1

载荷字段见 [data-model.md](../data-model.md)。本文件锁死校验与物化行为，供失败测试引用。

## 内容摘要

输入对象 = Packet 语义字段，按 RFC 8785 有界子集规范化后 SHA-256。

**计入**：`decision_id`、`version`、`business_outcome`、`authoritative_state`、`acceptance_metric`、`simplest_safe_route`、`verified_facts`、`unknowns`、`non_goals`、`true_stoplines`、`authority_scope_ref`、`evidence_as_of`、`recheck_when`

**不计**：`content_digest`、事件信封字段、`envelope_id`、ACK 字段、Delta 元数据

输出：`sha256:` + 64 位小写十六进制。Windows 与 POSIX 对同一对象必须逐字节相同。

三项成分摘要：分别对 `business_outcome`、`authoritative_state`、`acceptance_metric` 单独走同一算法。

换版物化：以 v1 为底，按 `ledger_seq` 依次把每份 `changed_fields` 浅合并进语义对象（被换版字段整键替换，不删历史事件），再对结果计算新 `content_digest`。

## 单一后继

读取器按序折叠 `DECISION_DELTA`。若出现：

- `expected_version` ≠ 当时当前版本
- `new_version` ≠ `expected_version + 1`
- 同一 `expected_version` 已有不同 `payload_digest` 的后继

则整个决策流 `availability=conflict`，`decide --revise` 拒绝写入 `DECISION_CONFLICT`。

## 信封禁字段

下列键在信封 JSON 根对象或嵌套对象中出现即 `ENVELOPE_INVALID`（不做「只是引用」的猜测）：

`business_outcome`、`authoritative_state`、`acceptance_metric`、`simplest_safe_route`、`verified_facts`、`unknowns`、`non_goals`、`true_stoplines`、`authority_scope_ref`

## 效果读回

| `readback_status` | 允许的 `observed_result` | `durability` |
| --- | --- | --- |
| `complete` | `applied` 或 `confirmed_absent` | `applied` → 可 `durable`；`confirmed_absent` → `unknown` |
| `unavailable` / `data_insufficient` | 省略或非 `applied`/`confirmed_absent` 的说明字符串 | 必须 `unknown` |

禁止：`observed_result` 为数字 `0`；无 `complete` 却 `durability=durable`。

## 语义重基指纹

`fingerprint = sha256(RFC8785({ decision_id, version, evidence_frontier_seq }))`

硬触发条件见规格 FR-018。确认后 `FACT_DELTA` 带同一 `rebase_fingerprint`。同一指纹已存在则 CurrentView 仍报告 `semantic_rebase_required` 但不得再追加第二条确认增量。

## 夹具义务

`tests/fixtures/decision/` 中的合法账本序列，在回放 3 次后必须得到相同的 `decision_id/version/content_digest`、ACK 适用性、`first_durable_effect.status` 与 `execution_guardrails` 集合（数组允许排序后比较）。
