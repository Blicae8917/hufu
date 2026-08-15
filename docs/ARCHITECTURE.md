# 架构说明

状态：候选，待 `0.1.0` 设计 Pull Request 接受
最后更新：2026-08-15
当前实现：仅零 Cordis 依赖的 TypeScript 领域核心与 `hufu validate`。下表「V1 实现」描述目标
架构，不表示四命令、账本、插件、会商或网页已经交付。

## 架构目标

Hufu 在不夺取事实所有权的前提下，为操作者组合出可信视图。因此，架构把任务正本、执行事实和呈现层分离，
并在每个边界上显式展示来源与 freshness。

治理这些边界的决策记录是：

- [`ADR 0001：分离任务正本、执行事实与呈现层`](adr/0001-authority-execution-ui-separation.md)；
- [`ADR 0002：分离 Host 集成、CLI、MCP 与执行引擎`](adr/0002-host-cli-mcp-engine-separation.md)，
  已由 ADR 0003 取代；
- [`ADR 0003：采用 Cordis-first 插件架构与双 Profile`](adr/0003-cordis-first-plugin-architecture.md)；
- [`ADR 0004：有界关键决策会商`](adr/0004-bounded-decision-council.md)，属于未来插件规划，
  不进入 `0.1.0` 实现；
- [`ADR 0005：零拷贝决策传递与语义重基`](adr/0005-zero-copy-decision-transfer.md)。

动态上游版本、已核对提交和漂移状态记录在[上游兼容性与同步基线](COMPATIBILITY.md)，
不写入 Constitution 或把源码核对等同于实现支持。

## 三条正交轴

| 轴 | 拥有 | V1 实现 | 不得拥有 |
| --- | --- | --- | --- |
| 任务正本 | WorkItem 生命周期和原生任务状态 | `github`、`gitlab` 或 `local` | 执行策略、UI 状态、推导出的授权 |
| 执行事实 | Run、Session、Workspace、决策传递、Evidence、Receipt、Effect readback、Handoff | Hufu DomainEvent 与入站 Host/Profile Adapter 的有界观测；后续可选 Runtime/Engine | Issue 生命周期、审批状态或 `commander` 授权 |
| 呈现 | Status 视图、Dashboard、依赖和下一步渲染 | 模型 Tool 与 CLI；loopback Web 仅在效能门禁通过后进入 `0.1.0` | 任何权威任务状态或执行状态 |

三条轴通过类型化合同组合，而不是塞进同一个 Provider 枚举。

```text
                         人类 commander
                              |
                         目标 + 授权
                              |
     +------------------------+------------------------+
     |                        |                        |
   任务正本                 执行事实                  Renderer
 github/gitlab/local    Run/Evidence/Handoff  CLI/条件式 loopback UI
     |                        |                        |
     +--------------------应用视图---------------------+
                              |
                       来源事实 + freshness
```

## Cordis 插件模型与 Host 边界

Hufu 的目标架构使用 Cordis-first 插件树。每项可替换能力都分为 Service Definition、Provider
和 Consumer：Service Definition 固定供应商中立合同，Provider 提供具体实现，Consumer 只通过 Context
Injection 调用服务。类型化 Event 传递事实，可撤销 Effect 管理工具、监听器和资源注册。

“Cordis-first”约束的是组合层，不是领域核心的依赖：供应商中立领域核心保持零框架依赖，
Service Definition 先由纯 TypeScript 接口表达。`0.1.0` 的 Standalone Profile 不组装 Cordis；
Cordis 运行时随 DeepSeek Profile Module 引入，届时同一组接口再包装为 Cordis Service。

供应商中立的 `DecisionTransferService` 负责校验决策引用、追加执行协调记录并投影当前决策；
Storage Provider 只保存其 append-only 事件，RuntimeProvider、EngineProvider、Tool、CLI、MCP 和 Web
都是 Consumer。任何 Consumer 都不能改写 canonical 决策正文、授权引用或任务生命周期。

“Cordis-first”描述插件、服务和生命周期结构，不表示兼容所有同名实现。`0.1.0` 候选所核对的具体
Cordis 包和版本记录在兼容性基线；替换实现必须重新执行合同测试并更新该记录。Hufu 注入的 Service
使用 `ctx.hufu*` 命名空间，领域事件使用 `hufu/*` 命名空间，避免与 Host 原生服务冲突。

```text
                         Hufu Service Definitions
                                   |
        +--------------------------+--------------------------+
        |                          |                          |
 Authority Provider      RuntimeProvider（未来）       EngineProvider
 github/gitlab/local    deepseek/codex/claude/...     native/loopx
        |                          |                          |
        +--------------------------+--------------------------+
                                   |
                         CurrentView + Commands
                                   |
                     Tool / CLI / MCP / Web Consumer
```

