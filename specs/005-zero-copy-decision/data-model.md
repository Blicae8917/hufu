# Data Model: 005-zero-copy-decision

M2/M3 实体仍然有效。本模块只追加执行协调事件，不新增工作项生命周期类型，不把 GitHub 状态镜像进账本。

## 新增事件类型

| `event_type` | payload 要点 | 幂等键 |
| --- | --- | --- |
| `hufu/decision.packet_recorded` | 见 DECISION_PACKET；`version` 必须为 `1` | `hufu/decision.packet_recorded:<decision_id>:1` |
| `hufu/decision.envelope_attached` | 见 EXECUTION_ENVELOPE | `hufu/decision.envelope_attached:<envelope_id>` |
| `hufu/decision.route_acked` | 见 ROUTE_ACK | `hufu/decision.route_acked:<envelope_id>` |
| `hufu/decision.fact_delta` | 见 FACT_DELTA；含稳定 `delta_id` | `hufu/decision.fact_delta:<delta_id>` |
| `hufu/decision.decision_delta` | 见 DECISION_DELTA | `hufu/decision.decision_delta:<decision_id>:<new_version>` |
| `hufu/decision.effect_delta` | 见 EFFECT_DELTA | `hufu/decision.effect_delta:<effect_id>:<observation_id>` |

同键同摘要幂等；同键不同摘要 → `LEDGER_DIGEST_CONFLICT`。版本跳跃或双后继 → `DECISION_CONFLICT`（退出码 3）。

## DECISION_PACKET

| 字段 | 约束 |
| --- | --- |
| `decision_id` | 非空；调用方可给，省略则系统生成小写 UUID |
| `version` | 必须为 `1` |
| `business_outcome` | 非空字符串 |
| `authoritative_state` | `AuthoritySnapshotRef` |
| `acceptance_metric` | 非空字符串 |
| `simplest_safe_route` | 非空字符串 |
| `verified_facts` | 对象数组，元素为 `{ proposition, evidence_ref }`，可空 |
| `unknowns` | 字符串数组，可空 |
| `non_goals` | 字符串数组，可空 |
| `true_stoplines` | 字符串数组，可空 |
| `authority_scope_ref` | `{ grant_id, revision }`，必须等于当前授权 |
| `evidence_as_of` | UTC ISO-8601 毫秒 |
| `recheck_when` | 见下表 |
| `content_digest` | 系统写入；调用方若提供必须与计算结果相同 |

`content_digest` 覆盖上表除自身外的全部字段。

### AuthoritySnapshotRef

