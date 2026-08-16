# CommandError v1 additions

现有字段不变：`schema`、`code`、`message`、`retryable`。

本模块新增或明确使用：

| code | 退出码 | retryable | 何时 |
| --- | --- | --- | --- |
| `PILOT_INVALID` | 2 | false | 结论非法、用单一用量/步骤数宣称成功、质量声明缺失、隐私越界、度量把缺失写成 `0`、估算标成实测 |
| `EXPANSION_GATE_CLOSED` | 2 | false | `hufu serve`、远程访问或新控制面在本模块被请求 |
| `DATA_INSUFFICIENT` | 2 | false | 工作项无 handoff，或协调类度量缺少可靠观测窗口却被当成完成值 |
| `ROLE_NOT_ACTIVE` | 2 | false | `--actor` 不是 commander / 当值 project_lead |
| `LEDGER_DIGEST_CONFLICT` | 2 | false | 同一 `pilot_id` 重复写入但 payload 摘要冲突 |
| `TASK_AUTHORITY_UNSUPPORTED` | 2 | false | `connect --task-authority web\|ui\|dashboard` |
| `CONTRACT_INVALID` | 2 | false | JSON 不是对象或 schema 无法解析 |

`hufu serve` 不得以未知子命令的退出码 `1` 作为本模块验收。
