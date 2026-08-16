# CLI 合同: `hufu decide`（M7 引擎机制扩展）

M2–M6 对 `connect` / `doctor` / `status` / `handoff` / `validate` / `decide` 既有标志仍然有效。本文件只写差异。

未知子命令保持退出码 `1`。

## `hufu connect`

`--task-authority` 仍只允许 `local` | `github` | `gitlab`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| `--task-authority` 为 `loopx`、`engine`、`engine-loopx` 或其他未知正本 | 2 | `TASK_AUTHORITY_UNSUPPORTED` |

连接不得绑定引擎，不得访问网络。

## `hufu decide`

```text
hufu decide --actor <principal_id> (--packet|--envelope|--ack|--fact|--revise|--effect|--engine|--result|--receipt) <file>
```

九个文件标志互斥，必须恰好出现一个。`<file>` 为 UTF-8 JSON 对象。`--actor` 必填。

`--packet` / `--envelope` / `--ack` / `--fact` / `--revise` / `--effect` 合同保持 M4。未绑定引擎时这些路径的成功/失败与 M4/M6 夹具一致。

### `--engine`

显式选用可选引擎。

成功 `result` 至少：`engine_id`（`loopx-mechanisms`）、`ledger_seq`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 载荷 `{ "engine_id": "loopx-mechanisms" }` 且已连接 | 0 | — |
| 同 id 再提 | 0 | 幂等 |
| 缺标志、非法 JSON、未知 `engine_id` | 2 | `CONTRACT_INVALID` |
| `engine_id` 为完整控制面，或夹带 scheduler/heartbeat/quota | 2 | `ENGINE_CONTROL_PLANE_REJECTED` |
| 把 Goal/Todo/Registry 声明为正本或工作项来源 | 2 | `ENGINE_AUTHORITY_REJECTED` |
| `--actor` 不是当值 `project_lead` | 2 | `ROLE_NOT_ACTIVE` |
| 工作区未连接 | 4 | `TASK_AUTHORITY_MISSING` |
| 已绑定不同 `engine_id` | 3 | `LEDGER_CAUSALITY_CONFLICT` |

`--engine` 不得访问网络，不得改变 `task_authority`。

### `--result`

记录类型化结果。成功 `result` 至少：`result_id`、`kind`、`content_digest`、`ledger_seq`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 字段齐全、引擎已绑定、信封适用、`--actor` 为信封执行者 | 0 | — |
| 同 `result_id` 同摘要 | 0 | 幂等 |
| 同 `result_id` 不同摘要 | 3 | `LEDGER_DIGEST_CONFLICT` |
| 未绑定引擎 | 4 | `ENGINE_NOT_BOUND` |
| 无当前信封或决策引用不匹配 | 4 | `DATA_INSUFFICIENT` |
| 非法 `kind` 或缺字段 | 2 | `CONTRACT_INVALID` |
| 夹带 Goal/Todo/Registry | 2 | `ENGINE_AUTHORITY_REJECTED` |
| 夹带 scheduler/heartbeat/quota/`next_cli_actions` | 2 | `ENGINE_CONTROL_PLANE_REJECTED` |
| `--actor` 角色不匹配 | 2 | `ROLE_NOT_ACTIVE` |

不得访问网络。不得把 `kind=progress` 写成工作项完成。

### `--receipt`

记录核验回执。成功 `result` 至少：`receipt_id`、`ok`、`ledger_seq`。

| 条件 | 退出码 | error.code |
| --- | --- | --- |
| 指向已有 `result_id` 或 `effect_id`，仅核验字段 | 0 | — |
| 夹带授权、完成、裁决正文或 `observed_result` | 2 | `RECEIPT_INVALID` |
| 未绑定引擎 | 4 | `ENGINE_NOT_BOUND` |
| 指向的结果/效果不存在 | 4 | `DATA_INSUFFICIENT` |

Receipt 成功不得改变授权修订，不得把 `first_durable_effect` 改为 `applied`。

### `--effect`

保持 M4：无 `complete` 读回不得 `applied` / `confirmed_absent` / 数值 `0`。本模块不放宽该约束。

## `hufu status`

行为与 M4/M6 相同（含 `--refresh` 规则）。成功 `result` 增加 `engine` / `typed_result` / `receipt` 槽（见 current-view 合同）。未绑定引擎时这些槽为数据不足，退出码仍为 0。`task_authority` 不得变成引擎。

## `hufu handoff`

输入标志不变。若 `execution_guardrails` 含 `engine_no_progress`：交接仍可记录（退出码 0），但 `next_action_text` 只陈述护栏，不得给出沿旧信封的新前向步骤。
