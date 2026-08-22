# 产品规范

状态：产品定位已由 [ADR 0006](adr/0006-upstream-positioning.md) 接受；`0.1.0` 仍未发布
最后更新：2026-08-23
当前实现：TypeScript 领域核心、`hufu validate`、本机 `local` 账本与有界命令
（含 `hufu decide` 零拷贝决策流）、本公开仓 GitHub 只读投影、GitLab 只读投影，以及 DeepSeek 原生插件包 `hufu-dsh`。
会商、网页与出站 Runtime 不是已接受方向。效能试点合同已交付为记录与扩充门禁，不表示网页已实现，也不表示 `0.1.0` 已发布。

## 产品目标

Hufu 是一个 Cordis-first、供应商中立的 AI Agent 交付协调插件系统。它为操作者提供目标、授权、
任务正本、责任角色、当前执行事实、证据、阻塞和交接的一体化可追溯视图，同时避免创建第二套事实正本。

本公开仓库的第一读者是维护者自身的交付工作流：文档正本默认使用简体中文。只有当出现真实的
外部可安装插件用户时，才补充英文入口。这是一项已裁决的产品定位，不是文档语言遗漏。

Hufu 是 LoopX 下游的严格项目协调 Provider，不是第二套长任务控制面。`0.1.0` 不是无人值守控制平面；
它不会推导授权、静默复制 Provider 状态、后台调度或自动启动 Agent。

Hufu 还要让同一项裁决跨 PM、执行 Leader、Session 换届和不同 Renderer 传递时不再反复改写。
它把人类已作出的可执行裁决保存为一份 canonical `DECISION_PACKET`，下游只附加执行引用、路线确认
和事实、决策、效果增量；这里的“零拷贝”指决策语义只有一份正本，不承诺操作系统或缓存层的字节零复制。

`0.1.0` 的迁移目标是兼容“外部 Issue 正本 + 人工 PM 协调”的现有项目。Hufu 先以只读影子模式
生成统一当前视图和交接事实，经过代表性试点证明净收益后，才逐步替代人工状态汇总、催办和交接整理；
它不替代外部 Issue 生命周期、人类授权、代码审查或发布门禁。

## 用户与核心工作

| 用户 | 核心工作 |
| --- | --- |
| `commander` | 确定最终目标和授权边界，并审阅重大变更。 |
| `advisor` | 作为一个 Project 的唯一人类交互参谋，澄清目标、提出路线和换届建议，但不拥有交付。 |
| `project_lead` | 维护项目的唯一当前视图、暴露风险并协调下一步。 |
| `mission_lead` | 集成横跨多个 WorkItem 的临时 Mission。 |
| `owner` | 在已接受范围内执行一个 WorkItem，并产出 Evidence 或 Handoff。 |
| `auditor` | 在风险需要职责分离时独立验证敏感结论。 |

操作者的主要工作是：

1. 连接仓库并声明唯一任务正本。
2. 判断任务事实是权威值、派生值、新鲜值、过期值还是不可用值。
3. 查看唯一当值 Project Lead 以及每个可执行 WorkItem 的唯一 Owner。
4. 理解依赖、阻塞、Evidence、ETA 和下一项已授权动作。
5. 生成一段可以粘贴到目标 Agent Workspace 的有界指令。
6. 在 Session 或 Owner 换届后继续工作，而不重建任务或授权。
7. 把已经裁决的目标、目标态和验收按引用交给执行者，并在开工前发现真实范围缺口。
8. 在实现活动持续增长却没有可确认 durable Effect 时停止沉没实现，回到最短安全路线。

## 使用模式与 Host 边界

Hufu 的目标使用模式是 Cordis 插件组合，而不是让每个 Host 分别实现一套 Hufu 逻辑：

- 在 DeepSeek Harness 中，Hufu 作为原生 `dsh-plugin` 加载，通过公开的 Service、Event、Session、
  Storage 和 Tool 边界工作；
- 在 Codex、Claude、Kimi、Grok Build 等 Host 中，入站方向（Host 通过 Skill、Command 或 CLI
  调用 Hufu Service）是一等公民和长期形态，不是过渡设计。创建、继续和投递 Host Session 的
  出站 RuntimeProvider 在 ADR 0006 之后不是已接受方向，不得因本段文字自行实现；
- Host Skill、模型 Tool、CLI、MCP 和 Web 是不同 Consumer，共享同一 CurrentView 和有界 Command，
  不得互相解析展示文本或复制业务状态。

