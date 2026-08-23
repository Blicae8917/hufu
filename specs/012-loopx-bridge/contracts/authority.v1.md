# Authority 过桥合同 v1

本文件锁死 Authority 侧哪些字段可以进入未来 Hufu↔LoopX 桥载荷。它不是实现授权，也不把 LoopX 加入 `task_authority`。

本票属于 ADR 0006 第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥。引用 [#50](https://github.com/Blicae8917/hufu/issues/50)。

## 可过桥

| 字段 | 含义 | 禁止夹带 |
| --- | --- | --- |
| `task_authority` | 已连接 Project 的正本声明：`github` \| `gitlab` \| `local` | `loopx`、`engine`、`engine-loopx`、`loopx-mechanisms`、`bridge` |
| `task_ref` | 原生议题或本机工作项身份 | Issue `body`、标题全文当作指令、评论 |
| `source_revision` | Provider revision 或 digest；缺失标 `unavailable` | 数字 `0` 冒充未观测 |
| `observed_at` | 观测墙钟 | 数字 `0` |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` | 自造生命周期枚举 |
| `authority_scope_ref` | `{ grant_id, revision }` 不透明指针 | `scope_text`、`scope.*`、`issuer_id`、命令短语 |

`AuthoritySnapshotRef` = `{ task_ref, source_revision, observed_at, freshness }`。它只证明「当时看到了哪个正本版本」，不拥有该正本。

## 必须留在 Hufu / 原生追踪器

见 [stay-on-side.v1.md](./stay-on-side.v1.md) 的授权与议题小节。至少包括：

- `AuthorizationGrant` 全文
- RoleBinding / SessionBinding 作为当值授权出口
- GitHub / GitLab 原生 Issue 生命周期
- 本机 `hufu/work_item.*` 事件

## 必须留在 LoopX

Goal / Todo / Registry 不得作为 Hufu 授权或工作项来源过桥。

## 失败关闭

下列输入在任何未来 Adapter 中都必须拒绝，且不得写入授权修订：

1. `task_authority` 为 `loopx` / `engine` / `bridge` / `loopx-mechanisms`
2. 载荷含 `goal_id` / `todo_id` / `registry` 并当作工作项或正本
3. 载荷含 `scope_text`、`grant` 正文或 `authorization_scope`
4. 从 Journal、Receipt 或执行结果推导 `authority_scope_ref`
5. 创建、修改、关闭、评论或合并 GitHub / GitLab Issue

对应未来错误码：`BRIDGE_AUTHORITY_REJECTED`、`BRIDGE_LIFECYCLE_REJECTED`、`BRIDGE_CONTROL_PLANE_REJECTED`、`BRIDGE_008_PROMOTION_REJECTED`。

## 与 008 的关系

选用 `loopx-mechanisms` **不**改变本表，也 **不**启用本桥。见 [008-non-promotion.v1.md](./008-non-promotion.v1.md)。