Hufu 提供两种组合方式：

- **DeepSeek Profile**：作为 DeepSeek Harness 原生插件树的一部分，直接消费公开的 Session、Storage、
  Tool 和 Event 能力；
- **Standalone Profile**：`0.1.0` 以零 Cordis 依赖的纯 TypeScript 服务核心加 CLI 组装同一组合同，
  通过 Skill、Command 或 CLI 接收 Codex、Claude、Kimi、Grok Build 等 Host 的入站调用；入站方向是
  一等公民和长期形态，不创建或继续 Host Session。

DeepSeek Harness、Codex 或其他 Host 都不拥有任务生命周期。模型 Tool、Host Skill、CLI、MCP 和 Web
都是 Consumer；它们必须调用同一 Service 和 CurrentView，不得解析另一 Consumer 的展示文本或复制
授权与 Provider 映射逻辑。Hufu 不修改 DeepSeek Harness 的 Agent Loop。

Hufu 词汇与 DeepSeek Harness 既有服务的映射如下。同名不同义的条目必须使用 `ctx.hufu*` 前缀
注册并保持语义隔离，禁止裸名注册：

| 上游 seam | 上游语义 | Hufu 对应概念 | 处理 |
| --- | --- | --- | --- |
| `ctx.goals` | 同一 Session 内的事件溯源目标域 | 跨 Session、项目级 WorkItem/objective | 改名隔离，Runtime Module 需给出显式映射 |
| `ctx.todo` | Session 内待办 | WorkItem（生命周期归任务正本） | 改名隔离 |
| Workspace（`ctx.workspaceRegistry`） | 用户工作目录的持久记录（uuid + 路径） | 分配给 Owner 的工作场所绑定 | 改名隔离，二者不得在同一 Context 内混用 |
| `ctx.storageDomain` | Host 持久化边界 | Hufu StorageDomain 的宿主 Provider | 复用（经 Hufu StorageDomain 合同包装） |
| Session 服务 | Host Session 生命周期 | SessionBinding 的观测来源 | 引用（只读观测，不拥有） |
| `ctx.commands` / `ctx.skills` | Host 命令与技能注册 | Hufu Consumer 的注册入口 | 复用（注册 `ctx.hufu*` 命名条目） |
| `ctx.schedule` / `ctx.jobs` | Host 后台调度与工作 | 无对应（V1 无后台） | 无关，不得用于 Hufu 语义 |
| `ctx.credentials` | Host 凭据管理 | Provider 凭据的常规机制 | 引用（Hufu 不存储凭据） |
| `ctx.invariants` | 包级不变量注册 | Hufu 不变量的运行时表达 | 复用（DeepSeek Profile 下注册部分不变量） |

事件分为三个层次，不能因为名称相似而混用：

1. **Hufu DomainEvent**：进入 Hufu Ledger 或 StorageDomain 的持久领域事实；
2. **Cordis Event**：插件树内部的瞬时通知，卸载 Listener 不删除已经持久化的事实；
3. **DeepSeek Harness SessionEvent**：只使用目标版本公开支持的词汇。`0.1.0` 不假设外部插件
   可以向 Harness Session Log 增加任意自定义事件类型。

## 任务正本

每个 Project 恰好存储一个 `task_authority` 值。

`0.0.1` 的 `source=native|external` 迁移为版本化 Project 合同：`native` 可以映射为 `local`；
`external` 不能可靠推断 GitHub 或 GitLab，必须要求显式选择并在缺失时 fail closed。

### GitHub 与 GitLab

原生 Issue 保持权威性。ProviderAdapter 可以读取有界 Projection，其中包含身份、标题或目标、
视图所需状态、依赖引用、原始 URL 和观测时间。它不得把 Provider 状态转换追加到本地 Ledger，
伪装成 Hufu 自己拥有的事件；V1 不暴露 Issue 写方法。

决策合同中的 `authoritative_state` 是 `AuthoritySnapshotRef`：只携带 `task_ref`、Provider revision
或 digest、`observed_at` 和 freshness，并按需解析最小状态。它不是复制后的 Issue 正文、状态流或
Hufu 自有 WorkItem 生命周期。

### Local

Hufu 通过逻辑 append-only Event Ledger 拥有 WorkItem 生命周期。Standalone Profile 的物理格式是 JSONL；
DeepSeek Profile 可以在 Hufu StorageDomain 后使用已验证的 Host Storage Provider。当前视图通过折叠
有序记录重建，记录不得原地修改。损坏、冲突或不支持的记录必须 fail closed，不得静默修复。

`0.1.0` 的 Local authority 是单安装、单写者边界，不提供跨机器同步。每次追加必须先确认唯一写者，
并分配 Ledger 范围内的权威追加顺序；无法建立全序、检测到并发写入或记录冲突时停止写入。