每次接入必须区分 AgentIdentity、RoleBinding 和 SessionBinding。用户在提示词中声明“担任参谋”
只是角色申请；只有现有授权范围内的当值绑定才能让该 Session 以 `advisor`、`project_lead` 或其他角色工作。
DeepSeek Harness 或其他 Host 都不是任务正本，Hufu 也不修改其 Agent Loop。

一次动作的有效权限是 `commander` 明示授权、Hufu 结构化 `authorization_scope`、RoleBinding 资源范围、
Host 实际能力以及操作系统、沙箱和审批策略的交集。任何 Adapter 都不能扩大其中任一边界。

## 任务正本模型

每个已连接 Project 恰有一个 `task_authority`：

| 正本 | 生命周期所有者 | Hufu 行为 |
| --- | --- | --- |
| `github` | GitHub Issue | 提供带原始链接和 freshness 的只读 Projection。 |
| `gitlab` | GitLab Issue | 提供带原始链接和 freshness 的只读 Projection。 |
| `local` | Hufu append-only Ledger | 拥有并回放本地 WorkItem 生命周期。 |

LoopX 不是任务正本。Hufu 是 LoopX 下游的严格项目协调 Provider：LoopX 拥有 Goal、Todo、Quota、
Scheduler、Heartbeat、长任务恢复和 Host 执行循环；Hufu 拥有 TaskAuthority 适配、canonical
Decision 引用、Role/SessionBinding、逐槽三轴 CurrentView、Evidence、Receipt、Effect readback
和企业项目 Renderer 合同。已交付的 `loopx-mechanisms`（#9）仍须显式选用，只记录类型化结果与回执，
不得把 LoopX Registry、Goal/Todo 或 Scheduler 映射为任务正本或授权。
不得自行实现通用 Goal/Todo/Scheduler/Heartbeat、PM Engine、Wave Engine 或完整 Web 控制面。
Hufu↔LoopX 桥接须另立 Module，本规范不授权现在实现。

UI 同样不是任务正本。它只是权威事实、观测事实和派生事实的 Renderer。

## V1 范围

### 0.1.0 发布门与后续 Module 验收

`0.1.0` 的范围分为两层，避免把一个完整产品写成一个版本：

- **发布门（`0.1.0` 必须交付）**：本机可用的只读影子纵切——`connect`、`doctor`、`status`、
  `handoff` 四个有界命令；`local` 与本仓库 GitHub 只读投影两种任务正本按交付顺序先后进入；
  CurrentView 能区分 `fact_class`、`availability` 和 `freshness` 三轴。
- **后续已交付 Module（不阻塞 `0.1.0` 发布）**：零拷贝决策流已由 GitHub Module Issue #6
  在 `0.1.0` 系列交付（Envelope、ACK、三类 Delta、semantic rebase 护栏）。DeepSeek 与 Standalone
  双 Profile 夹具对等及插件真装真卸已由 #7 交付。GitLab 只读投影已由 #8 交付。LoopX 第一批机制已由 #9
  交付为须显式选用的机制记录口（不是任务正本）。效能试点记录与扩充门禁已由 #10 交付。
- **ADR 0006 之后仅可设计、尚未授权实现的能力**：自建 GitLab AuthorityProvider、
  Hufu↔LoopX 的 Authority / Decision / Evidence 桥、通过效能门禁后的企业项目 Renderer。
  本规范不授权现在实现它们。原自行建设的 M10–M15（通用 Goal/Todo/Scheduler/Heartbeat、
  PM Engine、Wave Engine、完整 Web 控制面）以及关键决策会商、loopback Web Console、
  出站 Runtime 不再作为已接受方向。
  上述三类若开工，须另立独立 Module Issue 与 Spec Kit 合同并各自验收。

发布门若触碰决策记录，至多要求“一份裁决只完整保存一次，`status` 与 `handoff` 只传引用”。
完整决策状态机已由后续 Module #6 交付，仍不阻塞 `0.1.0` 发布门。

### Project 连接与健康检查

- `hufu connect` 记录本地 Project 连接、仓库身份和一个 `task_authority`，但不存储 Provider 凭据。
- `hufu doctor` 报告配置缺失、不支持的正本、本地状态不可访问、观测过期或不安全的监听配置，
  且不修改外部系统。
- Standalone Profile 的本地运行态位于 `.hufu/`，并排除在版本控制之外；DeepSeek Profile 的项目事实
  位于 Hufu StorageDomain 后的已验证 Host 存储，两者都不进入公开仓库正本。
- Standalone CLI 的项目根按 `--project-root`、`HUFU_PROJECT_ROOT`、进程 cwd 的顺序解析；`.hufu/`
  仍位于该根下。未指定时与历史 cwd 行为兼容。不得用配置文件改写落点。
