# CLI 合同: `hufu`（M3 GitHub 正本扩展）

M2 `specs/003-local-ledger-commands/contracts/cli.md` 对 `local` 仍然有效（含 #40 项目根解析）。本文件只写差异。

`validate` 保持 M1。未知子命令保持退出码 `1`。

## `hufu connect`

```text
hufu connect --project-id <id> --repository <uri> --task-authority <local|github> --commander <id> --grant-scope <text> [--project-lead <id>] [--grant-expires <iso8601>]
```

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| `--task-authority github` 且仓库解析为本公开仓 | 0 | — |
| `--task-authority github` 但仓库不是本仓或无法解析 | 2 | `CONTRACT_INVALID` 或 `TASK_AUTHORITY_UNSUPPORTED` |
| `--task-authority gitlab` | 2 | `TASK_AUTHORITY_UNSUPPORTED` |
| `--task-authority local` | 与 M2 相同 | 与 M2 相同 |
| 已连接且正本或身份不同 | 3 | `LEDGER_CAUSALITY_CONFLICT` |

成功 `result` 增加：`repository_canonical`（github 时为 `Blicae8917/hufu`）。连接成功不得访问网络。

## `hufu doctor`

仍默认只读、不联网。GitHub 正本下：

- 账本健康即可 `healthy=true`，即使尚无投影缓存
- 缓存损坏单独在结果中标明，不因此伪造任务正本缺失

## `hufu status`

```text
hufu status [--refresh]
```

| 正本 | `--refresh` | 行为 |
| --- | --- | --- |
| `local` | 出现 | 退出码 2，`CONTRACT_INVALID`，不联网 |
| `github` | 缺省 | 读账本 + 缓存，不联网 |
| `github` | 出现 | 只读拉取并写缓存；网络失败退出码 4，`OBSERVATION_UNAVAILABLE`，不删旧缓存 |

`--pull`、`--online` 仍视为刷新类参数，规则同上。

GitHub 正本且无缓存、无刷新：`status` 仍退出码 0，`work_items` 为空，工作项集合槽 `availability=data_insufficient`。

## `hufu handoff`

```text
hufu handoff --work-item <id> --completed <text> --remaining <text> [--risks <text>] [--next-review <text>]
```

GitHub 正本下 `<id>` 必须是缓存中的 `github:owner/repo#n`。不在缓存 → 退出码 4，`DATA_INSUFFICIENT`。不联网、不写回 GitHub。