当 Project 声明 `github` 或 `gitlab` 正本时，本地 Ledger 不能替代外部 Issue。

## Runtime 与 Engine 插件

未来的 RuntimeProvider 负责 Host Session 的创建、继续、消息投递、观测和终止能力。EngineProvider 负责目标推进、
步骤选择、恢复和可选调度。二者通过供应商中立记录暴露来源身份、观测时间、目标身份和输入身份，
但都不加入 `task_authority`，也不能从 Receipt、Journal 或历史运行推导授权。

DeepSeek Profile 优先使用 DeepSeek Harness 原生 Service/Event；Standalone Profile 的 `0.1.0`
只提供入站 Consumer 和手工信息包路径。创建、继续或投递其他 Host Session 的出站 RuntimeProvider
必须由后续独立 Module 和授权合同交付。`0.1.0` 可以生成下一步指令并记录消息驱动的执行事实，
但不自动启动 Agent，也不提供后台调度。

LoopX 是可选 `engine-loopx` Provider 和机制来源，不是只读 Provider，也不是任务正本。其 Goal、Todo、
Registry、Scheduler、Quota 或 Policy 只有通过 Hufu Engine Service、独立 Module Issue 和边界测试后
才可以分阶段采用，且不能取得外部 Issue 生命周期或 `commander` 授权的所有权。

## Renderer 边界

CLI 和 Web 工作台查询同一个应用视图，可以渲染或计算：

- 来源和 freshness；
- Milestone 与 WorkItem 关系；
- 当值角色和 SessionBinding；
- 从事实三轴派生的 `fact_status`、`blocked_by`、`unblocks`、`next_action` 和 ETA；
- Evidence 与 Handoff 摘要；
- 有界、可由用户复制的下一步指令。

Renderer 不存储独立生命周期状态。派生值必须标识其输入并能够重建。
未来如引入 UI 偏好，它仍然只是呈现数据，不能改变任务事实或授权事实。

## 角色与连续性模型

| 角色 | 范围 | 不变量 |
| --- | --- | --- |
| `commander` | 人类、跨项目 | 最终目标和授权来源。 |
| `advisor` | 一个 Project；同一身份可服务多个 Project | 启用参谋协作的活跃 Project 恰有一个当值绑定；沟通和建议，不拥有交付状态。 |
| `project_lead` | 一个 Project | 每个已连接且活跃的 Project 恰有一个当值绑定；只有非活跃时才允许没有。 |
| `mission_lead` | 临时 WorkItem 集合 | 作为集成出口，但不替代各 WorkItem 的 Owner。 |
| `owner` | 一个 WorkItem | WorkItem 可执行时恰有一个当值绑定。 |
| `auditor` | 一项验证结论或风险范围 | 只有验收风险需要时才保持独立。 |

RoleBinding 指向 SessionBinding 和 Workspace。换届创建带有
`supersedes=<prior_binding_id>` 的新绑定并关闭原当值绑定，不复制 WorkItem、Issue、目标、授权、
Evidence 或 Provider 状态。

AgentIdentity 只说明由哪个 Host 或执行节点报告了身份，不授予角色。提示词中的角色声明是绑定申请；
Hufu Role Service 必须以现有目标、授权范围和当值 RoleBinding 校验该 Session 可以执行的动作。

**冷启动序列**：`connect` 之后、任何 RoleBinding 存在之前，Ledger 按固定顺序追加：Project 连接
记录、`commander` 身份声明与首个 `AuthorizationGrant`、首个 `project_lead` RoleBinding。引导事件的
`actor_binding_ref` 允许指向同一引导事务内声明的 `commander` 身份记录；引导事务之外的事件必须
引用既有绑定。`commander` 是人类身份记录，不要求 SessionBinding。

有效权限按交集计算：

```text
commander 明示授权
∩ Hufu authorization_scope
∩ RoleBinding 资源范围
∩ Host 或 Runtime 实际能力
∩ 操作系统、沙箱、审批与组织策略
```

角色卡、专家席位、模型意见和多数票均不能扩大该交集。

产品文案可以把当值 `project_lead` 或 `mission_lead` 显示为“PM”或“将军”，但领域模型不增加新角色。
前者只能通过自身 RoleBinding 附加 `EXECUTION_ENVELOPE`；实际执行的 `owner`，或承担 Mission 集成的
`mission_lead`，通过自身 RoleBinding 提交 `ROUTE_ACK`。换届后使用新的 SessionBinding 和 Envelope
引用同一个 decision stream，不复制裁决正文；新执行绑定必须重新 ACK。

## 事实与事件模型

Hufu 区分三类信息：

1. **权威事实**：从已声明 Provider 读取的外部 Issue 事实，或正本为 `local` 时的本地 WorkItem 生命周期记录。
2. **自有观测**：Hufu 的 Run、Session、Workspace、Evidence、Receipt、Handoff、RoleBinding、
   决策传递记录和真实墙钟事件；未来存在已接受外部 Effect 时，还包括其 EffectReadback。