- `local` 正本是单操作者、单安装边界：权威数据位于本机 `.hufu/`，不进入版本控制，也不跨机器
  同步——换机即失是已声明行为，不是缺陷；需要跨机器共享任务状态的项目应选择 `github` 或
  `gitlab` 正本。写入前必须排除并发写者，冲突或无法确认唯一写者时 fail closed。角色唯一性等
  不变量在该边界内由回放检测并以冲突态暴露，不构成分布式保证。
- 从 `0.0.1` 合同迁移时，`native` 可以确定性迁移为 `local`；`external` 无法判断是 GitHub
  还是 GitLab，必须由用户显式选择，否则 fail closed。迁移必须提升 Schema Version，不能静默改义。
  该迁移只是信封文档的 Schema 映射；`0.0.1` 没有持久运行态，不存在存量数据迁移。
- 外部引用使用版本化 URI scheme：`github:<owner>/<repo>#<issue>` 和
  `gitlab:<group>/<project>#<issue>`。`0.0.1` 的自由文本 `external_ref` 不满足该 scheme 时
  不得猜测映射，必须由用户显式补全，否则 fail closed。

### WorkItem 与生命周期

- GitHub 和 GitLab WorkItem 是原生 Issue 的只读 Projection，保留原始链接、来源身份、观测时间和 freshness。
- Local WorkItem 使用由 Hufu 拥有的逻辑 append-only Event Ledger；Standalone Profile 的物理格式为
  JSONL，DeepSeek Profile 可以在 Hufu StorageDomain 后使用已验证的 Host Storage Provider。
- Hufu 不把原生 Issue 状态转换复制为第二套权威生命周期。
- 外部 Issue 的文本和附件是带来源的不可信数据，只能作为引用事实进入最小上下文，不能成为指令或授权。
- Hufu 可以计算 `blocked_by`、`unblocks`、`next_action` 和面向用户的 `fact_status`，但输入与推导过程
  必须可追溯。
- 只有当一条依赖能够说明“缺少哪个前置条件会使哪个具体动作不安全或不可执行”时，
  `DependencyEdge` 才能标记为 `blocks`；否则它只是非阻塞关系。可执行前沿由有效依赖图派生，
  不复制成新的任务状态。

### 零拷贝决策传递

本节合同已由 GitHub Module Issue #6 / `specs/005-zero-copy-decision` 在 `0.1.0` 系列交付，
仍不进入 `0.1.0` 发布门（见「0.1.0 发布门与后续 Module 验收」）。

每个需要执行的裁决使用一个稳定 `decision_id`。Ledger 只完整保存一次初始 `DECISION_PACKET`；
同一裁决的后续语义版本由连续的 `DECISION_DELTA` 确定性折叠生成。CurrentView 可以物化最新完整版本，
但该物化结果和跨 Host 临时缓存都可重建、可校验且不是第二份正本。

`DECISION_PACKET` 必须包含：

- `decision_id`、业务 `version` 和独立的 Schema Version；
- `business_outcome`、`authoritative_state`、`acceptance_metric` 和 `simplest_safe_route`；
- `verified_facts`、`unknowns`、`non_goals` 与 `true_stoplines`；
- `authority_scope_ref`、`evidence_as_of` 和 `recheck_when`。

`authoritative_state` 只能是指向既有 `task_authority` Projection 的最小引用，包含来源身份、来源 revision
或 digest、`observed_at` 和 freshness；它不复制 Issue 正文或 Provider 生命周期。`verified_facts` 保存命题
和 Fact/Evidence 引用，不复制原始证据。`authority_scope_ref` 指向已经独立成立的授权，Packet 本身不授予权限。

当值 `project_lead`，或负责 Mission 集成的 `mission_lead`，可以附加 `EXECUTION_ENVELOPE`，其中只保存
决策引用及 digest、相关 WorkItem、RoleBinding、SessionBinding、Workspace、路线步骤、输入、Handoff
和有界预算或期限引用。它不得重复保存或覆盖目标、权威状态、验收、最短路线、非目标、停止线或授权正文。
产品界面中的“PM”或“将军”只是上述既有角色的显示称谓，不新增核心角色。

实际执行的 `owner`，或承担多 WorkItem 集成的 `mission_lead`，必须在每个 Envelope 开工前提交一次
非审批性的 `ROUTE_ACK`。ACK 通过 `decision_id/version/content_digest` 确认 `business_outcome`、
`authoritative_state` 和 `acceptance_metric` 未改变，并默认返回 `added_scope=[]`。同一 Envelope 的重复提交
必须幂等；决策版本、Envelope、执行 RoleBinding 或关键授权 revision 变化后，需要新的 ACK，旧记录保留但失效。

