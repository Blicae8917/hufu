# Data Model: 012-loopx-bridge

本模块**不**新增账本事件类型，也**不**新增工作项生命周期。下列实体是设计合同对象，供 `contracts/` 与未来实现 PR 引用。字段名复用 003 / 005 / 008。

## ADR 类别

| 字段 | 约束 |
| --- | --- |
| `adr` | 必须为 `0006` |
| `issue` | 必须为 `#50`（设计史） |
| `implementation_issue` | 必须为 `#58` |
| `capability_class` | 必须为 `(2)` |
| `capability_name` | `Hufu↔LoopX Authority / Decision / Evidence 桥` |
| `implementation_authorized` | 必须为 `true`（#58 / ADR 0007；本波仍不交付 Adapter） |
| `loopx_contract_baseline` | `v0.5.2` / `423035f402e2f1703f076c3cfe60c14c5803433f` |

`(1)` 自建 GitLab AuthorityProvider 与 `(3)` 企业 Renderer 不属于本模型。

## 过桥信封（未来实现才物化）

若未来实现追加观测，逻辑形状如下。本 PR 不得写入该事件。

| 逻辑字段 | 约束 |
| --- | --- |
| `bridge_id` | 稳定身份；不是 `task_authority` |
| `project_ref` | 已连接 Project |
| `task_authority` | 必须等于该 Project 已声明正本 |
| `authority` | 见 AuthorityCrossing |
| `decision` | 见 DecisionCrossing |
| `evidence` | 见 EvidenceCrossing |
| `content_digest` | 对上表除自身外的白名单字段计算 |

禁止根对象或嵌套对象出现 StayOnSideSet 中的留守键。出现 → 未来错误码 `BRIDGE_AUTHORITY_REJECTED`、`BRIDGE_LIFECYCLE_REJECTED` 或 `BRIDGE_CONTROL_PLANE_REJECTED`。

## AuthorityCrossing（可过桥）

| 字段 | 约束 |
| --- | --- |
| `task_authority` | 仅 `github` \| `gitlab` \| `local`；只读声明 |
| `task_ref` | `github:<owner>/<repo>#<issue>`、`gitlab:<group>/<project>#<issue>` 或本机 `work_item_id` |
| `source_revision` | 可选；缺失则该子槽 `unavailable`，不得写 `0` |
| `observed_at` | UTC ISO-8601 毫秒，或省略并标 `data_insufficient` |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` |
| `authority_scope_ref` | 仅 `{ grant_id, revision }`；必须指向已有 grant |

`AuthoritySnapshotRef` = `{ task_ref, source_revision, observed_at, freshness }`。它是投影指针，不是 Issue 正文，也不是 Hufu 自有外部议题生命周期。

不透明 `SessionBindingRef` 只携带稳定 binding 身份与 generation，不得夹带 RoleBinding / SessionBinding 授权本体或 Host transcript。

## DecisionCrossing（可过桥）

| 字段 | 约束 |
| --- | --- |
| `decision_id` | 已存在的 Hufu 决策身份 |
| `version` | 当前物化版本 |
| `content_digest` | `sha256:<hex>`，必须等于 Hufu 本侧物化结果 |
| `outcome_digest` | 可选；不透明相等性核对 |
| `state_digest` | 可选；不透明相等性核对 |
| `acceptance_digest` | 可选；不透明相等性核对 |

以上合称 `DecisionRef`。一个 decision stream 仍只完整保存在 Hufu 一次初始 `DECISION_PACKET`。

不透明 `ExecutionEnvelopeRef` 只携带 `{ envelope_id, decision_ref, content_digest }`，不得夹带 `EXECUTION_ENVELOPE` 正文。

## EvidenceCrossing（可过桥）

| 字段 | 约束 |
| --- | --- |
| `evidence_ref` | 稳定身份 |
| `binds_decision_id` | 可选指针 |
| `binds_task_ref` | 可选指针 |
| `binds_effect_id` | 可选指针 |
| `binds_work_item_id` | 可选指针 |
| `fact_class` | `authoritative` \| `observed` \| `derived` |
| `availability` | `available` \| `unavailable` \| `data_insufficient` \| `conflict` |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` |
| `observed_at` | UTC ISO-8601 毫秒；缺失不得写 `0` |

`readback_status` 若作为覆盖观测出现，仅允许 `complete` \| `unavailable` \| `data_insufficient`，且 **不得** 附带可被当成授权或议题完成的 `observed_result`。

