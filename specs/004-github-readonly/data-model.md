# Data Model: 004-github-readonly

M2 账本实体仍然有效。本模块新增派生投影，不新增任务生命周期事件类型。

## Project（扩展）

`hufu/project.connected` 的 `task_authority` 允许 `local` | `github`。

当值为 `github` 时：

| 字段 | 约束 |
| --- | --- |
| `repository` | 解析后必须为本公开仓 `Blicae8917/hufu` |
| `stale_after_hours` | 正整数，默认 24；本模块用于投影时效 |

`gitlab` 仍不可写入。已连接 `local` 后再写 `github`（或相反）且载荷不同 → `LEDGER_CAUSALITY_CONFLICT`。

## ExternalRef

字符串，正则合同：`^github:([^/#]+)/([^/#]+)#([1-9][0-9]*)$`

- owner/repo 必须与本仓大小写不敏感匹配
- issue 为正整数，禁止前导零以外的猜测（`#012` 拒绝）
- 禁止 `gitlab:`、禁止缺号、禁止用 URL 冒充 scheme

无法匹配 → 不采用该工作项；若来自 `handoff --work-item` → `CONTRACT_INVALID`

## GitHubIssueProjection

派生对象，不进入账本信封。

| 字段 | 约束 |
| --- | --- |
| `external_ref` | 合法 ExternalRef |
| `original_url` | 非空 HTTPS 议题 URL |
| `title` | 非空短文本（议题标题）；不是正文 |
| `native_state` | 来源最小状态字符串（如 `open`/`closed`），`fact_class=observed` |
| `source_revision` | 可选字符串；无则该槽 `unavailable`，不得写 `0` |
| `observed_at` | UTC ISO-8601；刷新成功时写入 |
| `body` | MUST NOT 出现在此对象或 CurrentView |

## ProjectionCache

文件：`.hufu/cache/github-projection.json`

| 字段 | 约束 |
| --- | --- |
| `cache_schema_version` | `1` |
| `task_authority` | `github` |
| `repository` | 本仓规范 owner/repo |
| `observed_at` | 本次成功刷新时间 |
| `incomplete` | 布尔；列表截断时为 true |
| `items` | `GitHubIssueProjection[]`（已排除 PR） |

未知 `cache_schema_version` 且必需更高 → 读取 fail closed（`SCHEMA_UNSUPPORTED`），不得猜测升级后当新鲜。损坏 JSON → `OBSERVATION_UNAVAILABLE` 或 `LEDGER_CORRUPT` 类冲突，按「缓存不可用」处理，不删除以待操作者。刷新失败 MUST NOT 删除完好旧文件。

## CurrentView 工作项（GitHub 正本）

元素至少：

- `work_item_id`：等于 `external_ref`
- `objective`：标题
- `original_url`
- `native_state` 槽（observed）
- `observed_at` 槽
- `owner` 槽：无 Hufu RoleBinding 时 `data_insufficient`（不把 GitHub assignee 升格为 owner）
- 三轴：工作项集合与条目均为 `observed`；权威任务生命周期仍在 GitHub，Hufu 不报 `authoritative` 的开关状态

## Handoff

沿用 `hufu/handoff.recorded`。`work_item_id` 在 GitHub 正本下必须等于缓存中的 `external_ref`。payload 不得包含议题正文。

## 禁止的事件

本模块 MUST NOT 新增或在 `github` 正本下写入：

- `hufu/work_item.opened`（以及任何议题状态镜像事件）
- 把 GitHub 状态机做成账本全序
