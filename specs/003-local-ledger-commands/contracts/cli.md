# CLI 合同: `hufu`（M2 四命令）

`validate` 仍遵守 `specs/002-ts-core-baseline/contracts/cli.md`。下列合同只约束 `connect` / `doctor` / `status` / `handoff`。

通用规则：

- stdout 恰好一个 JSON 对象（键按 UTF-16 码元排序后序列化，与摘要无关的输出稳定性要求：使用固定键序实现即可）。
- 成功：`ok` 为 `true`，退出码 `0`。
- 失败：`ok` 为 `false`，含 `error` 对象（见 `command-error.v1.md`），退出码 `2`/`3`/`4`。
- 不得在成功路径访问网络或监听端口。
- 项目根按「`--project-root` → `HUFU_PROJECT_ROOT` → 进程 cwd」解析；账本位于 `<project_root>/.hufu/ledger/`。该规则同时约束后续增量中的 `decide` / `pilot`。

## 项目根（#40）

```text
[--project-root <dir>]
```

| 来源优先级 | 选用条件 |
| --- | --- |
| 1. `--project-root <dir>` | 标志出现（含 `--project-root=` 空值） |
| 2. `HUFU_PROJECT_ROOT` | 标志未出现，且该环境变量已设置（含空字符串） |
| 3. 进程 cwd | 以上都未出现 |

解析成功：

- stdout 顶层必须有 `project_root`（已落实的绝对目录）。
- 成功对象为 `{ ok, project_root, result }`；解析成功后的失败对象为 `{ ok, project_root, error }`。
- 账本与缓存仍只写在该根下的 `.hufu/`，格式与事件语义不变。

解析失败（退出码 `2`，`CONTRACT_INVALID`，不得带猜测的 `project_root`）：

- `--project-root` 作为无值开关出现
- 所选来源为空或只含空白
- 路径不存在，或存在但不是目录，或无法落实为可访问目录

标志优先于环境变量；两者不同时以标志为准。不引入配置文件。不新增退出码。

### 兼容与迁移

- 未传标志且未设 `HUFU_PROJECT_ROOT` 时，与 #40 之前相同：项目根 = 进程 cwd。
- 已有工作区的 `.hufu/` 不会被移动或改写。换根即换工作区。
- `pnpm --dir <repo>` 仍会把 cwd 改成仓库根。要从其他目录指向目标工作区，必须传 `--project-root` 或设置 `HUFU_PROJECT_ROOT`。
- `validate` 保持文件路径合同；`serve` 保持拒绝，二者都不解析项目根。

## `hufu connect`

```text
hufu connect --project-id <id> --repository <uri> --task-authority local --commander <id> --grant-scope <text> [--project-lead <id>] [--grant-expires <iso8601>] [--project-root <dir>]
```

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 缺必填参数、空文本、`task_authority` 不是 `local` | 2 | `CONTRACT_INVALID` 或 `TASK_AUTHORITY_UNSUPPORTED` |
| 写者锁存在 | 3 | `LEDGER_WRITER_CONFLICT` |
| 已连接且载荷不同 | 3 | `LEDGER_CAUSALITY_CONFLICT` |
| 账本损坏 | 3 | `LEDGER_CORRUPT` |

成功 `result` 至少包含：`project_id`、`task_authority`、`commander_id`、`grant_id`、`grant_revision`、`project_lead_binding_id`、`ledger_seq_end`。

相同合法重提：退出码 0，上述身份与首次相同。

## `hufu doctor`

```text
hufu doctor [--repair-truncated-tail] [--project-root <dir>]
```

无 `--repair-truncated-tail` 时只读。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 无 `.hufu/ledger/` 或事件文件不可读 | 4 | `OBSERVATION_UNAVAILABLE` 或 `TASK_AUTHORITY_MISSING` |
| 写者锁存在（只报告，不删除） | 3 | `LEDGER_WRITER_CONFLICT` |
| 中间行损坏 | 3 | `LEDGER_CORRUPT` |
| 最后一行未完成且未传修复开关 | 3 | `LEDGER_CORRUPT`（可用性语义为 conflict；码用损坏/冲突类，message 说明可截除） |
| 未知必需 Schema | 2 | `SCHEMA_UNSUPPORTED` |

成功 `result` 至少包含：`healthy`（true）、`project_id`、`task_authority`、`event_count`、`lock_present`（false）。

`--repair-truncated-tail`：仅当「健康检查已能判定只有尾部未完成」时持锁截除并追加修复事件；否则 fail closed。成功后 `healthy` 为 true。

## `hufu status`

```text
hufu status [--project-root <dir>]
```

任何刷新类参数（`--refresh`、`--pull`、`--online`）→ 退出码 2，`CONTRACT_INVALID`。

未连接 → 退出码 4，`TASK_AUTHORITY_MISSING` 或 `OBSERVATION_UNAVAILABLE`。

成功 `result` 为 CurrentView（`current-view.v1.md`）。

## `hufu handoff`

```text
hufu handoff --work-item <id> --completed <text> --remaining <text> [--risks <text>] [--next-review <text>] [--project-root <dir>]
```

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 缺必填 | 2 | `CONTRACT_INVALID` |
| 无授权或工作项不存在 | 4 | `DATA_INSUFFICIENT` |
| 下一步文本越权 | 2 | `GRANT_SCOPE_EXCEEDED` |
| 写者冲突 / 因果 / 损坏 | 3 | 对应账本码 |

成功 `result` 至少包含：`handoff_id`、`work_item_id`、`next_action_text`、`grant_id`、`grant_revision`。`next_action_text` 必须包含该 `work_item_id`。

## 未知子命令

退出码 `1`，stderr 提示未知命令，不写 `.hufu/`（与 M1 一致）。已实现的四命令不得再走这条路径。
