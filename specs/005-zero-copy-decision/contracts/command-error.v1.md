# 命令错误合同 v1（决策流扩展）

沿用 `specs/003-local-ledger-commands/contracts/command-error.v1.md` 的 JSON 形状与退出码族。`error.schema_version` 仍为 `"1"`。

## 本模块新增 code

| code | 退出码 | 含义 |
| --- | --- | --- |
| `DECISION_CONFLICT` | 3 | 同一裁决身份内容冲突、版本跳跃、双后继、工作项已属另一活跃流、信封钉住的摘要与当前裁决不符 |
| `ENVELOPE_INVALID` | 2 | 信封夹带裁决正文或禁止字段 |
| `ACK_INVALID` | 2 | 非法 `required_because`、三项摘要不匹配、确认者不是信封执行者 |
| `ROLE_NOT_ACTIVE` | 2 | `--actor` 没有该操作要求的当值绑定 |

既有 code 继续使用：`CONTRACT_INVALID`、`GRANT_SCOPE_EXCEEDED`、`LEDGER_*`、`DATA_INSUFFICIENT`、`TASK_AUTHORITY_MISSING` 等。

`scope_change_required` 与 `semantic_rebase_required` **不是** error.code。它们只出现在成功结果的 `guardrails` / CurrentView 中。

消费者只按 `error.code` 与退出码分类。`message` 可变，不得作为合同。