`added_scope` 非空时，每项都必须包含 `required_because`、Evidence 引用及所请求范围，并且原因只能是：

- `data_safety`：为防止数据泄漏、损坏或不可恢复污染所必需；
- `actual_permission_gap`：实际有效权限不足以执行已裁决路线；
- `irreversible_action`：路线包含尚未被明确覆盖的不可逆动作；
- `effect_readback_unavailable`：无法安全读取动作的真实效果。

原因合法只表示范围缺口表达有效，不表示批准。只要 `added_scope` 非空，Hufu 就必须返回
`scope_change_required` 并停止沿该 Envelope 开工；只有外部既有授权被更新并重新附加 Envelope 后才可继续。
不在白名单中的原因、摘要不匹配或超出 `authority_scope_ref` 的范围必须 fail closed，且不得修改任务状态。

初始 Packet 与 Envelope/ACK 之后只追加三类语义增量：

- `FACT_DELTA`：增加、取代或撤回 live Fact/unknown 引用，更新 Evidence cursor 和 freshness；
- `DECISION_DELTA`：生成 `version + 1`，带 `supersedes`、实际改变的字段、`preserve_effects`、
  `discarded_assumptions` 和新的 content digest；
- `EFFECT_DELTA`：按稳定 `effect_id` 记录执行引用、readback、观测结果、durability 和 Evidence。

同一版本只能有一个合法后继；版本跳跃、双后继、digest 冲突或因果缺失必须 fail closed。
`FACT_DELTA` 不改写当前版本已经钉住的 `verified_facts` 或 `unknowns`，`EFFECT_DELTA` 也不会静默改变
决策语义；这些字段或路线、结果、验收、非目标、停止线、授权引用需要变化时，必须由
`DECISION_DELTA` 形成新版本。`preserve_effects` 只保存 Effect/readback 引用，不复制效果正文；
未知或未完成 readback 的 Effect 继续保持 `unknown`，不得冒充已发生、未发生或数值零。

`recheck_when` 必须使用可确定求值的墙钟、实现活动增长、Evidence frontier 或 Provider revision 条件。
Hufu 只在追加相关事实、`status`、`handoff`、Effect readback 或生成下一步指令等既有交互边界检查漂移，
不使用后台轮询。若 readback 覆盖充分且持续确认尚无首个 durable Effect，同时代码、提交、迁移或证书/验证产物
跨检查点继续增长；或者确定性 Evidence 命中 `non_goals`，CurrentView 必须产生一次幂等的
`semantic_rebase_required` 执行护栏。模型判断只能产生 `suspected_drift`，不能独自硬触发。

semantic rebase 保留已经发生的 Effect 和全部 Evidence，停止旧 Envelope 生成新的前向动作，允许 readback、
遏制与安全恢复，并把下一步指向当前版本的 `simplest_safe_route`。若路线语义必须改变，先追加
`DECISION_DELTA`，再附加新的 Envelope 与 ACK。它不关闭 Issue、不删除代码或提交、不回滚迁移或不可逆效果，
也不建立新的审批状态。

### 角色、Session 与 Workspace

- 启用参谋协作且活跃的 Project 恰有一个当值 `advisor`；同一 AgentIdentity 可以服务多个 Project。
- 已连接且活跃的 Project 恰有一个当值 `project_lead`；非活跃 Project 可以没有。
- 可执行 WorkItem 恰有一个当值 `owner`。
- `mission_lead` 是横跨多个 WorkItem 的临时集成出口。
- 只有当结论风险要求职责分离时，`auditor` 才必须独立。
- 换届建立新的 SessionBinding 并使用 `supersedes`；不得克隆 Issue、目标、授权或 Evidence 历史。

### 执行事实与证据

- Hufu 拥有自己直接观测到的 Run、Session、Workspace 绑定、Evidence、Receipt、Handoff、
  角色绑定、决策传递记录和真实墙钟事件记录。这些属于执行协调事实，不拥有 WorkItem 生命周期。
- 每类 Domain Event 具有独立 Schema Version 和权威追加顺序；旧版本只在读取时通过纯函数 upcast，
  原始记录不得重写。遇到未知的必需未来版本、顺序冲突或无法解释的因果关系时 fail closed。
- Evidence 标识其命题、目标、输入或代码身份、观测时间，以及适用时的生产者或验证者。
- Receipt 是类型化验证声明，不是授权，也不隐含业务完成。
- `0.1.0` 没有外部写回，因此不实现 Effect 执行或重试；它可以记录由 Host 或 Provider 返回的
  `EFFECT_DELTA`。未来若引入外部 Effect，恢复流程必须先执行 readback，且不得声称 exactly-once。
