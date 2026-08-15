# 命令错误合同 v1

`error.schema_version` 必须为 `"1"`。

```json
{
  "ok": false,
  "error": {
    "schema_version": "1",
    "code": "CONTRACT_INVALID",
    "message": "human readable, not for classification"
  }
}
```

## 退出码映射

| 退出码 | 含义 | 典型 code |
| --- | --- | --- |
| 0 | 成功 | （无 error） |
| 2 | 合同或输入无效 | `CONTRACT_INVALID`、`TASK_AUTHORITY_UNSUPPORTED`、`SCHEMA_UNSUPPORTED`、`GRANT_SCOPE_EXCEEDED` |
| 3 | 状态冲突或并发拒绝 | `LEDGER_WRITER_CONFLICT`、`LEDGER_CAUSALITY_CONFLICT`、`LEDGER_DIGEST_CONFLICT`、`LEDGER_CORRUPT` |
| 4 | 观测不可用或数据不足 | `OBSERVATION_UNAVAILABLE`、`DATA_INSUFFICIENT`、`TASK_AUTHORITY_MISSING` |

`TASK_AUTHORITY_MISSING` 归入 4：尚未连接时没有可观测正本，不是输入词法错误。

## code 枚举（本模块）

- `CONTRACT_INVALID`
- `TASK_AUTHORITY_UNSUPPORTED`
- `TASK_AUTHORITY_MISSING`
- `LEDGER_WRITER_CONFLICT`
- `LEDGER_CAUSALITY_CONFLICT`
- `LEDGER_DIGEST_CONFLICT`
- `LEDGER_CORRUPT`
- `SCHEMA_UNSUPPORTED`
- `OBSERVATION_UNAVAILABLE`
- `DATA_INSUFFICIENT`
- `GRANT_SCOPE_EXCEEDED`

消费者只按 `error.code` 与退出码分类。`message` 可变，不得作为合同。
