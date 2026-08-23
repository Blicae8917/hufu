# 本侧留守与反向授权禁令 v1

本文件列出必须留在各自本侧的字段，以及 LoopX **不得**取代原生 Issue 生命周期、**不得**从 Journal / Receipt / 执行结果反推或扩大授权的规则。本文件不是实现授权。

引用 ADR 0006 与 [#50](https://github.com/Blicae8917/hufu/issues/50)。本票是第 (2) 类桥的设计合同。

## Hufu 本侧留守

| 对象 | 留守原因 |
| --- | --- |
| `AuthorizationGrant` 正文（`issuer_id`、`scope.*`、`scope_text`、`expires_at`、`supersedes`） | 唯一可被范围引用的授权本体 |
| `commander` 身份与 grant 签发事件 | 人类是最终授权来源 |
| `RoleBinding` / `SessionBinding` | 当值出口不是 LoopX 角色卡 |
| `DECISION_PACKET` 语义正文 | 一个 stream 只完整保存一次 |
| `EXECUTION_ENVELOPE` / `ROUTE_ACK` | 执行协调事实，不是审批，也不是正本 |
| 三类 Delta 正文 | 增量属于 Hufu Ledger |
| Receipt | 核验声明不得扩权 |
| Journal / Host Session Log | 不可信执行痕迹 |
| TypedResult / `observed_result` | 执行结果不得扩权或关闭议题 |
| CurrentView 派生值 | 可重建视图，不是授权 |
| 本机 WorkItem 生命周期 | `local` 正本由 Hufu Ledger 拥有 |
| 外部 Issue `body` 与写方法 | 不可信引用；V1 只读投影 |

## LoopX 本侧留守

| 对象 | 留守原因 |
| --- | --- |
| Goal / Todo / Registry | LoopX 控制面；不得映射为 Hufu WorkItem 或 `task_authority` |
| Quota / Scheduler / Heartbeat | Hufu 不重复实现；也不得经桥搬入 |
| 长任务恢复与 Host 执行循环 | LoopX 拥有 |
| LoopX Journal | 不得改写 Hufu 授权或决策正文 |
| PM Engine / Wave Engine / 完整 Web 控制面 | 已废除的 M10–M15，不得复活 |

## LoopX 不得取代原生 Issue 生命周期

当 Project 的 `task_authority` 为 `github` 或 `gitlab` 时：

- 原生 Issue 的打开、关闭、状态转换、评论、标签写、合并请求动作仍由 GitHub / GitLab 拥有
- Hufu 只持有带来源身份、`source_revision`、`observed_at` 与 `freshness` 的只读 Projection
- 桥 MUST NOT 提供 `writeIssue`、`closeIssue`、`commentIssue`、`merge` 或等价行为
- 桥 MUST NOT 把 LoopX Goal 完成写成 Issue 关闭

`local` 正本的生命周期仍由 Hufu Ledger 拥有，LoopX 同样不得写入。

## 不得从 Journal、Receipt 或执行结果反推授权

下列来源 **无论出现在哪一侧** 都不得产生或扩大 `AuthorizationGrant`：

1. Journal / Host Session Log / LoopX Journal
2. Receipt（008 核验回执或任何同名回执）
3. 执行结果：TypedResult、`EFFECT_DELTA.observed_result`、Host 运行结局、Scheduler / Heartbeat 滴答

`authority_scope_ref` 只能指向事先存在的 grant。桥载荷、执行信封和路线确认都不能成为新的授权来源。非空 `ROUTE_ACK.added_scope` 仍须 fail closed 回到既有授权渠道。

## 缺失不得写成 `0`

墙钟、Token、读回覆盖或 Provider 观测缺失时，必须报告 `unavailable` 或 `data_insufficient`，MUST NOT 写成数字 `0`。

## 明确不做（本侧也不得借桥复活）

- 不得把 Goal / Todo / Scheduler / Heartbeat 搬进 Hufu
- 不得复活 M10–M15、会商 Runtime、出站 Runtime
- `hufu serve` 保持拒绝
- 不得实现 #49 GitLab AuthorityProvider 或企业 Renderer
