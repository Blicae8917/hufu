# CLI 合同: `hufu decide`（M4 决策流）

M2/M3 对 `connect` / `doctor` / `status` / `handoff` / `validate` 仍然有效。本文件只写本模块差异与新命令。

未知子命令保持退出码 `1`。

## `hufu decide`

```text
hufu decide --actor <principal_id> (--packet|--envelope|--ack|--fact|--revise|--effect) <file>
```

六个文件标志互斥，必须恰好出现一个。`<file>` 为 UTF-8 JSON 对象。`--actor` 必填。

成功时标准输出一个 JSON 对象：`{ "ok": true, "result": { ... } }`。

### `--packet`

记下初始裁决。

成功 `result` 至少：`decision_id`、`version`（`1`）、`content_digest`、`ledger_seq`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 字段齐全且 `--actor` 为指挥官 | 0 | — |
| 缺标志、非法 JSON、缺字段、未知 `recheck_when.type` | 2 | `CONTRACT_INVALID` |
| `--actor` 不是指挥官 | 2 | `ROLE_NOT_ACTIVE` |
| `task_ref` 不存在（本机无工作项 / GitHub 不在缓存） | 4 | `DATA_INSUFFICIENT` |
| 授权引用不是当前 `grant_id/revision` | 2 | `GRANT_SCOPE_EXCEEDED` |
| 工作项已属另一活跃决策流 | 3 | `DECISION_CONFLICT` |
| 同 `decision_id` 版本 1 不同摘要 | 3 | `LEDGER_DIGEST_CONFLICT` |
| 同 `decision_id` 版本 1 同摘要 | 0 | 幂等，返回原结果 |
| 写者锁冲突 | 3 | `LEDGER_WRITER_CONFLICT` |

`--packet` 不得访问网络。

### `--envelope`

附加执行信封。成功 `result` 至少：`envelope_id`、`decision_id`、`version`、`content_digest`、`owner_binding_id` 或 `mission_lead_binding_id`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 夹带裁决正文字段 | 2 | `ENVELOPE_INVALID` |
| `--actor` 角色不匹配（单工作项须 `project_lead`，多工作项须已有或即将建立的 `mission_lead` 且行动者为当前 `project_lead`） | 2 | `ROLE_NOT_ACTIVE` |
| 摘要与当前裁决不匹配 | 3 | `DECISION_CONFLICT` |
| 执行范围超出授权文本 | 2 | `GRANT_SCOPE_EXCEEDED` |

多工作项：行动者必须是当值 `project_lead`；命令在同一追加中建立 `mission_lead` 绑定，`principal_id` 取 `--actor`（本模块不另做集成负责人选举）。

### `--ack`

提交路线确认。成功 `result` 至少：`envelope_id`、`decision_id`、`version`、`added_scope_count`、`guardrails`（字符串数组，可含 `scope_change_required`）。

非空 `added_scope` 仍退出码 **0**。非法原因退出码 2，`ACK_INVALID`。

### `--fact` / `--revise` / `--effect`

追加对应 Delta。`--revise` 成功 `result` 含 `new_version` 与新 `content_digest`。版本跳跃或双后继：退出码 3，`DECISION_CONFLICT`。无读回却声称 `applied` / `confirmed_absent` / 数值 `0`：退出码 2，`CONTRACT_INVALID`。

## `hufu status`

行为与 M3 相同（含 `--refresh` 规则）。成功 `result` 增加 data-model 所列决策槽。无裁决时这些槽为数据不足，退出码仍为 0。不得把 Packet 正文字段复制进 `result`（只允许 `decision_id` / `version` / `content_digest` 与护栏名）。

## `hufu handoff`

输入标志不变。成功 `result` 增加：

| 字段 | 约束 |
| --- | --- |
| `decision_ref` | `{ decision_id, version, content_digest }` 或 `null` |
| `next_action_text` | 含工作项身份；若有裁决则含 `decision_id` 与版本；**不得**含目标/验收/路线/非目标/停止线/授权正文/议题正文 |

若当前护栏含 `scope_change_required` 或 `semantic_rebase_required`：交接仍可记录（退出码 0），但 `next_action_text` 只陈述护栏，不得给出沿旧信封的新前向步骤。
