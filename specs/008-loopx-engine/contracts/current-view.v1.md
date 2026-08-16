# CurrentView v1（引擎机制扩展）

沿用 `specs/003-local-ledger-commands/contracts/current-view.v1.md`、M3/M6 投影差异与 M4 决策槽。`view_schema_version` 仍为 `1`。

未绑定引擎时下列槽必须存在且 `value=null`，`availability=data_insufficient`，不得省略字段、不得用 `0` 填充。未绑定对照下，M4 决策槽与护栏集合必须与 #6 夹具一致。

## 新增顶层槽

| 槽 | fact_class | 已绑定且可物化时 |
| --- | --- | --- |
| `engine` | `observed` | `{ engine_id: "loopx-mechanisms" }`；**禁止**把该槽写成 `task_authority` |
| `typed_result` | `observed` | `{ result_id, kind, turn_ref, envelope_id }`；尚无结果时 data_insufficient |
| `receipt` | `observed` | `{ receipt_id, ok }` 加所指向的 `result_id` 或 `effect_id`；尚无回执时 data_insufficient |

`task_authority.value` 仍为 `local` | `github` | `gitlab`。

## 护栏增补

`execution_guardrails` 允许的元素在 M4 五类之外增加：

| 护栏 | 当 |
| --- | --- |
| `engine_no_progress` | 见 data-model「无进展物化」；未绑定引擎时 **不得** 出现 |

出现 `engine_no_progress` 时，`handoff.next_action_text` 不得给出沿旧信封的新前向步骤。`semantic_rebase_required` 的硬触发条件保持 #6，不因本模块放宽或收紧。

## 禁止出现在 CurrentView JSON 中的字段

- 上游 `goal_id` / `todo_id` / Registry 条目作为 `work_item_id`
- Packet 正文字段、议题 `body`
- `pending` / `approved` / `rejected`
- 把 `engine` 显示为任务正本
- 缺失墙钟、用量或读回写成 `0`
