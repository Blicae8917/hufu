# CurrentView v1

`status` 成功时的 `result` 对象。`view_schema_version` 必须为 `1`。

## 顶层

| 字段 | 说明 |
| --- | --- |
| `view_schema_version` | `1` |
| `project` | 带三轴的 Project 摘要 |
| `task_authority` | 带三轴；值必须为 `local` |
| `commander` | 带三轴的指挥官 id |
| `authorization_grant` | 当前修订摘要（id、revision、expires_at、scope_text） |
| `project_lead` | 当值绑定摘要 |
| `work_items` | 数组；可空 |
| `latest_handoff` | 若无则为三轴缺失槽 |
| `session` | 本模块为缺失槽 |
| `run` | 本模块为缺失槽 |
| `ledger` | `{ event_count, ledger_seq_end }` 作为 observed 或 derived |

## 三轴槽

每个重要槽：

| 字段 | 允许值 |
| --- | --- |
| `value` | JSON 值或 `null`（仅当 availability 不是 `available`） |
| `fact_class` | `authoritative` \| `observed` \| `derived` |
| `availability` | `available` \| `unavailable` \| `data_insufficient` \| `conflict` |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` |

规则：

- 本机 Project / WorkItem 身份：`authoritative` + `not_applicable`。
- Handoff：`observed` + `fresh`（刚从本机账本读出）。
- 下一步、角色唯一性结论：`derived`。
- Session/Run 本模块未记录：`availability=unavailable` 或 `data_insufficient`，`value=null`，不得用 `0`。
- 两个当值 `project_lead`：`availability=conflict`。

工作项元素至少包含：`work_item_id`、`objective`、`owner` 槽（无绑定时 `data_insufficient`）、`latest_handoff` 槽。
