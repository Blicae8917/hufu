# CurrentView v1（决策流扩展）

沿用 `specs/003-local-ledger-commands/contracts/current-view.v1.md` 与 M3 GitHub 差异。`view_schema_version` 仍为 `1`。

无裁决时下列槽必须存在且 `value=null`，`availability=data_insufficient`，不得省略字段、不得用 `0` 填充。

## 新增顶层槽

| 槽 | fact_class | 有裁决且可物化时 |
| --- | --- | --- |
| `decision` | `authoritative`（Hufu 自有决策正文的引用，不是任务正本） | `{ decision_id, version, content_digest }`；**禁止** outcome/acceptance/route 等正文 |
| `execution_envelope` | `observed` | `{ envelope_id, decision_id, version, content_digest, work_item_ids }` 或过期时 availability=`conflict`/`data_insufficient` |
| `route_ack` | `observed` | `{ envelope_id, applicable: boolean, added_scope_count }`；不适用时 `applicable=false` 仍可 `available` |
| `first_durable_effect` | `derived` | `{ status: "applied"\|"confirmed_absent"\|"unavailable"\|"data_insufficient", effect_id?, observed_at? }` |
| `execution_guardrails` | `derived` | 字符串数组，元素只能是：`ack_required`、`scope_change_required`、`semantic_rebase_required`、`stale_envelope`、`data_insufficient`。无护栏时为 `[]` 且 availability=`available` |

## 禁止出现在 CurrentView JSON 中的字段

- Packet 的 `business_outcome`、`acceptance_metric`、`simplest_safe_route`、`verified_facts`、`unknowns`、`non_goals`、`true_stoplines`、`authority_scope_ref` 正文
- 议题 `body`
- `pending` / `approved` / `rejected`
- 工作项 `open/closed/blocked/done` 作为护栏值

## 护栏派生（确定性）

| 护栏 | 当 |
| --- | --- |
| `ack_required` | 存在当前未过期信封，且无适用 ACK |
| `scope_change_required` | 适用 ACK 的 `added_scope` 非空 |
| `stale_envelope` | 信封钉住的版本/摘要与当前物化裁决不符，或授权修订/执行绑定已变 |
| `semantic_rebase_required` | 见规格硬触发；同一 `decision_ref + evidence_frontier_digest` 只消费一次 |
| `data_insufficient` | 求值硬触发时读回覆盖不足 |

`suspected_drift` 若出现，只能作为 `first_durable_effect` 之外的可选提示槽，不得单独写入 `execution_guardrails`。本模块可不实现该提示槽；未实现则不得伪造。
