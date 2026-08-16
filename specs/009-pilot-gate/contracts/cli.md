# CLI Contract: `hufu pilot` / `hufu serve`

## `hufu pilot`

```text
hufu pilot --actor <actor_id> --record <file>
```

成功：

- 退出码 `0`
- 校验记录、派生度量、写入 `hufu/pilot.recorded`
- stdout JSON 含 `pilot_id`、`conclusion`、`work_item_id`、脱敏 `metrics` 摘要、`expansion_gate`
- 不含本机绝对路径、内部项目名、凭据、Session 原文

失败：

| 条件 | 退出码 | 错误码 |
| --- | --- | --- |
| 记录非法、结论越界、单一用量宣称成功、隐私越界 | 2 | `PILOT_INVALID` |
| 工作项无 handoff 或关键度量窗口不足 | 2 | `DATA_INSUFFICIENT` |
| 角色不是 commander / 当值 project_lead | 2 | `ROLE_NOT_ACTIVE` |
| 重复 `pilot_id` 且 payload 冲突 | 2 | `LEDGER_DIGEST_CONFLICT` |
| 缺少 `--actor` / `--record` | 1 | 用法错误 |

`--actor` 必须与 `--record` 同时出现，沿用现有 CLI 组合校验风格。

## `hufu serve`

```text
hufu serve
```

本模块行为：

- 已知子命令，不是未知命令
- 一律失败关闭
- 退出码 `2`
- 错误码 `EXPANSION_GATE_CLOSED`
- 不监听端口，不创建后台服务，不读取网页资源

即使 `expansion_gate.status=evaluation_allowed`，本模块仍拒绝实现网页。

## `hufu status`

无新标志。成功投影必须包含 `pilot` 与 `expansion_gate` 槽。未记录试点时两槽均为 `data_insufficient` 且 `value=null`，不得为 `0`。

## `hufu connect`

`--task-authority` 仍只接受 `hufu`。`web`、`ui`、`dashboard` 或把网页当任务正本的值必须失败，错误码 `TASK_AUTHORITY_UNSUPPORTED`。
