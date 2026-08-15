# ADR 0005：零拷贝决策传递与语义重基

- 状态：候选，待 `0.1.0` 设计 Pull Request 接受
- 日期：2026-08-15
- 决策所有者：Hufu 维护者
- 实现状态：尚未实现；作为已接受方向由独立 Module Issue、Spec Kit 合同和失败测试交付，
  **不阻塞 `0.1.0` 发布门**。`0.1.0` 若触碰决策记录，至多实现“一份裁决只完整保存一次，
  `status` 与 `handoff` 只传引用”。

## 背景

同一项裁决从参谋传给 PM、执行 Leader，再经过 Session 换届和 Handoff 时，如果每一层都重写目标、
验收、范围和事实，文本会不断膨胀，语义会逐步漂移，操作者也难以判断哪一份才是原始裁决。
重复任务正文还会增加上下文、墙钟和 Token 成本。

Hufu 已经把 GitHub、GitLab 或 Local 声明为每个 Project 的唯一 `task_authority`，并使用 append-only
执行事实和确定性 Projection。新的决策传递能力必须复用这些边界，不能为了减少文本复制而建立第二份
Issue 正文、任务生命周期、审批队列或授权系统。

另一个常见失效是“实现活动很多、真实效果很少”：代码、提交、迁移或验收产物持续增加，
但目标系统没有经过 readback 确认的 durable Effect，甚至实现已经进入明确的 `non_goals`。
Hufu 需要在不增加后台 Scheduler 或繁琐验收门的前提下，及时停止沉没实现并重新对齐最短安全路线。

## 决策

### 1. 一条 decision stream，一份初始正文

每项需要执行的裁决具有稳定 `decision_id`。Hufu Ledger 只完整保存一次初始 `DECISION_PACKET`；
同一裁决的后续业务版本只通过有序 `DECISION_DELTA` 物化。Session、Envelope、ACK、Handoff、Renderer
和跨 Host 信息包只传递 `decision_id`、`version`、`content_digest` 及必要引用，不复制或改写正文。

“零拷贝”在本 ADR 中指单一语义正本和单一 canonical persistence，不承诺内存、文件系统、备份或
网络缓存的字节零复制。任何临时副本必须可从 Ledger 重建、通过 digest 校验，并明确标记为非正本。

初始 Packet 包含：

- `decision_id`、业务 `version`；
- `business_outcome`；
- `authoritative_state`；
- `acceptance_metric`；
- `simplest_safe_route`；
- `verified_facts`；
- `unknowns`；
- `non_goals`；
- `true_stoplines`；
- `authority_scope_ref`；
- `evidence_as_of`；
- `recheck_when`。

业务版本与 Event Schema Version 分离。`authoritative_state` 是带来源任务引用、Provider revision
或 digest、观测时间和 freshness 的 `AuthoritySnapshotRef`，不是 Hufu 自有状态，也不复制 Issue 正文。
`verified_facts` 保存 Fact/Evidence 引用而不是证据全文。`authority_scope_ref` 只能引用已经独立成立的授权；
Packet 的存在、版本或 digest 都不产生权限。
`content_digest` 对 Schema 规定的规范化语义字段计算，不依赖 JSON 属性顺序或 Storage Provider 的物理字节。

现有派生建议统一命名为 `RouteRecommendation`。Advisor 或会商可以提出建议，只有 `commander`
或既有授权明确指定的决策发布者作出裁决后，内容才进入 Packet。推荐、裁决和授权不能互相冒充。

### 2. 执行层只附加 EXECUTION_ENVELOPE

当值 `project_lead` 或承担 Mission 集成的 `mission_lead` 可以为 Packet 附加 `EXECUTION_ENVELOPE`。
产品界面的“PM”或“将军”只是这两个既有角色的显示称谓，不新增核心角色。

Envelope 只允许保存：

- `envelope_id`、decision ref/digest；
- 发布者与实际执行者的 RoleBinding；
- WorkItem、SessionBinding、Workspace；
- route step、输入、Handoff、预算或期限引用；
- 可选的 `supersedes_envelope_ref`。

Envelope Schema 必须拒绝重复出现或覆盖 outcome、authoritative state、acceptance、route、non-goals、
stoplines 和授权正文。它只能在既有 `authority_scope_ref` 内进一步收窄执行，不得扩大权限。

### 3. 开工前只有非审批性 ROUTE_ACK

