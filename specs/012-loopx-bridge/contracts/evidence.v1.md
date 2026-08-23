# Evidence 过桥合同 v1

本文件锁死 Evidence 侧哪些字段可以进入未来 Hufu↔LoopX 桥载荷。Evidence 是带来源的观测指针，不是授权，也不是议题完成声明。本文件不是实现授权。

本票属于 ADR 0006 第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥。引用 [#50](https://github.com/Blicae8917/hufu/issues/50)。

## 可过桥

| 字段 | 含义 | 禁止夹带 |
| --- | --- | --- |
| `evidence_ref` | 稳定证据身份 | Journal 原文、模型响应、Issue `body` |
| `binds_decision_id` | 可选；指向已有 DecisionRef | 裁决正文 |
| `binds_task_ref` | 可选；指向已有任务身份 | 把 Goal / Todo 写成 task_ref |
| `binds_effect_id` | 可选；指向已有效果身份 | `observed_result` / `durability` |
| `binds_work_item_id` | 可选；Hufu 或投影工作项身份 | 上游 `goal_id` |
| `fact_class` | `authoritative` \| `observed` \| `derived` | 把 derived 写成 authoritative |
| `availability` | `available` \| `unavailable` \| `data_insufficient` \| `conflict` | 数字 `0` |
| `freshness` | `fresh` \| `stale` \| `unknown` \| `not_applicable` | 自造完成态 |
| `observed_at` | 真实墙钟；缺失则省略 | 数字 `0` |

`readback_status` 若出现，只表示读回覆盖，取值 `complete` \| `unavailable` \| `data_insufficient`。它 **不得** 携带 `observed_result=applied|confirmed_absent` 作为过桥授权或议题关闭依据。

## 不得当作授权过桥（即使作为观测出现）

下列对象即使在 Hufu 本侧存在，也 **不得** 经桥推断或扩大授权：

- Journal / Host Session Log
- Receipt（`ok`、核验声明）
- 执行结果：TypedResult `kind`、效果 `observed_result`、Host 运行结局
- CurrentView 派生值

ADR 0006 第 4 条：LoopX 不得从 Journal、Receipt 或执行结果反推或扩大授权。本表把该禁令写成字段级失败关闭。

## 必须留在 Hufu

- Receipt 全文
- TypedResult 全文
- `EFFECT_DELTA` 的 `observed_result` / `durability`
- Evidence 所引用的命题原文与不可信外部文本

## 必须留在 LoopX

LoopX Journal、Goal 完成态、Scheduler / Heartbeat 滴答不得映射为 Hufu Evidence 正本，也不得用来关闭 GitHub / GitLab Issue。

## 失败关闭

1. 用 Receipt `ok=true` 或 TypedResult `progress` 修订 `AuthorizationGrant`
2. 用执行结果关闭或完成原生 Issue
3. 把缺失读回写成 `0`、已发生或确认不存在
4. 把外部 Issue 文本或模型响应写入指令 / 授权体

对应未来错误码：`BRIDGE_AUTHORITY_REJECTED`、`BRIDGE_LIFECYCLE_REJECTED`、`DATA_INSUFFICIENT`。

## 与 008 的关系

008 Receipt 只证明核验，不产生授权。本桥不得把该回执升格为 Evidence 正本或 grant。见 [008-non-promotion.v1.md](./008-non-promotion.v1.md)。