3. **派生事实**：从已命名输入计算出的依赖、阻塞、下一步、ETA 和摘要视图。

每项重要事实分别携带 `fact_class=authoritative|observed|derived`、
`availability=available|unavailable|data_insufficient|conflict` 和
`freshness=fresh|stale|unknown|not_applicable`。Renderer 可以由三者生成 `fact_status`，但不能把该标签
写回为新事实。未知、冲突或过期数据必须保持显式。Hufu 不根据周期快照合成一套 Provider 事件流。

### 路线建议与依赖

`DependencyEdge` 只有在 `because` 能够指出缺失前置条件将使哪个具体动作不安全或不可执行时，
才能表达 `blocks`。未满足该测试的关系不会阻塞工作；图级 `executable_frontier` 从有效边派生，
不拥有 WorkItem 生命周期。

`RouteRecommendation` 只引用 business outcome、权威状态和验收指标，说明建议路线、最简安全路线、
拒绝更简单路线的理由以及是否需要历史上下文。它不得复制来源正文，也不得产生授权。
只有 `commander` 或既有授权明确指定的发布者完成裁决后，建议才可以成为 `DECISION_PACKET`；
推荐意见、canonical 决策与 `authority_scope_ref` 是三个不同概念。

未来 Advisor 插件可以拥有 `CorrectionObservation` 观测流，记录人类纠偏及其适用范围、反例和预期效果；
纠偏后的路线、实际效果和规则提升分别以新事件表达，不能由一次 Observation 自动修改外部状态或核心规则。

### 零拷贝决策流

这里的“零拷贝”是语义和持久化所有权约束，不是字节层零复制。一个 `decision_id` 只有一条 canonical
decision stream：Ledger 完整保存一次初始 `DECISION_PACKET`，后续版本通过 `DECISION_DELTA` 物化；
Envelope、ACK、Handoff、Session 和 Renderer 只保存 `{decision_id, version, content_digest}` 或其他稳定引用。
跨 Host 的临时导出和缓存必须可重建、校验 digest 并标记为 non-authoritative。

```text
task_authority WorkItem / Projection
                 |
        AuthoritySnapshotRef
                 |
     DECISION_PACKET v1  <--- RouteRecommendation + 人类裁决
                 |
        EXECUTION_ENVELOPE  -- 只附执行绑定
                 |
             ROUTE_ACK      -- 非审批 readiness observation
                 |
       Run / FACT_DELTA / EFFECT_DELTA
                 |
        DECISION_DELTA      -- 需要时物化 vN+1
```

所有持久记录使用共享 Event Envelope，至少包含 `event_id`、`event_type`、`event_schema_version`、
Ledger 范围的 `ledger_seq`、`occurred_at`、`actor_binding_ref`、`caused_by`、`idempotency_key`
和 `payload_digest`。相同幂等 Key 与相同 digest 返回原结果；相同 Key 与不同 digest、顺序冲突或因果缺失
必须 fail closed。

全部 digest（`payload_digest`、`content_digest`、component digest 和 drift fingerprint）按同一
带版本的规范计算：先以 RFC 8785（JSON Canonicalization Scheme）对 Schema 规定的语义字段规范化
序列化，再取 SHA-256。`idempotency_key` 的构造规则由各事件 Schema 声明，且必须由提交内容
确定性派生。两种 Profile 与全部运行环境必须对相同输入得到逐字节相同的 digest；更换算法必须
提升该规范版本并保留旧版本校验路径。

#### DECISION_PACKET

初始 Packet 包含用户已裁决的字段：

```text
decision_id / version
business_outcome
authoritative_state: AuthoritySnapshotRef
acceptance_metric
simplest_safe_route
verified_facts: FactRef[]
unknowns
non_goals
true_stoplines
authority_scope_ref
evidence_as_of
recheck_when
content_digest
```

`version` 是从 `1` 开始的业务决策版本，与 `event_schema_version` 分离。发布 Event 的 actor、RoleBinding、
时间和授权引用属于来源元数据；Packet 的 `authority_scope_ref` 只能引用已经独立成立的授权。
同一 `decision_id/version` 重复提交相同 digest 是幂等操作，不同 digest 是 conflict。
`content_digest` 对 Schema 规定的规范化语义字段计算，不依赖 JSON 属性顺序或 Storage Provider 的物理字节。

#### EXECUTION_ENVELOPE 与 ROUTE_ACK