实际执行的 `owner`，或承担多 WorkItem 集成的 `mission_lead`，在每个 Envelope 开工前提交一次
`ROUTE_ACK`。它记录执行者看到的 Packet/Envelope digest、Role/SessionBinding、事实检查时间，
并确认 business outcome、authoritative state 和 acceptance metric 未改变。

`added_scope` 默认是空数组。非空项必须包含具体 `required_because`、请求范围和 Evidence 引用，
且原因只能属于：

1. `data_safety`；
2. `actual_permission_gap`；
3. `irreversible_action`；
4. `effect_readback_unavailable`。

合法原因只证明“发现了哪种范围缺口”，不批准该范围。非空项一律得到派生结果
`scope_change_required`，当前 Envelope 不能开工；由原有外部授权流程更新授权后，PM 再附加新 Envelope，
执行者重新 ACK。Hufu 不增加 `pending/approved/rejected` 状态，也不修改 WorkItem 状态。

同一 Envelope 的 ACK 使用幂等 Key；相同 digest 返回原记录，不同 digest fail closed。决策版本、Envelope、
执行 RoleBinding、授权 revision 或三项确认内容变化后，旧 ACK 仍保留，但不再适用于新执行。

### 4. 后续只追加三类 Delta

- `FACT_DELTA` 记录 live Fact/unknown 引用及 Evidence/freshness frontier 的增加、取代或撤回，
  不改写当前版本钉住的 `verified_facts`/`unknowns`；
- `DECISION_DELTA` 使用 `expected_version` 从 vN 生成连续的 vN+1，记录 `supersedes`、变化字段、
  依据的 Fact Delta、`preserve_effects`、`discarded_assumptions` 和新的 content digest；
- `EFFECT_DELTA` 使用稳定 `effect_id` 记录 Envelope/Run、前次观测、readback、observed result、
  durability、时间和 Evidence。

`FACT_DELTA` 与 `EFFECT_DELTA` 不静默改变决策。路线、目标、验收、非目标、停止线或授权引用变化时，
必须使用 `DECISION_DELTA` 形成新版本。同一旧版本只有一个合法后继；版本跳跃、双后继、digest 冲突、
因果缺失或未知必需 Schema 必须 fail closed。

`preserve_effects` 只引用带 readback 状态的 Effect；`discarded_assumptions` 只标识不再成立的假设。
二者都不删除历史 Event、Evidence、Run 或 Handoff。没有 readback 时不得声称 Effect 已发生、未发生、
已保留或数值为零。

### 5. Semantic rebase 是事件驱动的执行护栏

`first_durable_effect` 只有在 readback 证明某 Effect 持久存在并推进权威目标态或验收指标时才有
Effect 引用与时间。观测覆盖充分但确认尚无效果时使用 `confirmed_absent`；无法读取或覆盖不足时使用
`unavailable` 或 `data_insufficient`。

漂移检测是确定性 Projector 的纯函数，仅在 Event append、Effect readback、`status`、`handoff`
或生成下一步指令等既有交互边界求值。不得为此引入轮询、Daemon、Scheduler、Heartbeat 或周期唤醒。

硬触发条件只有两类：

1. `recheck_when` 已达到，readback 覆盖充分且首个 durable Effect 仍为 `confirmed_absent`，同时代码、
   提交、迁移或证书/验证产物等 implementation activity 的 Evidence frontier 按该条件持续增长；
2. 确定性 Evidence 证明当前步骤或效果进入 `non_goals`。

模型判断只能产生 `suspected_drift`，不能独自触发硬停止线。硬触发按
`decision_ref + evidence_frontier_digest` 形成 fingerprint，在同一前沿只消费一次；确认重基时以
`FACT_DELTA` 保存 fingerprint 和 Evidence 引用，CurrentView 派生 `semantic_rebase_required`。

该护栏只阻止 Hufu 从旧 Envelope 生成或投递新的前向动作；readback、遏制、安全恢复和证据采集仍可进行。
它不关闭 Issue、不删除代码或提交、不回滚迁移、不自动撤销不可逆 Effect。原最短安全路线仍适用时，
重新附加 Envelope 和 ACK；路线语义需要改变时，先追加 `DECISION_DELTA`，再附加 Envelope 和 ACK。

### 6. Projection 不拥有任务或审批状态

CurrentView 只派生当前 decision ref/digest、Fact/Effect cursor、适用 Envelope、ACK 适用性、
`first_durable_effect`、最新 Delta 引用和执行护栏。护栏可以表达 `ack_required`、
`scope_change_required`、`semantic_rebase_required`、`stale_envelope` 或 `data_insufficient`，
但不能表达另一套 `open/closed/blocked/done` WorkItem 生命周期。