- UsageObservation 区分 `measured`、`estimated` 和 `unavailable`。只有 Host 或 Provider 原生返回的
  Token 用量可以标记为 `measured`；Hufu 不得把字符估算或缺失值冒充真实 Token。

### Tool、命令与工作台

Hufu 对不同 Consumer 暴露同一组有界操作语义：`connect`、`doctor`、`status`、`handoff`。
`hufu serve` 保持拒绝。ADR 0006 废止完整 Web 控制面；企业项目 Renderer 只有通过效能门禁
并另立 Module 后才能评估，本规范不授权现在实现。DeepSeek Profile 把已交付命令贡献为模型
Tool 或 Host Command；Standalone Profile 可以提供等价 CLI。具体包名和安装命令由第一张
实现 Module 的 Plan 在验证 DeepSeek Harness 插件发布方式后确定，本产品规范不提前承诺
尚未验证的安装命令。

若未来企业 Renderer 经独立 Issue 进入实现，首屏仍只显示：

- Project、任务正本和 freshness；
- Milestone 和 WorkItem；
- Owner、Project Lead、Session 和 Workspace；
- `fact_status`、下一步、阻塞和 ETA；
- Evidence 与 Handoff 摘要；
- 原始 Issue 链接和“生成下一步指令”操作。

生成的指令是可供用户复制的文本，绑定到所选 Project、WorkItem、已知事实和授权边界。
V1 不会自动启动 Agent。

**类型化错误分类**：四个命令共享一套带独立 Schema Version 的错误合同。每种 fail closed 情形
映射到稳定的机器可读错误码，至少区分：合同或输入校验失败、任务正本缺失或二义、并发写者冲突、
Ledger 因果或 digest 冲突、不支持的 Schema 版本、观测不可用或数据不足。退出码族统一为：
`0` 成功、`2` 合同或输入无效、`3` 状态冲突或并发拒绝、`4` 观测不可用或数据不足。
错误载荷属于结构化输出；Consumer 不得解析人类可读文本判断失败类别。

**Projection 刷新策略**：Hufu 没有后台刷新和心跳，外部 Projection 只在用户发起的命令边界刷新。
`status` 默认读取本地缓存并展示 `observed_at` 与 freshness；只有显式刷新选项才产生网络读取。
缓存位于 `.hufu/cache/`，属于可重建派生数据。`stale` 判定阈值是 Project 级配置并有默认值，
具体数值由首个 Provider Module 的 Plan 固定；离线或拉取失败时保留旧观测并标记 `stale` 或
`unavailable`，不得静默清空或伪造 freshness。

### 技术约束

- 目标实现使用 Node.js、严格 TypeScript、ESM 和 pnpm。供应商中立领域核心保持零框架依赖；
  `0.1.0` 的 Standalone Profile 是同一核心上的 CLI 组装，不引入 Cordis 运行时。Cordis
  （当前唯一已验证实现为 `@deepseek-ai/cordis`）随 DeepSeek Profile Module 引入，
  精确版本由功能 Plan 和兼容性记录管理。
- DeepSeek Harness 作为原生 Profile；Standalone Profile 必须复用相同领域合同并支持 Windows 与 POSIX。
- Cordis 插件使用 Service Definition、Provider、Consumer、类型化 Event 和可撤销 Effect；
  不修改 Host Agent Loop。
- Standalone Profile 的本地正本使用 append-only JSONL；DeepSeek Profile 可以在 Hufu StorageDomain
  后使用其 JSON Storage Provider。两者必须对同一版本化夹具生成规范化结构相等的 CurrentView；
  Host 无法观测的字段保持 `unavailable`，不以序列化字节相同冒充语义相同。
- Project 级跨 Session 状态不能只存在 Host Session Log；Session Log 只保存可重建的执行事实和投影。
- ADR 0006 之后不把 loopback 工作台或完整 Web 控制面写成已接受方向。若未来企业 Renderer
  经独立 Issue 进入实现，Listener 仍必须默认绑定 `127.0.0.1`。
- `0.1.0` 不引入数据库、Message Queue、Daemon、Scheduler、Heartbeat、Quota Service、
  多主机 Coordinator 或自动后台运行。

## 核心产品实体

