# Data Model: 003-local-ledger-commands

持久实体全部以只追加事件存在于 `.hufu/ledger/events.jsonl`。CurrentView 是回放结果，不是另一份正本。

项目根是 CLI 输入，不是新的持久实体。`#40` 只改变如何选定工作区根；账本仍写在该根下的 `.hufu/ledger/events.jsonl`。`project_root` 不得写入事件 payload。

## EventEnvelope

每条事件的共享外壳。`event_schema_version` 按 **事件类型** 独立计；信封本身的字段合同版本为 `1`。

| 字段 | 约束 |
| --- | --- |
| `event_id` | 非空，小写 UUID |
| `event_type` | 非空，本模块允许值见下表 |
| `event_schema_version` | 正整数，本模块写入 `1` |
| `ledger_seq` | 账本范围内从 `1` 起的连续正整数；全序唯一依据 |
| `occurred_at` | UTC ISO-8601 字符串（毫秒），只记录观测时间，不参与排序 |
| `actor_binding_ref` | 非空字符串。冷启动引导事件可指向同一次引导中的指挥官身份 id；其后必须指向已存在绑定或身份 |
| `caused_by` | 可选；若出现则为已存在 `event_id` |
| `idempotency_key` | 非空；由该事件类型 Schema 从提交内容确定性派生 |
| `payload_digest` | `sha256:` + 64 位小写十六进制；对 **payload** 按 digest spec v1 计算 |
| `digest_spec_version` | 必须为 `"1"` |
| `writer_id` | 非空；诊断用，不参与全序 |
| `payload` | 该 `event_type` 的对象；不得包含信封字段 |

### 本模块事件类型

| `event_type` | payload 要点 |
| --- | --- |
| `hufu/project.connected` | `project_id`、`repository`、`task_authority=local`、`stale_after_hours=24` |
| `hufu/commander.declared` | `commander_id`（非空） |
| `hufu/authorization_grant.issued` | 见 AuthorizationGrant |
| `hufu/role_binding.established` | `binding_id`、`role`、`scope_kind`、`scope_id`、`principal_id`、可选 `supersedes` |
| `hufu/work_item.opened` | `work_item_id`、`objective`、`terminal_conditions`（非空字符串列表） |
| `hufu/handoff.recorded` | `handoff_id`、`work_item_id`、`completed`、`remaining`、可选 `risks`、`next_review`、`grant_id`、`grant_revision` |
| `hufu/ledger.repair.truncated_tail` | `removed_bytes`、`repaired_at`；`caused_by` 可空 |

未知 `event_type` 或 `event_schema_version > 1` 且标记为必需：读取 fail closed（`SCHEMA_UNSUPPORTED`）。

### 幂等

相同 `idempotency_key` + 相同 `payload_digest`：返回已存在事件，不追加。相同键不同摘要：`LEDGER_DIGEST_CONFLICT`。`ledger_seq` 间隙或不连续：`LEDGER_CAUSALITY_CONFLICT`。

## Project

由 `hufu/project.connected` 物化。每个账本恰好一个 Project。

| 字段 | 约束 |
| --- | --- |
| `project_id` | 非空 |
| `repository` | 非空（调用方提供的身份字符串，不校验网络可达） |
| `task_authority` | 本模块只允许 `local` |
| `stale_after_hours` | 正整数，默认 24 |

重复连接且载荷不同：`LEDGER_CAUSALITY_CONFLICT` 或合同冲突（退出码 3）。

## CommanderIdentity

由 `hufu/commander.declared` 物化。不是 RoleBinding，不要求 SessionBinding。

## AuthorizationGrant

由 `hufu/authorization_grant.issued` 物化。唯一可被范围引用的授权本体。

| 字段 | 约束 |
| --- | --- |
| `grant_id` | 稳定身份，冷启动首次签发即确定 |
| `revision` | 从 `1` 起的正整数 |
| `issuer_id` | 必须等于已声明 `commander_id` |
| `scope.repository` | 字符串，允许空语义时仍必须出现（可为空串以外：本模块要求非空文本或显式 `"*"`） |
| `scope.path_glob` | 字符串字段必须存在；本模块允许自由文本 |
| `scope.command_classes` | 字符串字段必须存在；本模块允许自由文本 |
| `scope_text` | `connect --grant-scope` 原文，供字面包含检查 |
| `expires_at` | 可选 ISO-8601；缺省表示无终止 |
| `supersedes` | 可选 `{grant_id, revision}` |

收回或修改：追加更高 `revision` 且 `supersedes` 指向前一修订。CurrentView 只把最高修订当当前授权。

**下一步越权检查（本模块）**：把下一步文本与 `scope_text` 做大小写敏感的字面包含判定：若调用方另传受限动作短语且该短语不出现在 `scope_text` 中，则 `GRANT_SCOPE_EXCEEDED`。默认下一步模板只引用工作项 id 与「在已记录授权范围内继续」，不引入授权中未出现的动作短语。

## RoleBinding

| 字段 | 约束 |
| --- | --- |
| `binding_id` | 稳定身份 |
| `role` | 本模块写入 `project_lead`；测试可写 `owner` |
| `scope_kind` | `project` 或 `work_item` |
| `scope_id` | 对应 `project_id` 或 `work_item_id` |
| `principal_id` | 非空 |
| `supersedes` | 可选先前 `binding_id` |

回放后：活跃 Project 上当值 `project_lead` 必须恰好一个。两个当值且无 `supersedes`：该事实 `availability=conflict`，后续写入 fail closed。

## WorkItem

本机正本拥有。由 `hufu/work_item.opened` 物化。无关闭/状态机枚举写入外部系统；本模块不实现完整生命周期图，只记录「已打开」。

## Handoff

执行协调事实，不拥有 WorkItem 生命周期，不扩权。必须引用已存在 `work_item_id` 与当前 `grant_id`/`revision`。

## SessionBinding / Run

数据模型允许未来事件类型 `hufu/session_binding.established` 与 `hufu/run.recorded`，本模块 **不写入**。CurrentView 对应槽位 `availability=unavailable` 或 `data_insufficient`，`freshness=not_applicable`。

## CurrentView

带 `view_schema_version = 1`。字段见 `contracts/current-view.v1.md`。每项重要事实为：

```text
{ value, fact_class, availability, freshness }
```

| fact_class | 何时 |
| --- | --- |
| `authoritative` | 本机 Project / WorkItem 生命周期字段 |
| `observed` | Handoff、授权签发时间、指挥官声明 |
| `derived` | 下一步、是否可执行、角色唯一性结论 |

缺失：`availability=unavailable` 或 `data_insufficient`，禁止用 `0` 填数值槽。

## CommandError

见 `contracts/command-error.v1.md`。无部分成功。

## 状态与转换

- 账本：可追加 / 写者冲突 / 损坏 / 尾部未完成。损坏不可在本模块「修复中间行」。
- Grant：revision 单调增加；旧修订保留。
- RoleBinding：新绑定 `supersedes` 旧当值；不得原地改角色。
- 无 Issue 生命周期状态机，无审批态。
