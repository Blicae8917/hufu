# 命令错误合同 v1（引擎机制扩展）

沿用 `specs/003-local-ledger-commands/contracts/command-error.v1.md` 的 JSON 形状与退出码族。`error.schema_version` 仍为 `"1"`。

## 本模块新增 code

| code | 退出码 | 含义 |
| --- | --- | --- |
| `ENGINE_NOT_BOUND` | 4 | 尚未显式选用可选引擎，却提交 `--result` 或 `--receipt` |
| `ENGINE_AUTHORITY_REJECTED` | 2 | 把引擎、Goal、Todo 或 Registry 当作任务正本或工作项来源 |
| `ENGINE_CONTROL_PLANE_REJECTED` | 2 | 输入要求完整控制面、调度器、心跳、配额、自动开工或上游 CLI 动作 |
| `RECEIPT_INVALID` | 2 | 回执夹带授权、完成声明、裁决正文或效果观测字段 |

既有 code 继续使用：`CONTRACT_INVALID`、`TASK_AUTHORITY_UNSUPPORTED`、`ROLE_NOT_ACTIVE`、`DATA_INSUFFICIENT`、`LEDGER_*`、`DECISION_CONFLICT` 等。

`engine_no_progress` **不是** error.code。它只出现在成功结果的 `execution_guardrails` / CurrentView 中。

消费者只按 `error.code` 与退出码分类。`message` 可变，不得作为合同。
