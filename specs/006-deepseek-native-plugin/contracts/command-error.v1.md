# 命令错误合同 v1（插件组合扩展）

沿用 `specs/003-local-ledger-commands/contracts/command-error.v1.md` 的 JSON 形状与退出码族。`error.schema_version` 仍为 `"1"`。

本模块**不新增** `error.code` 字符串。

| 情形 | code | CLI 退出码 |
| --- | --- | --- |
| 无有效 Bundle 被显式加载 | `CONTRACT_INVALID` | 2 |
| 领域层既有失败 | 原码 | 原退出码 |

插件未挂载时，工具不存在；测试检查工具列表，而不是发明「未装插件」的成功 JSON。
