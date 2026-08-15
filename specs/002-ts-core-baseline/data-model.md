# Data Model: 002-ts-core-baseline

本模块没有持久实体。下列对象只在一次 `validate` 调用内构造，不写入磁盘。

## TaskEnvelope

不可变校验结果。

| 字段 | 约束 |
| --- | --- |
| `schema_version` | 非空字符串，必须等于 `0.1` |
| `task_id` | 非空字符串（去两端空白） |
| `project` | `ProjectRef` |
| `source` | `native` 或 `external` |
| `objective` | 非空字符串 |
| `authorization_scope` | 非空字符串列表，至少一项，每项非空 |
| `terminal_conditions` | 非空字符串列表，至少一项，每项非空 |
| `external_ref` | 缺省为不出现；若出现则必须为非空字符串 |

## ProjectRef

| 字段 | 约束 |
| --- | --- |
| `id` | 非空字符串 |
| `repository` | 非空字符串 |

## ValidationOutcome

| 结果 | 条件 | 出口 |
| --- | --- | --- |
| 成功 | 载荷满足全部字段约束 | 退出码 `0`；stdout 为 `ValidateSummary` |
| 合同/输入无效 | 非对象、JSON 失败、读文件失败、任一字段违约 | 退出码 `2`；stderr 以 `invalid task contract: ` 开头 |

无部分成功、无重试、无默认填充。

## ValidateSummary

成功时 stdout 的 JSON 对象，键排序：

| 字段 | 值 |
| --- | --- |
| `project_id` | `project.id` |
| `schema_version` | 信封中的版本 |
| `source` | `native` 或 `external` |
| `task_id` | 信封中的 id |
| `valid` | 恒为 `true` |

不得输出授权范围全文、目标全文或外部系统状态。

## CliRequest

| 字段 | 约束 |
| --- | --- |
| `command` | 本模块唯一成功命令为 `validate` |
| `task_file` | `validate` 的必填路径 |

`connect`、`doctor`、`status`、`handoff` 以及任何其他子命令：不得进入成功路径，不得创建运行态。

## 状态

无生命周期状态机。对象要么校验成功被打印，要么失败退出。