`EXECUTION_ENVELOPE` 只包含 `envelope_id`、decision ref/digest、发布与执行 RoleBinding、相关 WorkItem、
SessionBinding、Workspace、路线步骤、输入/Handoff、预算或期限引用，以及可选的
`supersedes_envelope_ref`。Schema 必须禁止 outcome、authoritative state、acceptance、route、non-goals、
stoplines 和授权正文；Envelope 的实际能力范围只能收窄既有授权。

`ROUTE_ACK` 每个 Envelope 开工前最多有一份当前有效记录，至少包含 Envelope/decision 引用、
acknowledger 与 SessionBinding、目标/权威状态/验收的 component digest、`facts_checked_as_of` 和
`added_scope`。`added_scope=[]` 表示理解与既有范围一致，不表示任务已批准或已完成。

非空 `added_scope` 的每项必须包含 `required_because`、Evidence 和请求范围，原因枚举仅允许：

| 原因 | 含义 |
| --- | --- |
| `data_safety` | 不增加该范围会使数据安全动作无法执行。 |
| `actual_permission_gap` | Host、账号、OS、沙箱或审批的真实有效权限不足。 |
| `irreversible_action` | 发现尚未被原授权明确覆盖的不可逆动作。 |
| `effect_readback_unavailable` | 无法读取动作效果，继续执行或重试不安全。 |

非空项即得到派生结果 `scope_change_required`。这不是 `pending/approved/rejected` 审批流；它只使当前
Envelope 不能开始新的 Run，等待既有外部授权更新和新的 Envelope/ACK。决策版本、Envelope、执行绑定、
授权 revision 或三项 component digest 改变后，旧 ACK 保留但不再适用。

#### 三类 Delta 与换版

- `FACT_DELTA` 只追加 live Fact/unknown 引用的 add、supersede 或 withdraw、Evidence/freshness frontier；
  它不复制事实正文，不改写当前版本钉住的 `verified_facts`/`unknowns`，也不改变决策版本。
- `DECISION_DELTA` 包含 `base_decision_ref`、连续的 `new_version`、`supersedes`、作为依据的 Fact Delta、
  仅发生变化的决策字段、`preserve_effects`、`discarded_assumptions` 和新的 content digest。
  同一旧版本只允许一个后继，并使用 `expected_version` 防止并发分叉。
- `EFFECT_DELTA` 按稳定 `effect_id` 记录 Envelope/Run、前一观测、readback、observed result、durability、
  `observed_at` 与 Evidence；没有 readback 时不得声明 `applied`，未知结果不得当作零效果。

Projector 以 v1 和有序 `DECISION_DELTA` 物化 vN。Packet 原文、旧 Delta、Effect 和 Evidence 永不重写；
`preserve_effects` 只引用 Effect/readback，`discarded_assumptions` 只标识不再成立的假设，不删除历史。
版本跳跃、双后继、digest 不匹配或未知必需字段都 fail closed。决策被取代后，旧 Envelope 不得启动新 Run，
但既有 Run、Handoff、Effect 和 Evidence 继续保留。

#### Semantic rebase

`first_durable_effect` 是派生 Effect 观测，只有 readback 证明某 Effect 持久发生且推进权威目标态或验收指标时
才包含 `effect_ref` 和时间。readback 明确覆盖但未发现效果时为 `confirmed_absent`；无法观测或覆盖不足时
分别为 `unavailable` 或 `data_insufficient`，不能用数值 `0` 代替。

漂移检测是 Projector 的纯函数，只在 Event append、Effect readback、`status`、`handoff` 或生成下一步指令
等既有边界同步求值，不创建 Timer、Daemon、Scheduler 或 Heartbeat。硬触发必须满足下列之一：

1. `recheck_when` 已到达，readback 覆盖充分且 `first_durable_effect=confirmed_absent`，同时代码、提交、
   迁移或证书/验证产物等 implementation activity 的 Evidence frontier 按该条件持续增长；
2. 确定性 Evidence 证明当前步骤或效果进入 `non_goals`。

模型判断只产生 `suspected_drift`。硬触发由 `decision_ref + evidence_frontier_digest` 形成 fingerprint，
在同一前沿只消费一次，并在 CurrentView 派生 `semantic_rebase_required`；确认重基时以 `FACT_DELTA`
保存该 fingerprint 和 Evidence 引用。Hufu 停止从旧 Envelope 生成或投递新的前向动作，但仍允许 readback、
遏制、安全恢复与证据采集。它不修改 Issue、不删除代码/提交、不回滚迁移或不可逆 Effect。

若原 `simplest_safe_route` 仍适用，重新附加 Envelope 和 ACK；若任何决策语义必须改变，先追加
`DECISION_DELTA`，再附加 Envelope 与 ACK。两条路径都保留已发生 Effect 和 Evidence，不建立审批状态机。

#### CurrentView

