# Feature Specification: 零拷贝决策流

**Feature Branch**: `005-zero-copy-decision`

**Created**: 2026-08-16

**Status**: Accepted

**Input**: User description: "GitHub Module Issue #6（M4）：实现零拷贝决策传递。一份裁决只完整保存一次；后续只追加引用、摘要和增量；在既有交互边界上做语义重基护栏。必须交付初始 DECISION_PACKET、EXECUTION_ENVELOPE、ROUTE_ACK、三类 Delta、CurrentView 护栏；status / handoff 只传引用；非空 added_scope 只能得到 scope_change_required。不写回外部议题，不引入后台监控，不自动回滚，不把路线确认做成审批流。开干前必须先回答 ADR 0005 列出的基数必答题。"

**Parent Issue**: [#6](https://github.com/Blicae8917/hufu/issues/6)

**Parent Contract**: [003-local-ledger-commands](../003-local-ledger-commands/spec.md)、[004-github-readonly](../004-github-readonly/spec.md)

## User Scenarios & Testing *(mandatory)*

本模块的用户仍是在一台电脑上操作本仓库的维护者。它交付的是「一份裁决只完整记一次，下游只带引用与护栏」的执行协调纵切，不是第二套任务系统，也不是审批流或出站运行时。

这里的「零拷贝」指：裁决语义只有一份正本，下游不得再改写或另存一份可编辑正文。它不承诺操作系统或缓存层的字节零复制。

### User Story 1 - 记下裁决且只完整保存一次 (Priority: P1)

操作者（指挥官，或授权里明确指定的决策发布者）把已经拍板的目标、权威状态引用、验收、最短安全路线、已知事实引用、未知项、非目标、停止线、授权引用和复核条件记成一份裁决。系统只把这份正文完整保存一次，并给出稳定身份、业务版本和内容摘要。之后查看状态或做交接时，只看到引用和摘要，看不到被重写的第二份正文。

**Why this priority**: 没有这一份正本，信封、确认、增量和护栏都没有可引用对象。这是本模块最先产生持久结果的一步。

**Independent Test**: 合法记下后，账本里该裁决只有一份完整正文；相同内容再提一次结果等价；改正文却沿用同一身份则拒绝；状态与交接载荷不含裁决正文字段。

**Acceptance Scenarios**:

1. **Given** 工作区已连接且存在有效授权与当值项目负责人，以及至少一项可引用的工作项（本机工作项，或 GitHub 正本下已在缓存中的议题引用），**When** 指挥官提交一份字段齐全的裁决，**Then** 系统追加一次完整裁决记录，返回稳定 `decision_id`、业务版本 `1` 与内容摘要，且 `authority_scope_ref` 指向已存在的授权身份与修订。
2. **Given** 同一 `decision_id` 与版本 `1` 已成功保存，**When** 操作者再次提交内容摘要相同的裁决，**Then** 结果与首次成功等价，不出现第二份完整正文。
3. **Given** 同一 `decision_id` 与版本 `1` 已成功保存，**When** 操作者再次提交内容摘要不同的正文，**Then** 拒绝写入，原记录不变，退出表示状态冲突。
4. **Given** 裁决已保存，**When** 操作者查看状态或对该工作项做交接，**Then** 输出只含裁决身份、版本与内容摘要（及必要引用），MUST NOT 复制或改写目标、验收、路线、非目标、停止线或授权正文。
5. **Given** 提交的权威状态引用无法对应当前任务正本中的工作项，或授权引用指向不存在/已失效的授权修订，**When** 提交裁决，**Then** 拒绝写入，不得猜测补全。

---

### User Story 2 - 附加执行信封，不能改裁决正文 (Priority: P1)

项目负责人（或跨多个工作项时的任务集成负责人）给已有裁决附加一份执行信封：指出相关工作项、谁来执行、走哪几步、用哪份交接或输入引用。信封只能收窄既有授权，不能改写裁决，也不能把议题正文或裁决正文再抄一遍。

**Why this priority**: 没有信封，路线确认和效果观测没有合法执行对象；信封一旦能改裁决，零拷贝合同即失效。

**Independent Test**: 合法附加后，当前视图能读到信封引用且裁决摘要不变；夹带裁决正文或扩权字段的信封被拒绝；非当值负责人提交被拒绝。

**Acceptance Scenarios**:

1. **Given** 存在当前版本裁决且行动者是当值 `project_lead`（单工作项）或当值 `mission_lead`（多工作项），**When** 附加一份只含执行绑定与引用的信封，**Then** 信封被追加，当前视图报告该信封引用同一 `decision_id/version/content_digest`。
2. **Given** 信封试图写入目标、权威状态、验收、最短路线、非目标、停止线或授权正文，**When** 提交，**Then** 按合同无效拒绝，账本不变。
3. **Given** 信封请求的执行范围超出裁决所引用的授权修订，**When** 提交，**Then** 拒绝，不得扩大授权。
4. **Given** 行动者不是该信封要求的当值负责人，**When** 提交信封，**Then** 拒绝，原裁决不变。
5. **Given** 同一信封身份再次提交且内容摘要相同，**When** 提交，**Then** 幂等返回原结果；摘要不同则冲突拒绝。

---

### User Story 3 - 开工前确认路线，缺口不能扩权 (Priority: P1)

实际执行的工作项负责人（或多工作项时的任务集成负责人）在沿信封开工前提交一次路线确认：核对目标、权威状态和验收的摘要仍一致，并声明有没有范围缺口。空缺口表示「理解与既有范围一致」，不是批准任务、也不是任务完成。非空缺口只能得到「需要先改授权」的护栏，不能自己给自己加权限。

**Why this priority**: 这是防止执行者自我扩权的硬边界，也是 Issue #6 的必须交付。

**Independent Test**: 空缺口确认后护栏不再要求确认；四类合法非空缺口得到 `scope_change_required` 且授权记录不变；非法原因或摘要不匹配失败关闭。

**Acceptance Scenarios**:

1. **Given** 存在当前有效信封，行动者是该信封指定的当值 `owner` 或 `mission_lead`，且三项确认摘要与当前裁决一致，**When** 提交 `added_scope` 为空的路线确认，**Then** 记录被追加，当前视图不再对该信封报告 `ack_required`，也不得出现 `approved`/`rejected` 之类审批状态。
2. **Given** 同上，**When** 提交非空 `added_scope` 且每项原因属于 `data_safety`、`actual_permission_gap`、`irreversible_action`、`effect_readback_unavailable` 之一并带证据引用，**Then** 当前视图派生 `scope_change_required`，该信封不得开工；授权修订不变；任务正本状态不变。
3. **Given** 非空白名单以外的原因、三项摘要不匹配、或请求范围超出裁决所引授权，**When** 提交确认，**Then** 失败关闭，不得修改任务状态或授权。
4. **Given** 同一信封已有当前有效确认，**When** 再次提交摘要相同的确认，**Then** 幂等返回原记录；摘要不同则冲突拒绝。
5. **Given** 裁决换版、信封被取代、执行角色绑定变化、授权修订变化、或三项确认摘要变化，**When** 查看当前视图，**Then** 旧确认仍保留但不再适用，护栏重新要求确认或报告信封过期。

---

### User Story 4 - 只追加三类增量，换版必须单一后继 (Priority: P1)

裁决记下之后，事实更新、效果观测和真正改裁决语义走三条不同的增量，都不重写历史。改目标、验收、路线、非目标、停止线或授权引用时必须换版，且同一版本只能有一个合法后继。没有可靠效果读回时，不得把效果写成已发生、未发生或数值零。

**Why this priority**: 没有增量合同，就会回到「每次交接再抄一份任务」；没有单一后继，就会出现两份互相竞争的裁决。

**Independent Test**: 事实增量不改变业务版本；合法换版得到 `version+1` 且旧信封不能开新工；版本跳跃、双后继、摘要冲突失败关闭；缺读回的效果不得标成已发生或零。

**Acceptance Scenarios**:

1. **Given** 存在当前版本裁决，**When** 追加只含事实/未知项引用增减或证据时效前沿的事实增量，**Then** 业务版本不变，已钉住的 `verified_facts`/`unknowns` 不被改写。
2. **Given** 需要改变路线、目标、验收、非目标、停止线或授权引用，**When** 指挥官提交带 `expected_version` 的决策增量，**Then** 物化连续的下一版本，记录取代关系、需保留的效果引用、被丢弃的假设和新的内容摘要。
3. **Given** 同一旧版本已有合法后继，**When** 再提交另一份不同后继，**Then** 拒绝；版本跳跃、因果缺失或摘要冲突同样拒绝。
4. **Given** 操作者提交效果观测，**When** 带有稳定效果身份且读回证明效果持久发生并推进目标态或验收，**Then** 可记录为已发生的耐久效果；**When** 读回覆盖充分但确认尚无效果，**Then** 记为确认不存在；**When** 无法观测或覆盖不足，**Then** 记为不可用或数据不足，MUST NOT 写成 `0`、已发生或已保留。
5. **Given** 裁决已换版，**When** 查看当前视图，**Then** 旧信封不得启动新的前向动作，但既有交接、效果与证据继续保留。

---

### User Story 5 - 在既有查看边界上拦住沉没实现 (Priority: P2)

操作者查看状态、做交接、追加相关记录或生成下一步文本时，系统同步检查：若复核条件已到、读回充分且首个耐久效果仍确认不存在，同时实现活动（代码、提交、迁移或验证产物）按该条件持续增长；或确定性证据表明当前步骤进入非目标——则提出一次语义重基要求。它只阻止沿旧信封生成新的前向动作，不关议题、不删代码、不回滚不可逆效果，也不在后台轮询。

**Why this priority**: 这是「实现很多、效果很少」的停止线，依赖前四条故事的裁决、信封、确认和效果观测，故排 P2，但仍属本模块必须交付的护栏。

**Independent Test**: 用夹具构造两类硬触发，状态/交接出现一次 `semantic_rebase_required`；相同指纹不再重复消费；缺少读回时不得声称零效果；确认重基后下一步指向当前版本最短安全路线。

**Acceptance Scenarios**:

1. **Given** 裁决的复核条件已到达，效果读回覆盖充分且 `first_durable_effect` 为确认不存在，同时实现活动证据前沿按该条件持续增长，**When** 操作者查看状态、交接、追加相关记录或生成下一步，**Then** 当前视图派生一次 `semantic_rebase_required`，旧信封不再产生新的前向动作。
2. **Given** 确定性证据表明当前步骤或效果进入该裁决的非目标，**When** 在上述既有边界求值，**Then** 同样派生 `semantic_rebase_required`。
3. **Given** 仅有模型式「好像偏了」的判断而没有上述确定性证据，**When** 求值，**Then** 至多得到 `suspected_drift`，不得独自硬触发重基。
4. **Given** 同一 `decision_ref` 与同一证据前沿摘要已触发过重基要求，**When** 再次在同一前沿求值，**Then** 不重复消费；确认重基时追加事实增量保存该指纹与证据引用。
5. **Given** 已出现重基要求，**When** 原最短安全路线仍适用，**Then** 允许重新附加信封并重新确认；**When** 路线语义必须改变，**Then** 必须先换版再附加新信封与确认。两条路径都保留已发生效果与全部证据，不关闭外部议题，不删除或回滚既有产物。
6. **Given** 读回缺失或覆盖不足，**When** 求值，**Then** 报告不可用或数据不足，MUST NOT 把「没看到」写成零效果或已确认不存在。

---

### Edge Cases

- 一条决策流可覆盖多个工作项（任务集成）；一个工作项在同一时刻最多属于一条活跃决策流。第二条并发活跃流必须失败关闭，历史已取代的流仍保留。
- 决策流没有「已关闭/已完成」任务生命周期。工作项是否结束仍归已声明的任务正本。决策流只通过护栏停止前向动作。
- GitHub 正本下，权威状态只能引用已投影的议题身份与观测摘要，不得把议题正文写入裁决、信封、确认、交接或下一步。本模块不得写回议题。
- 本机正本下，权威状态引用本机工作项身份；不得因此把决策记录当成第二套工作项打开/关闭事件。
- 交接、换届包和当前视图不得重写裁决正文，也不得把 Journal、Receipt、护栏或路线确认当成新的授权。
- 写者冲突时任何追加都拒绝；损坏账本、未知必需未来版本、因果缺失与摘要冲突沿用 M2 失败关闭。
- 缺失的墙钟、用量或效果观测不得写成 `0`。
- 没有出站运行时：本模块不能强行终止已经在 Host 里跑着的 Agent；护栏只约束 Hufu 自己生成或投递的下一步。
- 未知子命令、GitLab 正本、网页、会商、出站运行时：仍明确失败。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 操作者 MUST 能把人类已裁决内容追加为初始 `DECISION_PACKET`。同一 `decision_id` 的完整正文 MUST 只保存一次。后续业务版本 MUST 仅由有序 `DECISION_DELTA` 物化。
- **FR-002**: 初始裁决 MUST 包含：`decision_id`、从 `1` 起的业务版本、`business_outcome`、`authoritative_state`、`acceptance_metric`、`simplest_safe_route`、`verified_facts`、`unknowns`、`non_goals`、`true_stoplines`、`authority_scope_ref`、`evidence_as_of`、`recheck_when` 与 `content_digest`。业务版本 MUST 与事件合同版本分离。
- **FR-003**: `authoritative_state` MUST 为指向既有任务正本的最小引用（工作项身份、来源修订或摘要、观测时间、时效），MUST NOT 复制议题正文或 Provider 生命周期。`verified_facts` MUST 只保存命题与证据引用。
- **FR-004**: `authority_scope_ref` MUST 指向已经独立成立的 `AuthorizationGrant` 身份与修订。裁决、信封、确认或护栏 MUST NOT 产生或扩大授权。
- **FR-005**: 只有指挥官，或该授权明确指定的决策发布者，MUST 能提交初始裁决与决策换版。本模块默认发布者即冷启动指挥官；未在授权中点名的其他身份 MUST 被拒绝。
- **FR-006**: 当值 `project_lead` MUST 能为单工作项裁决附加 `EXECUTION_ENVELOPE`；覆盖多个工作项时 MUST 由当值 `mission_lead` 附加。信封 MUST 只保存信封身份、裁决引用与摘要、发布与执行角色绑定、相关工作项、会话/工作场所引用、路线步骤、输入/交接引用、预算或期限引用，以及可选的取代信封引用。
- **FR-007**: 信封 Schema MUST 拒绝出现或覆盖目标、权威状态、验收、最短路线、非目标、停止线与授权正文。信封实际能力范围 MUST 只能收窄既有授权。
- **FR-008**: 附加单工作项信封时 MUST 指定当值 `owner`。若该工作项尚无当值 `owner` 绑定，允许在同一追加中建立恰好一个，且 MUST 落在既有授权内；已有不同当值 `owner` 则 MUST 拒绝。多工作项信封 MUST 建立或引用当值 `mission_lead`，不得用项目负责人绑定冒充。
- **FR-009**: 实际执行的 `owner`（单工作项）或 `mission_lead`（多工作项）MUST 在每个信封开工前提交一次 `ROUTE_ACK`。ACK MUST 记录信封/裁决引用、确认者与会话绑定、目标/权威状态/验收三项成分摘要、事实检查时间与 `added_scope`。
- **FR-010**: `added_scope` 为空表示理解与既有范围一致，MUST NOT 被解释为任务批准或完成。非空时每项 MUST 含 `required_because`、证据引用与所请求范围，原因只能是 `data_safety`、`actual_permission_gap`、`irreversible_action`、`effect_readback_unavailable`。
- **FR-011**: 只要 `added_scope` 非空，CurrentView MUST 派生 `scope_change_required` 并停止沿该信封开工。MUST NOT 出现 `pending`/`approved`/`rejected` 审批生命周期，MUST NOT 修改工作项生命周期，MUST NOT 追加新授权。只有外部既有授权被更新（新的授权修订）并重新附加信封、重新确认后才可继续。
- **FR-012**: 决策版本、信封、执行角色绑定、授权修订或三项成分摘要变化后，旧 ACK MUST 保留但不再适用。同一信封重复提交相同摘要 MUST 幂等；不同摘要 MUST 冲突拒绝。
- **FR-013**: 后续 MUST 只追加三类增量：`FACT_DELTA`（活事实/未知项引用的增加、取代或撤回，以及证据/时效前沿；不改变业务版本，不改写当前版本已钉住的事实字段）、`DECISION_DELTA`（`expected_version` 连续 +1，含取代关系、变化字段、依据的事实增量、`preserve_effects`、`discarded_assumptions` 与新摘要）、`EFFECT_DELTA`（稳定效果身份、信封/运行引用、前次观测、读回、观测结果、耐久性、时间与证据）。
- **FR-014**: 同一业务版本 MUST 只有一个合法后继。版本跳跃、双后继、摘要冲突、因果缺失或未知必需合同 MUST 失败关闭。`preserve_effects` MUST 只引用带读回状态的效果；未知或未完成读回的效果 MUST 保持未知，不得冒充已发生、未发生、已保留或数值零。
- **FR-015**: CurrentView MUST 派生当前裁决引用与摘要、事实/效果游标、当前信封、ACK 适用性、`first_durable_effect`、最新增量引用，以及执行护栏：`ack_required`、`scope_change_required`、`semantic_rebase_required`、`stale_envelope`、`data_insufficient`。护栏 MUST NOT 表达另一套工作项 `open/closed/blocked/done`。
- **FR-016**: `status` 与 `handoff` MUST 只传递裁决身份、版本、内容摘要或其他稳定引用，MUST NOT 重写裁决正文，MUST NOT 复制议题正文。交接成功时的下一步文本 MUST 尊重当前护栏：存在 `scope_change_required` 或 `semantic_rebase_required` 时 MUST NOT 生成沿旧信封的新前向动作。
- **FR-017**: 漂移检测 MUST 是当前视图的纯函数，只在追加相关记录、效果读回、`status`、`handoff` 或生成下一步等既有交互边界同步求值。MUST NOT 引入守护进程、调度器、心跳或周期唤醒。
- **FR-018**: 硬触发语义重基 MUST 仅当：(1) `recheck_when` 已到达，读回覆盖充分且首个耐久效果为确认不存在，同时实现活动证据前沿按该条件持续增长；或 (2) 确定性证据证明当前步骤或效果进入 `non_goals`。模型判断 MUST 只能产生 `suspected_drift`。硬触发指纹为 `decision_ref + evidence_frontier_digest`，同一前沿 MUST 只消费一次。
- **FR-019**: 语义重基 MUST 保留已发生效果与全部证据，停止旧信封的新前向动作，仍允许读回、遏制、安全恢复与证据采集。MUST NOT 关闭或写回议题、MUST NOT 删除代码或提交、MUST NOT 回滚迁移或不可逆效果、MUST NOT 建立审批状态。
- **FR-020**: `first_durable_effect` 仅在读回证明某效果持久发生且推进权威目标态或验收时才包含效果引用与时间；覆盖充分但确认无效果时为确认不存在；无法观测或覆盖不足时为不可用或数据不足，MUST NOT 用 `0` 代替。
- **FR-021**: 相同合法账本回放 MUST 物化出相同的 `decision_id/version/content_digest`、ACK 适用性、效果游标与执行护栏。内容摘要 MUST 继续按 M2 已接受规范：对合同规定的语义字段做规范化序列化再取 SHA-256。
- **FR-022**: 本模块 MUST 在 `local` 与本仓 `github` 两种已连接正本上可用。GitHub 路径 MUST 保持只读投影合同（#4）：不写回、不把议题正文纳入裁决或交接、默认 `status` 不联网。
- **FR-023**: 四个既有命令的退出码族、机器可读 JSON 与 `validate` 合同 MUST 保持。本模块允许增加一组有界命令用于记下裁决、附加信封、提交路线确认与追加三类增量；MUST NOT 增加网页服务、出站运行时或会商命令。未知子命令仍退出码 `1`。
- **FR-024**: 每条写入决策流的操作 MUST 声明行动者身份，并与当值角色绑定一致。同一人类身份可以同时持有指挥官、项目负责人和工作项负责人绑定，但 MUST NOT 因身份相同而跳过信封或确认。
- **FR-025**: 实现任何新的可观察行为前 MUST 先有一条会失败的测试。门禁 MUST 不依赖实时网络或真实外部效果执行。版本保持 `0.1.0`。零 Cordis。
- **FR-026**: MUST NOT 把 Journal、Receipt、CurrentView、路线确认或语义重基护栏当作执行授权。MUST NOT 实现外部效果执行或重试；效果记录仅接受入站观测。

### Key Entities

- **DECISION_PACKET**: 人类已裁决内容的唯一完整基线；引用任务正本与既有授权，不拥有两者。
- **EXECUTION_ENVELOPE**: 项目负责人或任务集成负责人附加的执行路由；只引用裁决，不改正文、不扩权。
- **ROUTE_ACK**: 执行者对目标、权威状态、验收和范围差异的一次就绪观察；不是审批。
- **FACT_DELTA / DECISION_DELTA / EFFECT_DELTA**: 事实前沿、决策换版与效果读回的只追加增量。
- **AuthoritySnapshotRef**: 权威状态的最小引用（身份、来源修订或摘要、观测时间、时效）。
- **DecisionRef**: `{decision_id, version, content_digest}`，供信封、确认、交接与当前视图使用。
- **ExecutionGuardrail**: 当前视图派生的安全条件（需确认、需改授权、需语义重基、信封过期、数据不足）。
- **AuthorizationGrant**: 既有授权本体；`authority_scope_ref` 与「授权修订变化后旧确认失效」均绑定其身份与修订。
- **RoleBinding**: 当值 `project_lead` / `mission_lead` / `owner`；不授予目标或授权。
- **CurrentView**: 继续折叠三轴事实，并增加决策引用与执行护栏；不是第二份任务或决策正本。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 按快速开始，操作者能在 15 分钟内于 Windows 或 POSIX 上完成：连接 → 记下裁决 → 附加信封 → 空缺口确认 → 查看状态，并得到机器可读成功结果（两类环境各至少一次）。
- **SC-002**: 对同一份未改动的合法账本连续回放 3 次，`decision_id/version/content_digest`、ACK 适用性、效果游标与执行护栏 100% 相同。
- **SC-003**: 状态与交接成功样例 100% 只含裁决引用/摘要，不含目标、验收、路线、非目标、停止线或授权正文；夹带议题正文的夹具 100% 不出现在这些字段中。
- **SC-004**: 非空且原因合法的范围缺口样例 100% 得到 `scope_change_required`，授权修订与工作项生命周期不变；非法原因或摘要不匹配 100% 失败关闭。
- **SC-005**: 同一版本第二份不同后继、版本跳跃、相同身份不同摘要 100% 冲突拒绝；相同摘要重提 100% 幂等。
- **SC-006**: 缺少读回的效果观测样例 100% 显示不可用或数据不足，不出现用 `0`、已发生或确认不存在填充。
- **SC-007**: 两类硬触发夹具在 `status`/`handoff` 各求值一次即出现 `semantic_rebase_required`；同一指纹再次求值不重复消费；缺少读回时 100% 不得硬触发「零效果」。
- **SC-008**: 验证过程不启动后台服务；GitHub 正本下无刷新的查看 100% 不联网；全部命令路径 100% 无议题写回。

## Assumptions

- 目标用户仍是本仓库维护者在单台电脑上的操作。本模块不采集效能试点，不提升版本前两位。
- 实现活动增长与效果读回均由操作者作为入站观测提交。本模块不扫描 git、不执行外部效果、不自动启动 Agent。
- `recheck_when` 由每份裁决显式给出，至少能表达墙钟到达、实现活动证据前沿增长、证据游标变化或来源修订变化之一；Hufu 不提供全局「任务太久了」阈值。
- 新的有界命令名、标志与事件类型字符串由 Plan 固定；规格只要求存在记下裁决、附加信封、提交路线确认、追加三类增量四类操作，且 `status`/`handoff`/`connect`/`doctor`/`validate` 的既有成功/失败合同不被破坏。
- 单人维护者路径：冷启动时指挥官默认等于项目负责人；附加信封时可把同一人类身份绑为 `owner`。仍必须走信封与确认，不得省略。
- GitHub 正本下记下裁决不触发网络读取；权威状态引用必须已出现在当前投影缓存。无缓存时该引用视为数据不足。
- 本机工作项的打开仍由领域服务提供（与 M2 相同），本模块不为此新增「创建工作项」产品命令。
- 双 Profile 夹具对等属于 DeepSeek 插件模块的验收，不阻塞本模块。本模块交付版本化事件夹具，并在 Standalone 回放上证明确定性物化。
- 错误码在 M2 集合上增加至少：`DECISION_CONFLICT`、`ENVELOPE_INVALID`、`ACK_INVALID`、`SCOPE_CHANGE_REQUIRED`（作为成功结果中的护栏时不走失败退出码；仅当调用方在护栏仍在时强行请求前向动作才失败关闭）、`SEMANTIC_REBASE_REQUIRED`（同上）。退出码族仍为 `0/2/3/4`。
- 版本保持 `0.1.0`。零 Cordis。不引入数据库、守护进程、心跳或写回。

### ADR 0005 必答题

1. **Decision 与 WorkItem 的基数**
   一个 `decision_id` 可以覆盖多个工作项（任务集成）。一个工作项在生命周期内可以先后出现在多条决策流中，但同一时刻最多属于一条**活跃**决策流（活跃=当前版本仍可附加新信封或沿信封产生前向动作）。并发第二条活跃流失败关闭。已被取代的历史流保持只读保留。

2. **`decision_id` 的分配**
   在提交初始裁决时分配。操作者可以给出稳定身份；省略时由系统生成一次并在成功结果中返回。初始裁决事件的幂等键由 `decision_id` + 业务版本 + 内容摘要确定性派生：同键同摘要幂等，同键不同摘要冲突。

3. **decision stream 的终结**
   不设立类似工作项的 `open/closed/done` 终态。流永久可回放。前向动作由护栏停止：`scope_change_required`、`semantic_rebase_required`、`stale_envelope`、或换版后旧信封失效。工作项是否结束仍归 `task_authority`。本模块不提供「关闭决策」命令。

4. **授权本体依赖**
   `authority_scope_ref` 绑定 `AuthorizationGrant` 的 `grant_id` 与 `revision`。授权以带 `supersedes` 的新修订追加，不改写历史。授权修订变化后，引用旧修订的 ACK 保留但不再适用；必须在新修订上重新附加信封并重新确认。裁决正文、信封、确认都不能签发授权。

## Out of Scope

- 外部议题写回、自动合并、部署、Webhook
- 把 `ROUTE_ACK` 做成审批流，或用范围缺口自动产生授权
- 后台监控、心跳、调度器、守护进程、周期唤醒
- 语义重基时删除证据、回滚不可逆效果、修改工作项生命周期
- 外部效果执行、重试、exactly-once、出站 Runtime、自动启动 Agent
- 关键决策会商、`RouteRecommendation` 产品命令、纠偏学习
- GitLab 投影、Cordis、DeepSeek 插件真装真卸、LoopX、Web Console、MCP
- 跨机器同步决策流；换机即失仍适用于本机账本
- 把 `0.0.1` 的 `TaskEnvelope` 静默改名为 `EXECUTION_ENVELOPE`
