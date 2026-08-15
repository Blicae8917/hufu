# CurrentView v1（GitHub 正本）

沿用 `specs/003-local-ledger-commands/contracts/current-view.v1.md` 的三轴槽与 `view_schema_version=1`。

差异：

| 槽 | GitHub 正本 |
| --- | --- |
| `task_authority.value` | `github` |
| `task_authority.fact_class` | `authoritative`（Project 声明） |
| `work_items[]` | 来自投影缓存；可空 |
| `work_items` 集合时效 | 按缓存 `observed_at` 与 `stale_after_hours`；无缓存为 `data_insufficient` + `unknown` |
| 条目 `work_item_id` | `external_ref` |
| 条目 `original_url` | 必需 |
| 条目 `native_state` | observed；来源最小状态 |
| 条目 `body` | 禁止出现 |
| Session/Run | 仍为缺失槽，`value=null`，不得用 `0` |

`local` 正本视图合同不变。