| 实体 | 用途 | 正本边界 |
| --- | --- | --- |
| Project | 仓库连接和声明的 `task_authority`。 | 不存储 Provider 凭据。 |
| AuthorizationGrant | `commander` 签发的结构化授权记录：`grant_id`、`revision`、签发人、范围、有效期、`supersedes`。 | 唯一可被 `authority_scope_ref` 引用的授权本体；不由 Journal、Receipt 或角色推导。 |
| Milestone | 从任务正本投影或在本地表达的交付分组。 | 外部生命周期仍归外部系统。 |
| WorkItem | 一项目标、范围、依赖和终止条件的工作单元。 | 生命周期归声明的任务正本。 |
| AgentIdentity | Host 报告的 Agent 或执行节点身份。 | 不等同于角色或授权。 |
| RoleBinding | 角色与 Project 或 WorkItem 的当值关系。 | 不授予目标或授权。 |
| SessionBinding | Session 与 Workspace 分配，包含 `supersedes`。 | 不复制 WorkItem。 |
| Run | 一次有界执行尝试。 | 不拥有长期任务正本。 |
| Evidence | 绑定命题、目标和输入身份的观测。 | 不隐含验收。 |
| Receipt | 类型化验证声明。 | 不产生授权。 |
| Handoff | 已完成工作、剩余工作、风险和下一审阅点。 | 不扩张范围。 |
| UsageObservation | 墙钟、调用和 Host/Provider 报告的 Token 用量。 | 缺失数据不得记为 `0`。 |
| CurrentView | 从权威事实、自有观测和派生事实构造的确定性视图。 | 不存储独立生命周期。 |
| DependencyEdge | 带理由的工作依赖，说明缺失前置如何阻断具体动作。 | 是派生合同，不复制 WorkItem 状态。 |
| RouteRecommendation | Advisor 或会商根据事实形成的候选路线。 | 是派生建议，不产生授权。 |
| DECISION_PACKET | 人类已裁决内容的单一 canonical 基线及其物化版本。 | 引用任务正本和既有授权，不拥有两者。 |
| EXECUTION_ENVELOPE | PM/集成负责人附加的决策执行路由。 | 只引用 Packet，不得重写正文或扩权。 |
| ROUTE_ACK | 执行 Leader 对目标、状态、验收和范围差异的一次确认。 | 是 readiness observation，不是审批。 |
| FACT/DECISION/EFFECT_DELTA | 事实、决策换版和效果 readback 的 append-only 增量。 | 不复制任务正文或另建生命周期。 |

`AuthorizationGrant` 是授权的唯一记录本体：签发人必须可归因到人类 `commander` 或其明确指定的
发布者；范围预留结构化字段（仓库、路径 glob、命令类别），`0.1.0` 允许以自由文本填充但字段
必须存在；修改或收回通过带 `supersedes` 的新 revision 追加表达，不重写历史。`authority_scope_ref`
与“授权 revision 变化后旧 ACK 失效”等语义都以该实体的身份与 revision 为判定依据。

## 用户可见的事实状态

每项重要展示事实使用三条独立字段表达，不再把来源、可用性和时效压进一个枚举：

- `fact_class=authoritative|observed|derived`：事实所有权或计算类别；
- `availability=available|unavailable|data_insufficient|conflict`：当前能否安全使用；
- `freshness=fresh|stale|unknown|not_applicable`：观测时效。

Renderer 可以从三条轴生成面向用户的 `fact_status`，但该标签不是新的正本。UsageObservation 另用
`measurement_status=measured|estimated|unavailable`；缺失事实不得用 `0`、猜测的完成状态或代理计数替代。

`RouteRecommendation` 至少引用 business outcome、权威状态和验收指标，说明建议路线、
`simplest_safe_route`、拒绝更简单路线的具体理由及是否需要历史上下文。它不得复制来源正文，
也不得把尚未解释的 `critical_path` 作为阻塞结论。只有 `commander` 或既有授权明确指定的决策发布者
作出裁决后，内容才进入 `DECISION_PACKET`；推荐、Packet 与授权必须保持可区分。

未来的纠偏学习由 Advisor 插件拥有 `CorrectionObservation`，记录纠偏前路线、人类纠偏、适用范围、
反例和预期效果。纠偏后的路线、实际效果和规则提升必须作为后续独立事件记录；Observation 本身不得
修改外部 Issue、产生授权或自动提升为核心规则。每条纠偏必须可归因到具体人类，Agent 不得自产
自销后回喂；纠偏必须可撤销，撤销后 CurrentView 必须能确定性重建为不含该纠偏的状态。

## Hufu 自身研发流程

Hufu 自身的代码和进度唯一使用 GitHub 管理，并使用 GitHub 官方 Spec Kit，公开仓库遵循：

```text
Milestone -> 路线图 Issue（仅索引） -> Module Issue
          -> Spec Kit spec/plan/tasks -> branch -> PR -> merge -> Issue 自动关闭
```

