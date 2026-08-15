<!--
同步影响报告
- 版本变化：保持 0.1.0
- 修订原则：无
- 修订交付流程与质量门禁：首个 TypeScript 实现 Module 将当前门禁替换为 `pnpm test`、
  `node scripts/check-version.mjs` 与 `git diff --check`；`0.0.1` Python 基线改为由标签
  `v0.0.1` 保留，并从主线移除
- 新增章节：无
- 移除章节：无
- 后续 TODO：无
-->

# Hufu 项目宪章

## 核心原则

### I. 单一任务正本与显式授权

每个已连接 Project 必须恰好声明一个 `task_authority`：`github`、`gitlab` 或 `local`。
GitHub 和 GitLab 拥有其原生 Issue 生命周期；Hufu 必须只把这些 Issue 作为带来源身份和 freshness 的
只读 Projection。只有 `local` 正本可以使用 Hufu append-only Ledger 拥有任务生命周期。

人类 `commander` 始终是最终目标和授权来源。Journal、Receipt、Projection、RoleBinding、
历史 Run、生成指令、专家意见、模型共识或多数票不得产生或扩大授权。该规则防止 Hufu 成为第二套任务系统，
也防止系统从 Evidence 反向推导权限。

每个需要执行的裁决必须只有一个带版本的 canonical 决策正文。下游执行、换届、交接和呈现只能通过
稳定的决策引用与摘要消费它，不得重复改写正文。决策中的权威状态必须引用已声明的 `task_authority`
及其来源版本和观测时间；它不是 Hufu 拥有的任务状态。决策所含的 `authority_scope_ref` 只能引用既有授权，
不能使决策正文、执行包装或路线确认成为新的授权来源。

### II. 正交分离与插件优先

任务正本、执行事实和呈现层必须保持为相互独立的轴。ProviderAdapter 投影权威任务数据；
RuntimeProvider、EngineProvider 或兼容 Adapter 暴露运行能力及执行事实，但不得加入 `task_authority` 枚举。
CLI、MCP 和 UI 等 Consumer 或 Renderer 只调用共享服务并展示派生视图，不得拥有任务状态。

Hufu 必须以 Cordis-first 的 Service Definition、Provider、Consumer、类型化 Event 和可撤销 Effect
组织可替换能力，不得通过修改某个 Host 的 Agent Loop 建立特权核心。“Cordis-first”约束的是
目标组合层与合同形状：供应商中立领域核心必须保持零框架依赖，Service Definition 可以先由
纯语言接口表达；Cordis 运行时只随声明需要它的 Profile Module 引入，不作为领域核心的前置依赖。
Provider 特定状态和 Policy 必须位于相应插件边界之后。LoopX 可以作为 EngineProvider 或机制来源，但不是 `task_authority`；
它引入的能力不得绕过 Hufu 的任务正本、授权和 Evidence 合同。

### III. 公开核心，研究外置

Hufu 仓库必须只包含公开安全的产品正本、架构决策、Spec Kit 产物、源代码、测试，
以及理解已采纳行为所需的简短来源说明。外部源码 Mirror、长篇研究、横向比较、内部项目经验
和未采纳设计必须留在本仓库之外。

公开产物不得包含本机特定路径、内部项目名、Session ID、凭据、私有 Endpoint、客户数据
或内部方法论正文。本仓库不得建立用于外部源码或私有研究的 gitignored 资料区。

### IV. 真实事件与证据

Hufu 必须只记录自身拥有的事实，或能够标识和确定时间的观测。自有事实可以覆盖 Run、Session、
Workspace、Evidence、Receipt、Effect readback、Handoff、RoleBinding 和真实墙钟事件。
外部 Issue 生命周期状态必须保持为带来源的 Projection，而不是复制出的 Event Stream。

每项 Projection 或观测都必须标识来源和 freshness。Evidence 与 Receipt 必须绑定相关目标和输入身份，
不得通过信息缺失暗示业务完成。重试外部 Effect 前，恢复路径必须使用稳定 Effect 身份或等价 Key
读取目标状态。Hufu 不得声称分布式 exactly-once。

决策基线正文一经追加不得重写。事实更新、决策换版和 Effect readback 必须分别以类型化增量追加；
新决策版本必须显式引用被取代版本、需要保留的真实 Effect 以及被丢弃的假设。增量不得删除历史 Evidence，
也不得把未完成 readback 的 Effect 宣称为已发生、未发生或已保留。CurrentView 只能确定性物化当前版本，
不能成为另一份决策或任务正本。

### V. 唯一责任角色与显式换届