| 字段 | 约束 |
| --- | --- |
| `task_ref` | 本机 `work_item_id` 或合法 `github:Blicae8917/hufu#n` |
| `source_revision` | 可选字符串；缺失则该子槽不可用，不得写 `0` |
| `observed_at` | UTC ISO-8601 毫秒 |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` |

`local`：`task_ref` 必须已有 `hufu/work_item.opened`。`github`：必须已在投影缓存中。

### recheck_when

| `type` | 附加字段 |
| --- | --- |
| `wall_clock` | `at_or_after`（UTC ISO-8601 毫秒） |
| `evidence_frontier` | `min_evidence_seq`（正整数） |
| `provider_revision` | `source_revision`（非空字符串） |
| `implementation_activity` | 无附加；求值时看是否存在更新的实现活动证据 |

每种裁决恰好一个 `type`。未知 `type` → `CONTRACT_INVALID`。

## EXECUTION_ENVELOPE

| 字段 | 约束 |
| --- | --- |
| `envelope_id` | 非空；可省略由系统生成 |
| `decision_id` / `version` / `content_digest` | 必须匹配当前物化版本 |
| `issuer_binding_id` | 当值 `project_lead` 或 `mission_lead` |
| `executor_principal_id` | 非空；单工作项时成为 `owner` |
| `work_item_ids` | 非空字符串数组；单元素走 `project_lead`，长度 ≥2 走 `mission_lead` |
| `route_step_refs` | 字符串数组，可空 |
| `input_refs` | 字符串数组，可空 |
| `handoff_refs` | 字符串数组，可空 |
| `budget_ref` | 可选字符串 |
| `deadline` | 可选 UTC ISO-8601 |
| `supersedes_envelope_ref` | 可选 `envelope_id` |

禁止出现：`business_outcome`、`authoritative_state`、`acceptance_metric`、`simplest_safe_route`、`verified_facts`、`unknowns`、`non_goals`、`true_stoplines`、`authority_scope_ref`。出现 → `ENVELOPE_INVALID`。

`work_item_ids` 必须包含 Packet 的 `task_ref`。多工作项时每个 id 必须可解析为已存在工作项（本机或缓存）。范围只能是当前授权 `scope_text` 的字面子集（与 M2 下一步检查同一规则）；超出 → `GRANT_SCOPE_EXCEEDED`。

## ROUTE_ACK

| 字段 | 约束 |
| --- | --- |
| `envelope_id` | 必须存在且当前适用 |
| `decision_id` / `version` / `content_digest` | 必须匹配信封所钉版本 |
| `outcome_digest` / `state_digest` / `acceptance_digest` | 必须分别等于当前三项成分摘要 |
| `acknowledger_principal_id` | 必须等于信封 `executor_principal_id` |
| `session_binding_ref` | 可选；本模块允许省略，槽标 `data_insufficient` |
| `facts_checked_as_of` | UTC ISO-8601 毫秒 |
| `added_scope` | 数组，默认 `[]` |

`added_scope` 元素：

| 字段 | 约束 |
| --- | --- |
| `required_because` | 仅 `data_safety` \| `actual_permission_gap` \| `irreversible_action` \| `effect_readback_unavailable` |
| `evidence_ref` | 非空 |
| `requested_scope` | 非空 |

非法原因或三项摘要不匹配 → `ACK_INVALID`。非空 `added_scope` **仍成功写入**（退出码 0）；CurrentView 派生 `scope_change_required`。不得因此追加授权。

## FACT_DELTA

| 字段 | 约束 |
| --- | --- |
| `delta_id` | 非空；可省略生成 |
| `decision_id` | 必须存在 |
| `base_version` | 必须等于当前业务版本（不升版本） |
| `ops` | 非空；`op`=`add`\|`supersede`\|`withdraw`，带 `fact_ref` |
| `evidence_frontier` | `{ seq: 正整数 }` |
| `rebase_fingerprint` | 可选；确认重基时写入 `decision_ref + evidence_frontier_digest` |

不得改写 Packet 中已钉住的 `verified_facts` / `unknowns` 原文。

## DECISION_DELTA

| 字段 | 约束 |
| --- | --- |
| `decision_id` | 必须存在 |
| `expected_version` | 必须等于当前版本 |
| `new_version` | 必须等于 `expected_version + 1` |
| `supersedes` | `{ decision_id, version, content_digest }` 匹配当前 |
| `changed_fields` | 对象；只含 Packet 语义字段的子集；禁止空对象 |
| `based_on_fact_delta_refs` | 字符串数组，可空 |
| `preserve_effects` | `{ effect_id, readback_status }[]`；`readback_status` 不得在无读回时为 `applied` |
| `discarded_assumptions` | 字符串数组，可空 |
| `content_digest` | 对物化后完整语义字段计算 |

同一 `expected_version` 只允许一个后继。

## EFFECT_DELTA

| 字段 | 约束 |
| --- | --- |
| `effect_id` | 稳定非空 |
| `observation_id` | 非空；可省略生成 |
| `envelope_id` | 必须存在 |
| `decision_id` / `version` | 引用信封所钉版本（历史效果在换版后仍保留） |
| `readback_status` | `complete` \| `unavailable` \| `data_insufficient` |
| `observed_result` | 仅当 `readback_status=complete` 时允许 `applied` 或 `confirmed_absent`；否则禁止这两值，也禁止数字 `0` 冒充 |
| `durability` | `durable` 仅当 `observed_result=applied`；否则 `unknown` |
| `observed_at` | `complete` 时必填 UTC ISO-8601；否则省略，不得写 `0` |
| `evidence_refs` | 字符串数组，可空 |
| `implementation_activity` | 可选布尔；为 true 表示这是实现活动证据前沿的一次增长观测 |

## RoleBinding 扩展

| `role` | `scope_kind` | `scope_id` |
| --- | --- | --- |
| `owner` | `work_item` | 工作项 id |
| `mission_lead` | `mission` | `envelope_id` |

当值唯一性仍由回放检测：同一 scope 两个未取代绑定时 `availability=conflict`。信封追加建立绑定时可带 `supersedes`。

## 物化规则

- 当前 Packet 语义 = v1 载荷 + 按 `ledger_seq` 折叠的 `DECISION_DELTA.changed_fields`。
- 当前信封 = 该 `decision_id` 最后一条未被取代、且 `content_digest` 仍匹配当前版本的信封；否则护栏 `stale_envelope`。
- 当前 ACK = 该信封最后一条路线确认；决策版本/信封/执行者/授权修订/三项摘要任一变化则「保留但不再适用」。
- `first_durable_effect`：存在 `readback_status=complete` 且 `observed_result=applied` 且 `durability=durable` 的效果观测时，取最早一条的 `{ effect_id, observed_at }`；覆盖充分且全部 complete 观测为 `confirmed_absent` 时值为 `confirmed_absent`；否则 `unavailable` 或 `data_insufficient`。
- 活跃工作项集合：当前信封的 `work_item_ids`，若尚无信封则为 Packet `task_ref`。

## 禁止

- 重写已追加的 Packet 或 Delta 原文
- 在决策事件 payload 中存放议题 `body`
- 把护栏或 ACK 写成授权事件
- 为决策流增加 `open/closed/done` 生命周期字段