GitHub Milestone 和 Issue 拥有进度；`specs/` 拥有功能合同；仓库级 `tasks/` 文件只是历史指针，
不能授权工作。完整 Spec Kit 流程适用于具有独立用户价值、跨模块合同或架构影响的 Module Issue；
父 Module 已覆盖的小型子任务、Bug 和文档修正可以引用父合同并采用与风险相称的简化验收。

## 0.1.0 交付顺序

`0.1.0` 按可独立验证的纵切推进，而不是把全部组件塞进第一张实现 Issue。发布门内的顺序：

1. 接受中文产品、架构、Constitution 和 ADR 正本（唯一设计 Pull Request）。
2. M1：建立零 Cordis 依赖的严格 TypeScript 核心骨架、共享核心合同，并在同一 Module 内完成
   Python 基线退役与等价门禁迁移。
3. M2：完成 `local` JSONL Ledger、Session/Run/Handoff、StorageDomain、确定性 CurrentView
   和 `connect`、`doctor`、`status`、`handoff` 四个有界命令。
4. M3：增加本仓库 GitHub 只读 Projection，并以本项目自身为代表性项目验证同一 CurrentView。

发布门之后已交付、且不阻塞 `0.1.0` 的 Module：零拷贝决策流（#6）与事件驱动 semantic rebase、
DeepSeek Profile 原生插件与双 Profile 夹具对等及卸载清理（#7）、GitLab 只读 Projection（#8）、
`loopx-mechanisms` 第一批 typed result 与 Receipt/readback（#9，须显式选用）、代表性效能试点记录与扩充门禁（#10）。
ADR 0006 废止原 M10–M15 自行控制面计划。后续仅可设计、尚未授权实现的能力见上文与
[ADR 0006](adr/0006-upstream-positioning.md)。

除设计正本收敛外，每一实现阶段必须有独立 Module Issue 和 Spec Kit 功能合同。外部试点的内部项目名、
路径、Issue 内容和用量明细不得进入公开仓；公开材料只能保留脱敏方法和聚合结果。

## V1 成功标准

### 发布门（`0.1.0` 必须同时满足）

- 每个已连接 Project 恰好报告一个任务正本，否则 fail closed。
- 支持的 Windows 和 POSIX 环境可以完成 connect、doctor、status 和 handoff 验证，无需后台服务。
- 每个外部 WorkItem 视图暴露原始链接、来源、观测时间和 freshness。
- 对未改变的本地 Ledger 进行回放，得到相同的 WorkItem 和绑定视图。
- 操作者可以从一个 Status 视图识别 Owner、Project Lead、阻塞、Evidence 摘要和下一步，
  不需要查阅第二份 Hufu 任务清单。
- 生成的下一步文本标识所选 WorkItem，且不超出已记录的 `AuthorizationGrant` 范围。
- CurrentView 的每项重要事实可区分 `fact_class`、`availability` 和 `freshness`；
  缺失观测显示 `unavailable` 或 `data_insufficient`，不写成 `0`。
- 每种 fail closed 情形返回稳定的机器可读错误码和约定退出码。
- Provider Adapter 测试证明没有发生 Issue 写回操作。

### 后续已交付 Module 验收（不阻塞 `0.1.0` 发布）

- 同一裁决只有一份初始 Packet 正文；Envelope、ACK、Handoff、Session 换届和 Renderer 只保存引用、
  digest 或增量，不能形成第二份可编辑决策正文。
- 相同合法 Ledger 必须物化出相同 `decision_id/version/content_digest`、ACK 有效性、Effect cursor
  和执行护栏；换版必须保留所声明的 readback Effect 引用及全部历史 Evidence。
- `ROUTE_ACK.added_scope=[]` 才能沿原 Envelope 开工；四类合法范围缺口也只能得到
  `scope_change_required`，不能获得新权限或任务状态。
- 只有完整 readback 证明 durable Effect 尚不存在时，漂移检测才能据此硬触发；缺失观测必须显示
  `unavailable` 或 `data_insufficient`。相同 drift fingerprint 只产生一次 semantic rebase 要求。
- DeepSeek Profile 与 Standalone Profile 对同一版本化事件夹具生成规范化结构相等的 CurrentView；
  Host 特有的不可观测字段明确为 `unavailable`。
- DeepSeek 插件卸载后，其注册的 Tool、Event Listener 和其他运行时 Effect 被可靠清理；
  已持久化事实不被删除，只能通过新的 append-only 事件取消、撤回或取代。
