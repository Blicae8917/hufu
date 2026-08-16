# Data Model: 007-gitlab-readonly

M2 账本实体、M3 GitHub 投影与 M4 决策引用仍然有效。本模块新增 GitLab 派生投影，不新增任务生命周期事件类型。

## Project（扩展）

`hufu/project.connected` 的 `task_authority` 允许 `local` | `github` | `gitlab`。

当值为 `gitlab` 时：

| 字段 | 约束 |
| --- | --- |
| `repository` | 解析后必须为恰好两段 `group/project`；字面大小写保留 |
| `stale_after_hours` | 正整数，默认 24；本模块用于投影时效 |

已连接后再写不同正本或不同身份 → `LEDGER_CAUSALITY_CONFLICT`。相同 GitLab 身份重提幂等。

## ExternalRef（GitLab）

字符串，正则合同：`^gitlab:([^/#]+)/([^/#]+)#([1-9][0-9]*)$`

- group 与 project 各恰好一段，禁止额外 `/`
- 必须与已连接身份大小写敏感相等
- issue 为项目内 IID，正整数，禁止前导零（`#012` 拒绝）
- 禁止 `github:`、禁止缺号、禁止用 URL 冒充 scheme

无法匹配 → 不采用该工作项；若来自 `handoff --work-item` 或 `decide` 的 `task_ref` → `EXTERNAL_REF_INVALID` 或 `DATA_INSUFFICIENT`（不在缓存时为后者）

GitHub 的 `parseExternalRef` 继续拒绝 `gitlab:`。两种 parser 不得互相收纳对方 scheme。

## GitLabIssueProjection

派生对象，不进入账本信封。

| 字段 | 约束 |
| --- | --- |
| `external_ref` | 合法 GitLab ExternalRef |
| `original_url` | 非空 HTTPS 议题 URL |
| `title` | 非空短文本（议题标题）；不是正文 |
| `native_state` | 来源最小状态字符串（如 `opened`/`closed`），`fact_class=observed` |
| `source_revision` | 可选字符串；无则该槽 `unavailable`，不得写 `0` |
| `observed_at` | UTC ISO-8601；刷新成功时写入 |
| `description` / `body` | MUST NOT 出现在此对象或 CurrentView |

## ProjectionCache（GitLab）

文件：`.hufu/cache/gitlab-projection.json`

| 字段 | 约束 |
| --- | --- |
| `cache_schema_version` | `1` |
| `task_authority` | `gitlab` |
| `repository` | 已连接规范 `group/project` |
| `observed_at` | 本次成功刷新时间 |
| `incomplete` | 布尔；列表截断时为 true |
| `items` | `GitLabIssueProjection[]`（已排除 MR） |

未知 `cache_schema_version` 且必需更高 → 读取 fail closed（`SCHEMA_UNSUPPORTED`）。损坏 JSON 按缓存不可用处理，不删除以待操作者。刷新失败 MUST NOT 删除完好旧文件。不得把 GitHub 缓存文件当作 GitLab 工作项来源。

## CurrentView 工作项（GitLab 正本）

元素至少：

- `work_item_id`：等于 `external_ref`
- `objective`：标题
- `original_url`
- `native_state` 槽（observed）
- `observed_at` 槽
- `owner` 槽：无 Hufu RoleBinding 时 `data_insufficient`（不把 GitLab assignee 升格为 owner）
- 三轴：工作项集合与条目均为 `observed`；权威任务生命周期仍在 GitLab，Hufu 不报 `authoritative` 的开关状态

## Handoff 与 DecisionRef

沿用 `hufu/handoff.recorded` 与 M4 决策事件。GitLab 正本下 `work_item_id` / `task_ref` 必须等于 GitLab 缓存中的 `external_ref`。payload 不得包含议题正文。不得改写 GitLab 议题。

## 禁止的事件

本模块 MUST NOT 新增或在 `gitlab` 正本下写入：

- `hufu/work_item.opened`（以及任何议题状态镜像事件）
- 把 GitLab 状态机做成账本全序
