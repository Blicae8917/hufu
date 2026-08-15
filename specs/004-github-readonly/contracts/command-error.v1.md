# CommandError v1（M3 增补）

沿用 `specs/003-local-ledger-commands/contracts/command-error.v1.md`。

`schema_version` 仍为 `"1"`。新增稳定码：

| code | 退出码 | 何时 |
| --- | --- | --- |
| `REPOSITORY_NOT_ALLOWED` | 2 | GitHub 正本但仓库不是本公开仓 |
| `EXTERNAL_REF_INVALID` | 2 | 引用无法解析为 `github:owner/repo#n` |
| `GITHUB_REFRESH_UNSUPPORTED` | 2 | 非 GitHub 正本却要求刷新（也可用 `CONTRACT_INVALID`；实现选定后测试锁死其一） |

刷新网络失败继续用 `OBSERVATION_UNAVAILABLE`（退出码 4），不得新造「写回失败」码——本模块没有写回路径。
