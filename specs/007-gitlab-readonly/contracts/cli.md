# CLI 合同: `hufu`（M6 GitLab 正本扩展）

M2 `local`、M3 本仓 `github`、M4 `decide` 仍然有效。本文件只写差异。004 合同中「`--task-authority gitlab` → `TASK_AUTHORITY_UNSUPPORTED`」由本模块解除。

`validate` 保持 M1。未知子命令保持退出码 `1`。

## `hufu connect`

```text
hufu connect --project-id <id> --repository <uri> --task-authority <local|github|gitlab> --commander <id> --grant-scope <text> [--project-lead <id>] [--grant-expires <iso8601>]
```

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| `--task-authority gitlab` 且仓库解析为两段 `group/project`（含 `gitlab.com` HTTPS/SSH） | 0 | — |
| `--task-authority gitlab` 但嵌套组、GitHub 网址、`github:` 引用、自建 Host 或无法解析 | 2 | `CONTRACT_INVALID` 或 `REPOSITORY_NOT_ALLOWED` |
| `--task-authority github` | 与 M3 相同 | 与 M3 相同 |
| `--task-authority local` | 与 M2 相同 | 与 M2 相同 |
| 已连接且正本或身份不同 | 3 | `LEDGER_CAUSALITY_CONFLICT` |

成功 `result` 增加：`repository_canonical`（gitlab 时为解析后的 `group/project`）。连接成功不得访问网络。

## `hufu doctor`

仍默认只读、不联网。GitLab 正本下：

- 账本健康即可 `healthy=true`，即使尚无投影缓存
- 缓存损坏单独在结果中标明，不因此伪造任务正本缺失

## `hufu status`

```text
hufu status [--refresh]
```

| 正本 | `--refresh` | 行为 |
| --- | --- | --- |
| `local` | 出现 | 退出码 2，`CONTRACT_INVALID`，不联网 |
| `github` | 缺省 / 出现 | 与 M3 相同 |
| `gitlab` | 缺省 | 读账本 + GitLab 缓存，不联网 |
| `gitlab` | 出现 | 只读拉取并写 GitLab 缓存；网络失败退出码 4，`OBSERVATION_UNAVAILABLE`，不删旧缓存 |

`--pull`、`--online` 仍视为刷新类参数，规则同上。

GitLab 正本且无缓存、无刷新：`status` 仍退出码 0，`work_items` 为空，工作项集合槽 `availability=data_insufficient`。

## `hufu handoff`

```text
hufu handoff --work-item <id> --completed <text> --remaining <text> [--risks <text>] [--next-review <text>]
```

GitLab 正本下 `<id>` 必须是 GitLab 缓存中的 `gitlab:group/project#n`。不在缓存 → 退出码 4，`DATA_INSUFFICIENT`。写成 `github:` → 退出码 2，`EXTERNAL_REF_INVALID`。不联网、不写回 GitLab。

## `hufu decide`

M4 标志与退出码族保持。GitLab 正本下 `--packet` 的 `task_ref` 必须是 GitLab 缓存中的合法引用；不在缓存 → 退出码 4，`DATA_INSUFFICIENT`。`github:` 引用 → 退出码 2，`EXTERNAL_REF_INVALID`。不得访问网络，不得复制议题正文。
