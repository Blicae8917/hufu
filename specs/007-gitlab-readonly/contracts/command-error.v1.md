# CommandError v1（M6 增补）

沿用 `specs/003-local-ledger-commands/contracts/command-error.v1.md` 与 M3/M4 稳定码。

`schema_version` 仍为 `"1"`。本模块复用既有码，不新造写回失败码。

| code | 退出码 | 何时 |
| --- | --- | --- |
| `REPOSITORY_NOT_ALLOWED` | 2 | GitLab 正本但仓库是自建 Host、GitHub 网址，或无法接受为两段路径 |
| `EXTERNAL_REF_INVALID` | 2 | 引用无法解析为当前正本要求的 scheme（GitLab 正本下的 `github:`、残缺 `gitlab:`、前导零、嵌套组） |
| `CONTRACT_INVALID` | 2 | `local` 下刷新类参数；缺字段 |
| `OBSERVATION_UNAVAILABLE` | 4 | GitLab 刷新网络失败或缓存不可读 |
| `DATA_INSUFFICIENT` | 4 | 交接或裁决引用不在当前 GitLab 缓存 |
| `LEDGER_CAUSALITY_CONFLICT` | 3 | 已连接后再改正本或身份 |
| `TASK_AUTHORITY_UNSUPPORTED` | 2 | 仍用于未知正本字符串；不再用于合法 `gitlab` |

刷新网络失败不得新造「写回失败」码——本模块没有写回路径。