CurrentView 只派生 `decision_ref/content_digest`、Fact/Effect cursor、当前 Envelope、ACK 适用性、
`first_durable_effect`、最新 Delta 引用以及执行护栏。执行护栏表达 `ack_required`、`scope_change_required`、
`semantic_rebase_required`、`stale_envelope` 或 `data_insufficient` 等安全条件，不表达 WorkItem 的
`open/closed/blocked/done`，也不写回 GitHub、GitLab 或 Local 任务状态。

### UsageObservation

Hufu 可以记录自己实际观测到的总墙钟、编排墙钟、调用次数、零效果尝试、协调唤醒和返工事实。
Token 用量还必须记录 `source` 与 `measurement_status`：

- `measured`：Host 或 Provider 原生报告；
- `estimated`：明确标记的估算，不得参与“真实 Token”声明；
- `unavailable`：没有可靠数据，不能用 `0` 代替。

UsageObservation 是效能 Evidence，不是配额、计费或执行授权。V1 不据此实现 Quota 或 Scheduler。

### 本地 JSONL 规则

- 每行一个完整 JSON 对象。
- 使用稳定 Event 身份、每事件类型独立的 Schema Version 和 Ledger 范围的权威追加顺序。
- `occurred_at` 使用真实墙钟时间，不伪造历史时间。
- 仅追加写入；当前视图是回放结果。
- 对未改变的有效 Ledger 进行确定性回放。
- 对畸形、不支持或因果无效的输入显式失败。
- Journal 记录不授予授权，也不能证明未观测到的 Effect 没有发生。
- 决策初始正文只完整追加一次；后续换版由有序 `DECISION_DELTA` 物化，其他记录只保存引用和 digest。

旧事件只在读取时通过无副作用的纯函数 upcast；原始行永不重写。读取器遇到未知的必需未来版本、
无法建立全序或不支持的强制字段时 fail closed。`writer_id` 或每写者局部序号不能单独替代 Ledger 全序。

以下工程语义是可验收合同，不是实现便利：

- **事件身份与全序**：每条事件带稳定 `event_id`、每事件类型独立的 Schema Version 和 Ledger 范围的
  `ledger_seq` 权威全序。同毫秒或时钟回拨时以 `ledger_seq` 为准；`occurred_at` 只是观测时间，
  不参与排序。
- **单写者排除**：追加前必须取得 Ledger 目录内的独占锁（以独占创建语义实现，Windows 与 POSIX
  行为一致；具体参数由 Ledger Module 的 Plan 固定）。取锁失败即拒绝写入，不排队、不静默接管。
- **撕裂写入策略**：文件中间出现畸形行时整个 Ledger 判定为损坏，读取与写入 fail closed；仅当
  最后一行因崩溃截断时，读取器把它报告为未完成追加（`availability=conflict`），`doctor` 可以
  提出显式截除建议，由操作者确认后执行并追加修复事件，不静默修复。
- **`writer_id` 只用于检测**：它标识写者身份、辅助冲突诊断，不能代替 Ledger 全序，也不能使
  并发写入合法化。
- **角色唯一性是回放检测**：唯一当值 `project_lead`、`owner` 等不变量在回放时检测，冲突以
  `availability=conflict` 暴露并 fail closed，不构成跨机器或分布式强制。

Standalone Profile 的 `0.1.0` 本地正本使用上述 JSONL。DeepSeek Profile 的跨 Session 项目事实可以在
Hufu StorageDomain 后使用 DeepSeek Harness JSON Storage Provider，但仍遵守相同 append-only 事件语义。
DeepSeek Session Log 只保存当前 Session 可重建的执行事实和投影，不能单独拥有 Project Goal、
WorkItem 或 RoleBinding 生命周期。CurrentView 必须带 `view_schema_version`；两种 Profile 对同一固定、
版本化事件夹具进行规范化后必须得到结构相等的视图。Host 无法观测的字段保持 `unavailable`，
不要求不同序列化实现产生逐字节相同的输出。

重试外部 Effect 前，应用使用 `effect_id` 或等价稳定 Key 读取目标状态。
结果作为观测保存；Hufu 不声称 exactly-once。

## 技术基线与 V1 组件边界

目标实现采用 Node.js、严格 TypeScript、ESM 和 pnpm。领域核心与 `0.1.0` Standalone Profile
零 Cordis 依赖；Cordis 是目标组合层的插件与生命周期基础，随 DeepSeek Profile Module 引入。
精确版本、Node 支持范围和验证过的 DeepSeek Harness 提交记录在首个功能 Plan 和兼容性记录中，
不写死在 Constitution。当前 Python 3.11 CLI 仍是 `0.0.1` 已实现基线，退役条件见 Constitution
交付门禁：首个 TypeScript 实现 Module 合并时以 tag 保留历史并同步替换等价门禁。