Hufu 内部角色名是 `commander`、`advisor`、`project_lead`、`mission_lead`、`owner` 和 `auditor`。
每个启用参谋协作且活跃的 Project 必须恰有一个当值 `advisor`；同一 AgentIdentity 可以服务多个
Project，但每个 Project 的参谋出口必须唯一。每个已连接且活跃的 Project 必须恰有一个当值
`project_lead`；每个可执行 WorkItem 必须恰有一个
当值 `owner`。非活跃 Project 可以没有当值 `project_lead`。`mission_lead` 是多个 WorkItem 的临时
集成出口；只有风险需要独立验证时才设置独立 `auditor`。

角色换届必须使用显式 SessionBinding 和 `supersedes` 关系，不得复制或重建 Issue、目标、授权
或任务生命周期。临时专家席位、角色卡和模型输出不是 RoleBinding，不得取代当值 `advisor`、
`project_lead`、`mission_lead`、`owner` 或 `auditor`。

当值 `project_lead` 或 `mission_lead` 只能为既有决策引用附加执行信封，不能改写决策正文。
实际执行的当值 `owner`，或承担多 WorkItem 集成的 `mission_lead`，必须在开工前提交一次非审批性的
路线确认，陈述所见目标、权威状态和验收是否仍一致。路线确认不得产生 `approved`、`rejected`
等审批生命周期；任何新增范围都只能暴露范围缺口，不能由执行角色自行授权。

### VI. 默认小型、可移植、可逆

每个版本都必须使用能够在受支持平台证明用户结果的最小架构。新增依赖、持久服务、写回集成、
后台执行或分布式基础设施，需要显式已接受决策、失败边界测试，并证明能够减少操作者时间或执行风险。

本地操作必须可以检查、停止和恢复，不依赖隐藏服务。Network Listener 必须默认绑定 loopback。
生成的指令可以指导人类或 Agent，但除非未来受治理功能显式授权该范围，Hufu 不得自动启动 Agent。

DeepSeek Harness 原生 Profile 和供应商中立 Standalone Profile 必须复用同一组领域合同。
Host、Runtime 或 Renderer 的更换不得改变 Project、WorkItem、授权、角色绑定或 CurrentView 的语义。

### VII. Spec 驱动、测试优先交付

Hufu 自身的代码、版本规划和交付进度必须且只能由本公开 GitHub 仓库管理，并使用 GitHub 官方
Spec Kit 生成和校验功能合同。GitHub Milestone 和 Issue 是进度正本；功能合同位于 `specs/`，
其中的 `spec.md`、`plan.md` 和 `tasks.md` 分别定义需求、设计和可执行工作。路线图或集合 Issue
只能索引 Module Issue 及其依赖，不得复制子 Issue 状态。仓库级历史记录不得与上述正本竞争。

具有独立用户价值、跨模块合同或架构影响的 Module Issue 必须依次经过已接受 Issue、Spec、Plan、
依赖有序 Tasks、Branch、Pull Request、Review、Merge 和 Issue 关闭。父 Module 已覆盖的实现子任务，
以及不改变行为合同的小型 Bug 或文档修正，可以引用父合同并使用与风险相称的简化验收，
不得为形式完整而复制整套 Spec Kit 产物。实现必须先编写失败测试，再编写 Production Code。
所有变更必须最小、可审阅、公开安全，并在交付前按适用合同完成验证。

### VIII. 有界且经济的编排

Hufu 的编排成本是产品正确性的一部分。新增工作流、Adapter、Renderer、持久化或自动化能力前，
必须定义其预期减少的操作者时间、零效果尝试、协调唤醒或执行风险，并记录由 Hufu 实际观测到的
墙钟和调用事实。只有 Host 或 Provider 原生报告的 Token 才能标记为实测；估算值必须明确标记，
无法取得时必须报告 `unavailable`，不得以 `0` 或代理计数冒充真实用量。

效能评估不得以牺牲授权、安全、结果质量或证据完整性换取更低成本。新基础设施必须先经过有界、
可复现的代表性试点；连续三轮没有可解释的净收益时，必须暂停扩充并复盘，而不是继续增加控制面。
低风险工作不得强制增加 Auditor、重复 Spec、常驻服务或不产生决策价值的上下文。

长时间执行必须在决策中定义可复核的 `recheck_when`，并区分实现活动与经过 readback 确认的
durable Effect。当实现活动持续增长而首个 durable Effect 仍被可靠确认不存在，或确定性证据表明路线
进入 `non_goals` 时，Hufu 必须停止沿旧路线生成新的前向动作并要求 semantic rebase。重基必须保留
已经发生的 Effect 与 Evidence、停止沉没实现并回到最短安全路线；它不得修改外部 Issue 状态、撤销授权、
删除历史或自动回滚不可逆动作。缺少可靠 readback 时必须报告 `unavailable` 或 `data_insufficient`，
不得把“未观测到”写成零效果。