GitHub、GitLab 或 Local authority 继续拥有任务状态。Hufu 只拥有决策引用、版本、路线确认、
效果 readback、交接与换届恢复；所有外部状态继续通过只读 Projection 进入，不写回任务正本。

## 后果

### 正面影响

- PM、Leader、Session 换届和不同 Host 可以共享同一裁决，不再反复压缩或改写任务正文。
- Packet digest 和 component digest 使目标漂移、过期授权和范围新增可确定检测。
- 三类 Delta 保留完整因果历史，同时避免为每次事实或效果变化复制整份任务。
- Semantic rebase 把“实现很多、效果很少”变成可观察停止线，而不增加常驻控制面。
- 现有任务正本、角色、授权、Evidence 和 CurrentView 边界保持不变。

### 成本与约束

- 必须实现版本、单一后继、digest、幂等和确定性回放合同。
- Provider 必须提供足够的 revision、freshness 和 readback 信息；缺失时只能 fail closed 或报告
  `data_insufficient`，不能猜测。
- `recheck_when` 需要每项决策显式设定；Hufu 不提供一个适合所有任务的全局“长时间”阈值。
- `0.0.1` 的 `TaskEnvelope` 与目标 `EXECUTION_ENVELOPE` 语义不同，未来迁移必须版本化，不能静默改名替换。
- 该设计只能阻止 Hufu 继续生成或投递旧路线；在没有 RuntimeProvider 时，无法强制终止 Host 内已经运行的 Agent。

## 考虑过的替代方案

### 每个 Handoff 或 Session 都复制一份任务正文

拒绝。它扩大上下文和 Token，无法确定哪一份是裁决正本，也会在多次换届后产生语义漂移。

### 每个业务版本都保存一份完整 Packet

拒绝。完整快照便于读取，但会重复目标、验收和事实。采用“初始 Packet + 类型化 Delta + 确定性物化”，
并用夹具测试承担回放复杂度。

### 让 ROUTE_ACK 批准新增范围

拒绝。这样会建立第二套授权与审批控制面，并让执行者可以自我扩权。

### 使用后台监控持续检查漂移

拒绝。它会引入 Scheduler、Heartbeat、额外唤醒和成本。现有消息与状态边界足以进行同步检查。

### 由模型判断“实现偏了”并自动重基

拒绝。模型意见可以提示 `suspected_drift`，但只有可复核 Evidence 和确定性规则可以触发硬护栏。

## 后续约束与验证

实现该 ADR 的 Module 必须使用 Spec Kit 定义至少以下失败测试：

- Envelope 或 ACK 重写 Packet 正文；
- 非法 `required_because`、非空 `added_scope` 自动扩权或产生审批状态；
- 相同版本不同 digest、版本跳跃、双后继和因果缺失；
- 无 readback 时把 Effect 记为 applied、absent 或零；
- 相同事件夹具在 DeepSeek 与 Standalone Profile 物化出不同 decision ref、digest 或护栏；
- `status` 或漂移求值产生后台轮询、Issue 写回或重复 rebase fingerprint；
- semantic rebase 删除 Evidence、回滚不可逆 Effect 或改变 WorkItem 生命周期。

该 Module 的 Spec 在定义合同前必须先回答以下设计必答题，不得留给实现推导：

- **Decision 与 WorkItem 的基数**：一个 `decision_id` 能否横跨多个 WorkItem（Mission 场景）；
  一个 WorkItem 能否同时存在多条活跃 decision stream；
- **`decision_id` 的分配**：由哪个角色、在哪类事件中分配，以及与幂等 Key 的关系；
- **decision stream 的终结**：是否存在显式终态，还是仅由 `recheck_when` 与执行护栏约束；
- **授权本体依赖**：`authority_scope_ref` 与“授权 revision 变化后旧 ACK 失效”如何绑定到
  SPEC 定义的 `AuthorizationGrant` 身份与 revision。

效能试点必须比较正文重复量、上下文或可取得的 Token、规划与执行墙钟、零效果尝试、协调唤醒和返工。
连续三轮没有可解释净收益时暂停扩大该能力，不以更多控制面补偿失败。

本 ADR 补充 ADR 0001 的执行事实轴、复用 ADR 0003 的双 Profile 插件边界，并规定 ADR 0004 的会商结果
只能先成为 `RouteRecommendation`，不能自动创建或修改 `DECISION_PACKET`。
