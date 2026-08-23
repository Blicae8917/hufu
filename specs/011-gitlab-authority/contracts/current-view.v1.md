# CurrentView v1（自建 Authority 设计差异）

沿用 003/007 的三轴与 `view_schema_version=1`。本文件不改变已交付 gitlab.com 正本视图。

若未来实现自建正本声明（本票不授权），差异只能是：

| 槽 | 设计期望 |
| --- | --- |
| `task_authority.value` | 仍为 `gitlab`（不新增枚举值） |
| 实例身份 | 另槽标识 `self_hosted` + 来源 host；公开测试只用示例 host |
| `work_items[]` | `gitlab-instance:` 引用；`fact_class=observed` |
| 写回状态 | 不得出现「已写回」或默认开启 |
| `body` / `description` | 禁止出现 |
| 缺失用量 / 时间 | `unavailable` 或 `data_insufficient`，不得为 `0` |

007 的 gitlab.com 视图合同保持不变。本设计票不改 `src/hufu/projector.ts`。