多 Agent、多模型或外部 Runtime 编排只能在一次实例的一次有界授权内运行。授权必须限制数据范围、
工具与副作用、参与方、调用次数、墙钟、Token 或费用以及有效期；不得扩张 Host、操作系统或沙箱已有权限。
角色数量、模型数量和多数意见不等于独立证据。失败、超时、模型身份未知和覆盖不足必须显式呈现，
不得被综合结果静默忽略，也不得默认执行角色与模型的全量笛卡尔积。

## 系统边界

- 供应商中立合同拥有稳定身份和不变量；具体能力通过 Cordis-first 插件装配，不拥有 Provider
  凭据或 Provider 生命周期状态。
- DeepSeek Harness 是原生 Host Profile，不是任务正本。项目级、跨 Session 状态必须由 Hufu
  StorageDomain 或等价持久边界拥有；Host Session Log 只保存可重建的 Session 执行事实和投影。
- 第一版 GitHub 和 GitLab Adapter 只读，外部写回不在已接受范围内。
- Local 正本使用逻辑 append-only Event Ledger，不需要数据库、Message Queue、Daemon、Scheduler、
  Heartbeat、Quota Service 或多主机 Coordinator。Standalone Profile 的物理格式是 JSONL；
  DeepSeek Profile 可以在 Hufu StorageDomain 后使用已验证的 Host Storage Provider，但必须保持同一事件语义。
- 执行与兼容 Adapter 报告有界事实，不拥有目标、授权或任务生命周期。
- `DECISION_PACKET`、`EXECUTION_ENVELOPE`、`ROUTE_ACK` 及其增量是 Hufu 自有的执行协调事实，
  只引用任务正本与既有授权。它们不得复制 Issue 正文，不得拥有 WorkItem 生命周期，也不得建立审批状态机。
- semantic drift 只能在追加事实、读取 Effect、执行 `status` 或 `handoff` 等既有交互边界同步求值；
  不得为此增加 Daemon、Scheduler、Heartbeat 或周期唤醒。
- 外部 Issue 文本、角色卡和 Host 或模型响应都是不可信数据，只能作为带来源的引用输入；
  它们不得成为指令、授权或权限声明。
- Renderer 可以计算 `blocked_by`、`unblocks`、`next_action`、摘要和可复制指令；
  派生视图必须能够从权威输入重建。
- Standalone Profile 的本地运行态位于 `.hufu/`；DeepSeek Profile 的项目事实位于 Hufu StorageDomain
  后的已验证 Host 存储。两者都必须排除在公开仓库正本之外，不得只保存在 Host Session Log。

## 交付流程与质量门禁

仓库工作正本顺序为：本 Constitution 管理不变量；已接受 ADR 管理跨领域决策；
`docs/SPEC.md` 和 `docs/ARCHITECTURE.md` 管理产品及系统边界；GitHub Milestone 和 Issue 管理进度；
`specs/` 产物管理功能合同和实现工作。`tasks/` 文件只是历史指针。

修改行为前，贡献者必须阅读对应 Module Issue、Spec Kit 产物、受影响实现和测试。
必须保留无关工作树修改；未经显式范围和测试，不得增加网络访问、凭据、外部副作用或后台行为。

每次修改仓库内容的交付都必须运行：

- `pnpm test`
- `node scripts/check-version.mjs`
- `git diff --check`

这些命令是当前 TypeScript 基线的有效门禁。`0.0.1` Python 基线已用标签 `v0.0.1` 冻结，
并从主线移除；不要把该标签内的 Python 命令当作当前主线步骤。

受影响功能需要时，还必须运行相应合同、Smoke、安全和平台检查。本地检查通过只证明所声明的本地 Evidence，
不证明已经 commit、push、部署或验收。

## 治理

本 Constitution 优先于相冲突的项目惯例。Spec、Plan、Task List、Adapter 或 Renderer
不得削弱其中的“必须”规则。任何例外都必须先修订 Constitution，再开始实现。

修订必须包含决策理由、影响分析、迁移或兼容性后果，并获得人类维护者批准。

项目采用三段式版本 `MAJOR.MINOR.PATCH`：第一位是正式版，第二位是中间修订版，第三位是小补丁。
`MAJOR` 和 `MINOR` 的目标系列及任何提升必须由人类维护者明确决定；Agent 不得根据变更规模、
兼容性判断或 Semantic Versioning 惯例自行提升前两位。只有在维护者已批准的 `MAJOR.MINOR` 系列内，
Agent 才可以根据已接受变更依次提升 `PATCH`。该控制规则同时适用于产品发布版本、Constitution
以及项目内其他三段式版本；需要突破当前系列的变更必须先等待维护者批准目标版本。

每项功能 Plan 和 Review 都必须包含显式 Constitution Check。Reviewer 必须拒绝无法解释的正本重复、
隐藏状态所有权、不安全公开内容，或缺少已接受决策、验证路径和成本假设的基础设施。

**版本**：0.1.0 | **批准日期**：2026-08-14 | **最后修订**：2026-08-15