`EffectRef` / `ReceiptRef` / `TypedResultRef` 只允许作为稳定身份过桥，不得夹带 Receipt `ok`、TypedResult 正文或 `observed_result`，也不得从这些引用推断授权。

## StayOnSideSet

### 必须留在 Hufu 本侧

- `AuthorizationGrant` 正文：`issuer_id`、`scope.*`、`scope_text`、`expires_at`、`supersedes`
- `RoleBinding` / `SessionBinding` 作为授权或当值出口
- `DECISION_PACKET` 语义正文：`business_outcome`、`authoritative_state` 以外的裁决叙述、`acceptance_metric`、`simplest_safe_route`、`verified_facts[].proposition`、`unknowns`、`non_goals`、`true_stoplines`、`recheck_when`、`evidence_as_of`
- `EXECUTION_ENVELOPE`、`ROUTE_ACK`、`FACT_DELTA`、`DECISION_DELTA`、`EFFECT_DELTA` 正文
- Receipt（`receipt_id` / `ok` / 核验声明）
- Journal / Host Session Log 原文
- TypedResult 正文与 `kind`
- 效果 `observed_result` / `durability`
- CurrentView 派生值：`next_action`、`blocked_by`、`fact_status`、`engine_no_progress`
- 本机 `hufu/work_item.*` 生命周期事件
- 外部 Issue `body`、评论、标签写、状态机转换

### 必须留在 LoopX 本侧

- Goal / Todo / Registry 身份与生命周期
- Quota / Scheduler / Heartbeat / 长任务恢复控制面
- Host 执行循环与 LoopX 自有 Journal
- PM Engine / Wave Engine / 完整 Web 控制面（Hufu 不实现，也不经本桥搬入）

## 禁止映射

MUST NOT：

- 把 `bridge_id`、`engine_id` 或 `loopx` 写入 `task_authority`
- 把 Goal / Todo / Registry 映射为 Hufu WorkItem
- 把 Receipt / Journal / TypedResult / `observed_result` 映射为 `AuthorizationGrant`
- 为桥增加 `open/closed/done` 生命周期
- 让 LoopX 拥有 GitHub / GitLab 原生 Issue 生命周期

## 预留错误码（未来实现 PR）

| 码 | 何时 |
| --- | --- |
| `BRIDGE_NOT_AUTHORIZED` | 在实现授权下达前调用桥 |
| `BRIDGE_AUTHORITY_REJECTED` | 把 Journal / Receipt / 执行结果或 grant 正文当授权 |
| `BRIDGE_LIFECYCLE_REJECTED` | 试图写原生 Issue 生命周期 |
| `BRIDGE_CONTROL_PLANE_REJECTED` | Goal / Todo / Scheduler / Heartbeat / 配额等控制面字段 |
| `BRIDGE_008_PROMOTION_REJECTED` | 把 `loopx-mechanisms` 当作 `task_authority` 或本桥启用令 |
| `DATA_INSUFFICIENT` | 缺失读回、墙钟或用量；不得写成 `0` |

## #68 RunOnce 运行增量

### BridgeActivationReceipt

| 字段 | 约束 |
| --- | --- |
| `receipt_id` | 稳定能力回执身份 |
| `adapter_id` / `adapter_version` | 注入式 RunOncePort 身份 |
| `validator_id` | 必须与 `adapter_id` 不同 |
| `loopx_release` / `loopx_commit` | 固定 `v0.5.2` / `423035f402e2f1703f076c3cfe60c14c5803433f` |
| `capabilities` | `turn_plan` / `run_once` / `readback` / `independent_typed_result_validator` 全为 `true` |
| `runtime_locator_ref` | Provider 自有 wrapper 配置的不透明引用；不是路径正文 |
| `qualification` | 仅 `qualified` |
| `observed_at` | UTC ISO-8601 毫秒 |
| `capability_digest` | 上述规范化声明的摘要 |

### BoundedTurnRequest

包含真实 `ExecutionEnvelopeRef`、真实 `SessionBindingRef`、固定基线、activation receipt ref、
`runtime_locator_ref`、稳定 `turn_key`、`turn_kind=run_once`、`max_invocations=1` 和
`execution_allowed`。缺少执行能力时 `execution_allowed=false`，但 Plan 仍可读。

### RunOnce 完整读回

只有 `readback_status=complete`，并同时存在同一 Turn 的 `TypedResultRef`、`EffectRef`、
独立 Validator 的 `validation_receipt_ref` 与最终 `ReceiptRef`，才可物化
`next_allowed=true`。`not_found` 只允许首次执行；`prepared` / `unavailable` 不允许重试或续 Turn。