- 可选引擎必须显式选用；TypedResult 与 Receipt 不得成为任务正本或授权；无 complete 读回不得把效果写成已发生、确认不存在或 `0`。
- 网页不是已接受方向；`hufu serve` 保持拒绝。连续三轮代表性对比不能证明净收益时，
  停止扩充 Runtime、Web 或其他控制面。
- 每次试点能够区分任务总墙钟、Hufu 编排耗时、零效果尝试、协调唤醒、返工和可取得的
  Provider 原生 Token；无法取得的用量明确显示 `unavailable`。
- 授权、安全、结果质量和 Evidence 完整性不得因降低时间或 Token 而退化。

### 效能试点协议

一个试点从 `commander` 接受 WorkItem 或 Mission 目标开始，到对应 Handoff 和验收结论被接受为止。
它必须与同类任务的人工 PM 或单 Agent 基线比较，并分别记录规划墙钟、执行墙钟、总墙钟、人工协调时间、
零效果尝试、协调唤醒、返工、设置成本和可取得的 Provider 原生 Token。结论只能是
`NET_BENEFIT`、`NO_NET_BENEFIT`、`TRADEOFF`、`DATA_INSUFFICIENT` 或 `FAIL`，不得用单一 Token 数或
自动化步骤数量宣称成功。某项新增能力连续三轮为无净收益时暂停该能力，不连带否定已经证明有效的核心合同。

各项度量的操作定义：

- **协调唤醒**：为推进同一 WorkItem 而发生的一次人类或 Agent 显式介入（发起命令、发送消息、
  切换 Session），以 Hufu 观测到的命令与 Handoff 事件计数；
- **零效果尝试**：一次结束时没有产生新 durable Effect、新 Evidence 或新决策增量的执行尝试；
- **返工**：针对同一验收目标推翻或重做既有产物的后续尝试，以引用同一 WorkItem 的取代或
  重做事件计数；
- **编排墙钟与执行墙钟**：编排墙钟只统计 Hufu 命令与协调事件之间由操作者驱动的部分；
  模型推理时间归入执行墙钟，Hufu 无法观测时记 `unavailable`，不得摊派估算。

人工基线在私有环境采集；公开仓库只保留上述口径和脱敏聚合结果。

## 未来方向

ADR 0006 之后，后续能力只围绕三类、且都尚未授权实现：自建 GitLab AuthorityProvider、
Hufu↔LoopX 的 Authority / Decision / Evidence 桥、通过效能门禁后的企业项目 Renderer。
原 M10–M15 自行控制面、关键决策会商 Runtime、loopback Web Console 与出站 Runtime
不再作为已接受方向。[ADR 0004](adr/0004-bounded-decision-council.md) 保留为历史候选记录，
不构成开工授权。游戏化界面只能作为 Renderer 研究，不得改变核心合同或状态所有权。

上述三类若进入实现，必须另有已接受 Module Issue、Spec Kit 合同、架构检查，以及能够减少
操作者工作量或执行风险的证据。本规范不因列出它们而授权现在实现。

## V1 明确不做

- 外部 Issue 写回、自动批准、Merge、部署或生产访问。
- 自动启动 Agent 或无人值守后台运行。
- 自动调用多个外部 CLI、跨 Provider 扇出或关键决策会商 Runtime。
- 数据库、Message Queue、Daemon、Scheduler、Heartbeat、Quota、Lease 或多主机协调。
- 第二份 GitHub 或 GitLab Issue 生命周期副本。
- 在 Envelope、ACK、Handoff 或换届包中复制 Issue 正文或重写 `DECISION_PACKET`。
- 让 `ROUTE_ACK` 成为审批流，或用范围缺口理由自动产生授权。
- 用后台 Heartbeat、Scheduler 或周期唤醒检测 semantic drift，或由重基自动删除、回滚既有产物与 Effect。
- 把 LoopX、Agent Runtime 或 UI 视为 `task_authority`。
- 自行实现通用 Goal/Todo/Scheduler/Heartbeat、PM Engine、Wave Engine 或完整 Web 控制面。
- 把关键决策会商、loopback Web Console 或出站 Runtime 当作 ADR 0006 之后的已接受方向。
- 把 MCP 作为必需运行路径，或为每个 Host 复制一套业务逻辑。
- Fork 或修改 DeepSeek Harness Agent Loop 来实现 Hufu 产品行为。
- 分布式 exactly-once 保证。
- 为普通低风险工作强制设置独立 Auditor。
- 为普通工作强制召开参谋会或专家研讨会，或以 Agent 数量、多数票代替证据。
- 游戏化 UI、3D 可视化或以动画驱动的产品机制。
- 在本公开仓库中保存外部源码镜像、私有研究、内部项目材料或凭据。
