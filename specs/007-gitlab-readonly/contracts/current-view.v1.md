# CurrentView v1（GitLab 正本）

沿用 `specs/003-local-ledger-commands/contracts/current-view.v1.md` 的三轴槽与 `view_schema_version=1`。GitHub 正本差异见 004。

GitLab 正本差异：

| 槽 | GitLab 正本 |
| --- | --- |
| `task_authority.value` | `gitlab` |
| `task_authority.fact_class` | `authoritative`（Project 声明） |
| `work_items[]` | 来自 GitLab 投影缓存；可空 |
| `work_items` 集合时效 | 按 GitLab 缓存 `observed_at` 与 `stale_after_hours`；无缓存为 `data_insufficient` + `unknown` |
| 条目 `work_item_id` | `gitlab:group/project#n` |
| 条目 `original_url` | 必需 |
| 条目 `native_state` | observed；来源最小状态 |
| 条目 `body` / `description` | 禁止出现 |
| Session/Run | 仍为缺失槽，`value=null`，不得用 `0` |
| 决策槽 | 沿用 M4：只暴露身份、版本与 digest |

`local` 与本仓 `github` 正本视图合同不变。
