# Data Model: 008-loopx-engine

M2 账本、M3/M6 投影、M4 决策事件仍然有效。本模块只追加执行机制事件，不新增工作项生命周期类型，不把上游 Goal/Todo 镜像进账本。

## 新增事件类型

| `event_type` | payload 要点 | 幂等键 |
| --- | --- | --- |
| `hufu/engine.bound` | 见 EngineBinding | `hufu/engine.bound:<engine_id>` |
| `hufu/engine.typed_result` | 见 TypedResult | `hufu/engine.typed_result:<result_id>` |
| `hufu/engine.receipt` | 见 Receipt | `hufu/engine.receipt:<receipt_id>` |

同键同摘要幂等；同键不同摘要 → `LEDGER_DIGEST_CONFLICT`。`event_schema_version` 仍为 `1`。

未绑定引擎时不得追加后两类事件 → `ENGINE_NOT_BOUND`。

## EngineBinding

| 字段 | 约束 |
| --- | --- |
| `engine_id` | 必须为 `loopx-mechanisms` |
| `bound_at` | 系统写入 UTC ISO-8601 毫秒 |

禁止出现：`task_authority`、`goal_id`、`todo_id`、`registry`、`scheduler`、`heartbeat`、`quota`、`endpoint`、凭据字段。出现 → `ENGINE_CONTROL_PLANE_REJECTED` 或 `ENGINE_AUTHORITY_REJECTED`（Goal/Todo/Registry 当正本时用后者）。

每个已连接 Project 至多一个当前引擎绑定。相同 `engine_id` 重提幂等。不同 `engine_id` → `LEDGER_CAUSALITY_CONFLICT`。

绑定**不**改变 `hufu/project.connected` 的 `task_authority`。

## TypedResult

| 字段 | 约束 |
| --- | --- |
| `result_id` | 非空；可省略由系统生成小写 UUID |
| `decision_id` | 必须存在且为当前活跃决策 |
| `envelope_id` | 必须为当前适用信封 |
| `turn_ref` | 非空字符串；Hufu 自有回合身份，禁止 `gitlab:`/`github:` 工作项 scheme，禁止看起来像上游 `goal-*` 工作项映射 |
| `kind` | 仅 `progress` \| `failure` \| `readback_required` \| `stop` \| `data_insufficient` |
| `observed_at` | UTC ISO-8601 毫秒 |
| `content_digest` | 系统写入；调用方若提供必须与计算一致 |

`content_digest` 覆盖上表除自身外的全部字段（RFC 8785 有界子集 + SHA-256，格式 `sha256:<hex>`）。

禁止根对象或嵌套对象出现：`goal_id`、`todo_id`、`registry`、`scheduler_hint`、`quota`、`heartbeat`、`next_cli_actions`、`business_outcome`、议题 `body`。出现 → `ENGINE_CONTROL_PLANE_REJECTED` 或 `ENGINE_AUTHORITY_REJECTED` / `CONTRACT_INVALID`。

`--actor` 必须是当前信封指定的当值 `owner` 或 `mission_lead`，否则 `ROLE_NOT_ACTIVE`。无当前信封 → `DATA_INSUFFICIENT`。

## Receipt

| 字段 | 约束 |
| --- | --- |
| `receipt_id` | 非空；可省略生成 |
| `result_id` | 与 `effect_id` 恰好一个存在 |
| `effect_id` | 与 `result_id` 恰好一个存在；若出现必须已有对应 `EFFECT_DELTA` |
| `ok` | 布尔；核验是否通过 |
| `evidence_ref` | 非空字符串 |
| `content_digest` | 系统写入 |

禁止：`grant_id`、`authorization_scope`、`authority_scope_ref`、`business_outcome`、`acceptance_metric`、工作项完成/关闭字段、`observed_result`、`durability`。出现 → `RECEIPT_INVALID`。

Receipt **不得**把 `first_durable_effect` 改为 `applied`。耐久效果仍只由 #6 `EFFECT_DELTA` 在 `readback_status=complete` 时产生。

`--actor` 规则与 TypedResult 相同。

## 与 EFFECT_DELTA 的关系

读回、`observed_result`、`durability` 继续只存在于 `hufu/decision.effect_delta`。本模块：

- 不新增效果事件类型
- `kind=progress` 不构成已发生效果
- 无 `complete` 读回时，CurrentView 不得因 Receipt `ok=true` 或 TypedResult `progress` 而把效果写成已发生、确认不存在或 `0`
- 请求沿旧信封新前向动作时，若无完整读回且 `first_durable_effect` 不是 `applied`，护栏可含 `data_insufficient`；`--effect` 仍拒绝无读回的 `applied`

## CurrentView 槽（扩展）

未绑定引擎时下列槽必须存在：`value=null`，`availability=data_insufficient`。

| 槽 | fact_class | 已绑定且可物化时 |
| --- | --- | --- |
| `engine` | `observed` | `{ engine_id: "loopx-mechanisms" }` |
| `typed_result` | `observed` | `{ result_id, kind, turn_ref, envelope_id }`；无结果则为 data_insufficient |
| `receipt` | `observed` | `{ receipt_id, ok, result_id? , effect_id? }`；无回执则为 data_insufficient |

`task_authority` 保持连接声明。`execution_guardrails` 可增加 `engine_no_progress`（见 contracts/current-view.v1.md）。

## 无进展物化

当同时满足：

1. 存在 EngineBinding `loopx-mechanisms`
2. 存在当前未过期信封
3. `first_durable_effect.status` 为 `confirmed_absent`
4. 已有至少一条 TypedResult，且按 `ledger_seq` 的最后一条 `kind` ≠ `progress`

则派生 `engine_no_progress`。缺少 TypedResult 时不因「没看到进展」而派生该护栏（避免把缺失写成零效果）。

## 禁止的事件与映射

MUST NOT：

- 新增 `hufu/work_item.*` 来自 Goal/Todo/Registry
- 把 `engine_id` 写入 `task_authority`
- 为引擎增加 `open/closed/done` 生命周期
- 把 Receipt 写成 AuthorizationGrant