```text
Profiles: deepseek | standalone
                  |
          Cordis Context / Bundle
                  |
  +---------------+----------------+----------------+
  |               |                |                |
Authority       Hufu Event      Runtime（未来）  EngineProvider
Providers       + CurrentView   deepseek/...     native/loopx
  |               |                |                |
github/        StorageDomain     Session API     typed result /
gitlab/local   or JSONL          and Events      recovery
                  |
       Tool / CLI / MCP / Web Consumer
```

依赖方向指向供应商中立 Service Definition。Provider SDK、Web Framework、Agent Runtime Package 和
LoopX 实现只存在于各自 Provider 插件中，不得反向进入合同层。

## 本地运行态与安全边界

Standalone Profile 的本地运行态位于 `.hufu/`，并排除在版本控制之外；DeepSeek Profile 的项目事实
位于 Hufu StorageDomain 后的已验证 Host 存储。连接配置可以保存公开仓库身份和任务正本选择，
但凭据继续由 Provider 的常规凭据机制管理，绝不写入项目文件或 Ledger。

Web 工作台默认绑定 `127.0.0.1` 并以前台方式运行。V1 不提供 Daemon、自动启动、远端绑定、
认证服务、Telemetry 或后台 Scheduler。

## 外部机制采用边界

Hufu 可以采用公开项目中经验证的 typed result、Receipt、稳定 Effect 身份、readback、有界 timeout、
阶段 Journal、no-progress backoff 和 benchmark，也可以在后续 Engine Module 中评估更完整的 LoopX
Goal、Scheduler 或控制机制。采用边界是不把外部 Registry、Goal/Todo、Lease、Scheduler、Heartbeat、
Quota 或 Policy 直接变成 Hufu 核心、任务正本或授权来源，而不是永久禁止这些能力。

小型、供应商中立的合同优先在 Hufu 中重新实现。确实复制或改编源码时，必须隔离来源、保留适用许可证
和归属、更新 NOTICE，并以特征测试证明没有把原项目的状态所有权一并带入。每一批采用都要记录墙钟、
质量、零效果尝试和可取得的 Token，连续三轮无可解释净收益时停止扩充。

## 未来关键决策会商插件

关键决策会商是未来可卸载插件，不是核心角色、任务正本或 `0.1.0` Runtime。它把“研究视角”和
“实际运行 Host/模型”建模为两条正交轴：

```text
Skill / Host Command Consumer
             |
     DecisionCouncilService
       /                 \
RoleCatalogProvider   ParticipantRuntimeProvider
       \                 /
        CouncilSeat + ParticipantSubmission
                     |
          CouncilReport -> advisor -> commander
```

- `RoleCatalogProvider` 只发现当前 Host 真正可用的角色元数据；磁盘中存在角色卡不等于运行时可调度。
  原始角色卡始终是不可信数据。Provider 只允许把角色标识、单一研究 lens、2–4 条问题相关约束、
  版本和 digest 派生为 `ResearchLens`，丢弃工具、网络、写入、RoleBinding 和权限文字；该 Lens 随
  `CouncilPlan` 由用户确认后才能进入受信会商模板，不把整张角色卡或整个角色库注入上下文。
- `ParticipantRuntimeProvider` 对每个 Host 分别声明 fresh Session、resume/send、结构化输出、取消、
  工具策略、Token、模型身份和沙箱能力。缺少能力时返回类型化 `unavailable` 或改用手工信息包，
  不能用 shell 文本把不同 Host 假装成等价实现。
- `DecisionCouncilService` 冻结 `DecisionBrief` 和 `CouncilPlan`，默认安排 3–5 个稀疏席位。
  第一轮席位互不可见；只有实质分歧值得解决时才进行最多一轮质询。
- `CouncilSeat` 是临时研究席位，不是 RoleBinding；`ParticipantSubmission` 与 `CouncilReport`
  只包含可审阅主张、简要理由、Evidence 引用、反例、未知项和类型化状态，不要求或保存隐藏思维过程。

会商的授权绑定 `plan_digest`，限制 Runtime、参与身份、数据分类、Context 引用、工具与网络、
副作用、调用次数、墙钟、Token 或费用、有效期和保留策略。计划变化必须重新授权。
每个席位记录 `independence_status=verified|declared|unknown`；多个 CLI 不自动等于多个独立模型。
席位失败、超时、限流、身份未知或最低覆盖不足必须出现在 barrier 和报告中。

结果按实际覆盖分级：多角色单模型为“多视角会商”；多个 Runtime 但模型独立性未知为
“多 Runtime 复核”；模型身份和独立性均已验证后才是“已验证多模型复核”；前者与多角色同时满足
才是“双轴会商”。

会商事件使用 Hufu 自有 `hufu/council/*` DomainEvent 命名空间，不伪装成任意 Host 的 SessionEvent。
插件卸载会停止新调用并撤销运行时 Effect，但不会删除已经持久化的报告或回执；撤回、取消或取代
必须通过新的 append-only 事件表达。会商输出是 `derived/advisory`，不修改 Issue、不产生授权或验收。

第一阶段只生成有界问题包并导入人工启动 Session 的结构化意见；Host 原生召集和多 CLI 自动扇出
分别经过后续 Module、失败测试、权限审查和效能试点后才可启用。

## 上下文与效能协议

所有 Consumer 采用 pull-first：先返回 compact CurrentView、引用和 freshness，仅在具体动作需要时
解析选中的 Issue 片段、Evidence 或角色摘要。外部 Issue、角色卡和模型响应保持为带来源的引用数据，
不得拼接进系统指令或授权体。

一个效能试点从目标被接受到 Handoff 与验收结论被接受。与同类人工 PM 或单 Agent 基线比较时，
分别记录规划、执行和总墙钟、人工协调时间、零效果尝试、协调唤醒、返工、设置成本、结果缺陷和
可取得的 Provider 原生 Token。结论使用 `NET_BENEFIT`、`NO_NET_BENEFIT`、`TRADEOFF`、
`DATA_INSUFFICIENT` 或 `FAIL`；连续三轮无净收益只暂停对应新增能力，不用更多基础设施掩盖失败。

## 双仓边界

Hufu 仓库包含：

- 产品和架构正本；
- Constitution 和 ADR；
- Spec Kit 功能产物；
- 实现和测试；
- 理解已采纳行为所需的简短、公开安全的来源说明。

外部 Mirror、长篇研究、横向比较、内部项目经验和未采纳方案继续留在独立研究环境。
Hufu 不得包含其本机路径、私有标识、凭据、服务器详情或内部方法论正文，
也不得在本仓库中创建 gitignored 的研究或源码 Mirror 目录。

## 公开项目交付流程

Hufu 自身仓库唯一使用 GitHub 管理代码和进度，并使用 GitHub 官方 Spec Kit：

```text
Milestone
  -> 路线图 Issue（只索引 Module 和依赖）
  -> Module Issue
  -> specs/<feature>/spec.md
  -> plan.md + 设计合同
  -> tasks.md
  -> branch
  -> Pull Request
  -> merge
  -> Issue 自动关闭
```

GitHub 跟踪进度和依赖状态；`specs/` 包含功能合同和可执行拆解；
仓库级 `tasks/` 文件仅为历史指针。完整 Spec Kit 产物以 Module Issue 为单位；父 Module 已覆盖的
小型子任务、Bug 和文档修正可以引用父合同，不复制一套平行 Spec。

## 0.1.0 分阶段集成

发布门内的顺序：

1. 设计正本先通过唯一设计 Pull Request 接受。
2. M1：建立零 Cordis 依赖的严格 TypeScript 核心骨架和共享核心合同，同一 Module 内完成
   Python 基线退役与等价门禁迁移。
3. M2：完成 Local authority、Session/Run/Handoff、StorageDomain/JSONL、确定性 CurrentView
   和 `connect`、`doctor`、`status`、`handoff` 有界 Commands。
4. M3：本仓库 GitHub Provider 以只读影子模式交付，并以本项目自身验证同一 CurrentView。

发布门之后的已接受方向按独立 Module 依次评估：

5. 零拷贝决策 Schema、决策增量回放和事件驱动 semantic rebase。
6. 以 DeepSeek Harness 原生插件验证 Tool、受支持的 Session Event、Storage 和卸载清理；
   以 Standalone Profile 的入站 Consumer 验证同一合同不依赖单一 Host。
7. GitLab Provider 以只读影子模式交付并验证同一 CurrentView。
8. `engine-loopx` 先接入 typed result、Receipt/readback 和有界恢复合同，再按试点收益决定扩大范围。
9. 连续三轮代表性试点比较质量、墙钟、零效果尝试、协调唤醒和可取得的实测 Token；
   只有出现可解释净收益，才实现 loopback Web Console 或更高自治能力，否则暂停扩充。

关键决策会商、多 Host 出站 Runtime 和自动 CLI 扇出不在上述 `0.1.0` 顺序内；它们必须另立
Module Issue 和 Spec Kit 合同。

私有试点证据留在其所属环境；公开仓只保存脱敏方法、聚合结果和已采纳结论。

## 与初始实现的关系

版本 `0.0.1` 只实现最初的不可变 `TaskEnvelope` 验证和确定性 CLI。
本文所述 `0.1.0` Cordis-first 架构是候选规划范围，不表示 Node/TypeScript、DeepSeek 插件、
Standalone Profile、零拷贝决策传递、LoopX Engine 或 Provider 已经实现，也不表示已经获得远端进度授权。
每个 Module 必须通过独立的已接受 Issue、Spec Kit 产物、失败测试、最小实现和可审阅证据交付。
