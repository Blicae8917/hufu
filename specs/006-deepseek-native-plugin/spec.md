# Feature Specification: DeepSeek 原生插件与双入口视图对等

**Feature Branch**: `006-deepseek-native-plugin`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "GitHub Module Issue #7（M5）：把同一组领域合同接到 DeepSeek Harness 原生插件：装上可用，卸下只撤销运行时效果，不删除已持久事实。用版本化夹具证明与独立入口折叠出结构相等的当前视图。必须交付原生插件路径、真装真卸契约测试、不可观测字段显式为不可用且不以 0 填充；契约测试声明运行于当前唯一已验证的插件运行时实现。不修改 Host 的 Agent Loop，不声称兼容其他同名运行时，不做出站运行时，不把 Session 日志当成项目正本。"

**Parent Issue**: [#7](https://github.com/Blicae8917/hufu/issues/7)

**Parent Contract**: [003-local-ledger-commands](../003-local-ledger-commands/spec.md)、[004-github-readonly](../004-github-readonly/spec.md)、[005-zero-copy-decision](../005-zero-copy-decision/spec.md)

## User Scenarios & Testing *(mandatory)*

本模块的用户仍是在一台电脑上操作本仓库的维护者。它交付的是「同一套领域合同既能被独立入口调用，也能作为 DeepSeek Harness 原生插件装上/卸下」的组合纵切，不是第二套任务系统，不是出站运行时，也不是对 Host Agent Loop 的修改。

这里的「双入口」指：DeepSeek 组合入口与独立 CLI 入口消费同一组服务与当前视图合同。它不要求两种入口的字节序列化逐字相同，也不要求维护者日常使用的默认 Profile 被测试改写。

### User Story 1 - 装上就能用同一组有界能力 (Priority: P1)

操作者把 Hufu 作为外部插件装进一个**隔离的** DeepSeek Harness Profile。装入后，模型或操作者可以通过该 Profile 提供的 Hufu 能力完成连接、健康检查、查看当前视图、交接和记下裁决，而不必去解析另一入口的展示文本，也不必修改 Host 的 Agent Loop。

**Why this priority**: 没有可安装的原生插件路径，后续对等、卸载和不可观测字段都没有可验证对象。这是本模块最先产生持久组合结果的一步。

**Independent Test**: 在隔离的 Harness 主目录与命名 Profile 中装入带 Bundle 声明的插件后，Hufu 服务与工具可用；用同一组合法输入完成连接与查看，得到与独立入口同类的机器可读当前视图；未声明 Bundle 却被显式列入加载项时失败关闭。

**Acceptance Scenarios**:

1. **Given** 隔离的 Harness 主目录中尚无 Hufu 插件，**When** 操作者按官方安装契约把本模块提供的插件包装入指定 Profile，**Then** 该 Profile 的 Bundle 层包含 Hufu，Hufu 服务可用，且不修改 Host Agent Loop、不启动后台调度。
2. **Given** 插件已装入且工作区尚未连接，**When** 通过该 Profile 暴露的 Hufu 能力提交与独立入口相同语义的连接（本机或本仓 GitHub 正本、指挥官、授权范围），**Then** 冷启动成功，当前视图恰好报告一个任务正本。
3. **Given** 插件已装入且工作区已连接，**When** 通过该 Profile 查看状态或做交接，**Then** 输出遵守既有 `status`/`handoff` 合同：三轴事实、裁决只传引用、下一步不超出已记录授权。
4. **Given** 一个没有 Bundle 声明的普通包仅被安装为依赖，**When** 查看加载结果，**Then** 不得把它当成已启用的 Hufu 组合层（至多警告并保持为普通依赖）。
5. **Given** 没有有效 Bundle 的包被显式列入该 Profile 的加载项，**When** 启动或加载该 Profile，**Then** 必须失败关闭，不得静默降级成「看起来装上了」。

---

### User Story 2 - 同一夹具两个入口看到同一当前视图 (Priority: P1)

维护者准备一份版本化事件夹具（含连接、授权、工作项、交接，以及 #6 已交付的裁决引用与护栏）。独立入口回放得到一份当前视图；DeepSeek 组合入口对同一夹具回放得到另一份。两份在结构与字段语义上相等：任务正本、授权修订、工作项集合、裁决引用/摘要、ACK 适用性、效果游标和执行护栏一致。Host 无法观测的字段在 DeepSeek 入口显式为不可用，独立入口对应槽位也不得用数值零填补。

**Why this priority**: 这是 Issue #7 的验收核心：不是「插件能跑」，而是两种组合共享合同。没有这一条，就会出现两套状态模型。

**Independent Test**: 固定夹具分别经独立入口与 DeepSeek 组合入口各折叠至少 3 次；规范化比较结构相等；夹具中的决策引用、护栏与缺失观测槽位不得被写成 `0`。

**Acceptance Scenarios**:

1. **Given** 一份未改动的版本化事件夹具，**When** 独立入口与 DeepSeek 组合入口各回放 3 次，**Then** 两种入口各自 3 次结果自洽，且彼此在约定规范化形式上结构相等。
2. **Given** 夹具含已记下的裁决，**When** 比较两入口的当前视图，**Then** `decision_id`、业务版本、内容摘要、ACK 适用性、效果游标与执行护栏相同；Host 临时缓存不是第二份裁决正本。
3. **Given** Host 无法提供 Session、Run 或用量观测，**When** 查看当前视图，**Then** 这些槽位为不可用或数据不足，`value` 不得为 `0`。
4. **Given** 比较两入口输出，**When** 序列化实现不同，**Then** 仍只比较结构与字段语义，不得要求逐字节相同。

---

### User Story 3 - 卸下只撤销运行时，不删已持久事实 (Priority: P1)

操作者从该 Profile 卸下 Hufu 插件。此后模型不再看到 Hufu 工具，监听器和其他运行时效果被撤销。先前已经记下的连接、授权、交接和裁决仍在 Hufu 自己的持久边界里，可以用独立入口回放出来。卸载不是「删除历史」。

**Why this priority**: 可撤销 Effect 若被理解成删账本，就会丢掉任务协调事实；若卸不干净，就会在 Host 里留下幽灵工具。

**Independent Test**: 先装入并写入至少一条 Hufu 自有事实，再卸下；工具与监听器不可用；独立入口仍能回放原事实；再次装入后能继续追加而不是重建正本。

**Acceptance Scenarios**:

1. **Given** 插件已装入且账本已有连接与至少一条自有记录，**When** 按官方契约从该 Profile 卸下 Hufu，**Then** Hufu 工具、事件监听器与其他运行时效果全部撤销。
2. **Given** 卸载已完成，**When** 用独立入口回放同一持久边界，**Then** 已持久事实仍在，当前视图能重建，不得因卸载而出现空账本或被截断的历史。
3. **Given** 卸载后再次装入同一 Profile，**When** 查看状态，**Then** 仍看到卸载前的事实；需要取消或取代时只能追加新事件，不能把卸载当成历史删除。
4. **Given** 仅从软件包管理器删除包文件，**When** 没有完成运行时卸载，**Then** 不得把「包目录不在了」单独当作工具已卸载的证明。

---

### User Story 4 - 不可观测就说不可用，不用零冒充 (Priority: P1)

操作者在 DeepSeek 组合入口查看状态。Host 没有报告墙钟、Token 或某些 Session/Run 字段时，当前视图必须标成不可用或数据不足。不得把缺失写成 `0`，也不得把 Session 日志里的文本当成项目正本或授权。

**Why this priority**: 这是 Constitution 与兼容性清单的硬约束，也是 Issue #7 的必须交付。

**Independent Test**: 构造 Host 不提供用量/会话观测的夹具；当前视图对应槽位非可用且值不为 `0`；Session 日志不出现 Hufu 领域事件正文，也不被当成任务正本。

**Acceptance Scenarios**:

1. **Given** Host 未原生报告 Token 或墙钟，**When** 投影当前视图，**Then** 对应槽位为不可用或数据不足，不得出现用 `0` 表示「没有用量」或「没有耗时」。
2. **Given** DeepSeek Session 日志只使用目标版本公开支持的事件词汇，**When** 检查日志与 Hufu 持久记录，**Then** Hufu 领域事实只在 Hufu 持久边界；Session 日志至多有可重建的执行投影，不能单独成为项目目标或外部议题正本。
3. **Given** 独立入口在同一夹具下同样缺失这些观测，**When** 比较两入口，**Then** 两侧都以不可用或数据不足表达，不得一侧填零、一侧留空。

---

### User Story 5 - 契约测试钉死运行时身份，且不改 Agent Loop (Priority: P2)

维护者运行本模块门禁。契约测试必须声明它们运行于当前唯一已验证的 Cordis 实现身份，而不是「某个叫 Cordis 的东西」。测试证明 Hufu 没有修改 Host Agent Loop。本模块不声称兼容上游其他 Cordis 发行。

**Why this priority**: 没有身份声明，以后换运行时会把兼容性偷换成版本号相近。不改 Loop 是 ADR 0003 的拒绝项，必须可证伪。排 P2 是因为它验证前四条故事的组合边界，仍属本模块必须交付。

**Independent Test**: 测试清单或测试元数据显式写出运行时实现身份；仓库检索与加载路径证明没有补丁 Host Agent Loop；未知同名运行时不被声明为已支持。

**Acceptance Scenarios**:

1. **Given** 本模块的契约测试套件，**When** 查阅其声明，**Then** 写明运行于 `@deepseek-ai/cordis` 这一已验证实现，且不把上游 `cordis` 列为已支持。
2. **Given** 插件已装入，**When** 审查交付物与测试，**Then** 找不到对 Host Agent Loop 的修改或运行时补丁；产品行为只通过服务、类型化事件与可撤销效果组合。
3. **Given** 未来若要支持第二种 Cordis 实现，**When** 评估本模块，**Then** 本模块不凭版本号相近推断兼容；第二种实现必须另立合同测试。

---

### Edge Cases

- 测试与门禁使用隔离的 Harness 主目录和专用 Profile 名，不得改写维护者机器上已有的默认 `web`/`headless` 日常配置。
- 裸包名解析若依赖可选原生 peer，本模块默认使用可解析的相对路径或 `file:` 说明符完成真装真卸；不得把「本机碰巧能解析裸名」写成通用成功标准。
- 用户或 Profile 补丁对匹配条目是整块替换配置、不做深合并。Hufu 的 Bundle 补丁必须自包含；文档与测试必须证明一次覆盖不会丢掉未重述的必需字段。
- DeepSeek Harness 仍是 Developer Preview。上游破坏性变化时本模块必须显式报告不兼容，不得静默降级或宣称支持浮动 `master`。
- 领域核心保持零框架依赖。Cordis 只出现在 DeepSeek 组合层。独立入口不得因此获得 Cordis 运行时依赖。
- 跨 Session 的项目、工作项、角色绑定、决策流和交接必须进入 Hufu 持久边界；不得只写在 Host Session 日志里。
- 本模块不创建、继续或向他人的 Host Session 投递消息。独立入口的 CLI 仍是入站 Consumer，不是出站 Runtime。
- GitHub 正本合同不变：默认查看不联网，不写回议题，不把议题正文写入指令或授权。
- 写者冲突、损坏账本、未知必需未来版本仍沿用既有失败关闭。
- 未知子命令、GitLab 正本、会商、网页服务、LoopX 引擎：仍明确失败或保持未实现。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: MUST 提供可安装的 DeepSeek Harness 原生插件路径。安装 MUST 使用官方契约 `dsh plugin --profile <name> add <package>`（或测试中等价的、同一契约的隔离调用）。插件包 MUST 声明 Bundle 补丁位置。
- **FR-002**: 领域核心 MUST 保持零框架依赖。Cordis 运行时 MUST 只随 DeepSeek 组合层引入。独立入口 MUST 继续组装同一领域核心，不得因此新增 Cordis 依赖。
- **FR-003**: 插件 MUST 通过服务定义、提供者与消费者组合既有能力（连接、健康检查、当前视图、交接、记下裁决/信封/确认/增量）。MUST NOT 解析独立入口的展示文本作为合同，MUST NOT 复制第二套领域服务。
- **FR-004**: MUST NOT 修改 Host Agent Loop，MUST NOT 建立不可替换的 Host 特权实现。
- **FR-005**: 装入后，操作者 MUST 能通过该 Profile 完成与独立入口相同语义的有界操作，并得到机器可读结果。既有退出码族与失败类别 MUST 保持。
- **FR-006**: 未声明 Bundle 的包被安装为普通依赖时 MUST NOT 被当成已启用的 Hufu 组合层。把它显式列入 Profile 加载项且 Bundle 无效时 MUST 失败关闭。
- **FR-007**: 卸下插件 MUST 撤销其工具、事件监听器与其他运行时效果。MUST NOT 删除已经持久化的 Hufu 事实。取消、撤回或取代 MUST 只追加新事件。
- **FR-008**: 「包文件已删除」MUST NOT 单独证明工具或监听器已卸载。真装真卸契约测试 MUST 分别覆盖：包安装、Profile Bundle 加载、运行时卸载。
- **FR-009**: DeepSeek 组合入口与独立入口 MUST 对同一版本化事件夹具折叠出规范化结构相等的当前视图。比较结构和字段语义，MUST NOT 要求不同序列化实现逐字节相同。
- **FR-010**: 决策夹具 MUST 得到相同的裁决引用与内容摘要、ACK 适用性、效果游标和执行护栏。Host 临时缓存 MUST NOT 成为第二份裁决或任务正本。
- **FR-011**: Host 或提供者无法观测的字段 MUST 报告为不可用或数据不足。缺失的墙钟、Token 或用量 MUST NOT 写成 `0`。只有 Host 或提供者原生报告的 Token 才能标为实测。
- **FR-012**: 跨 Session 的项目状态 MUST 进入 Hufu 持久边界。DeepSeek Session 日志 MUST 只使用目标版本公开支持的事件词汇，MUST NOT 承载 Hufu 领域事件，MUST NOT 单独成为项目目标或外部议题正本。
- **FR-013**: DeepSeek Profile 若使用 Host 存储提供者，MUST 位于 Hufu StorageDomain 合同之后，并遵守与独立入口相同的只追加事件语义。独立入口本机正本仍为既有 JSONL 账本。
- **FR-014**: 契约测试 MUST 声明运行于 `@deepseek-ai/cordis`。MUST NOT 声称兼容上游 `cordis` 或其他未验证实现。
- **FR-015**: MUST NOT 实现出站 Runtime：不得创建、继续或投递他人的 Host Session。Skill、命令、CLI 仍是 Consumer。
- **FR-016**: MUST NOT 引入后台调度器、心跳、配额强制执行或自动启动 Agent。MUST NOT 写回外部议题。MUST NOT 把 Journal、Receipt、当前视图或 Session 日志当作执行授权。
- **FR-017**: GitHub 只读投影与零拷贝决策流的既有合同 MUST 保持。本模块 MUST NOT 放宽 #4/#6 的范围。
- **FR-018**: 实现任何新的可观察行为前 MUST 先有一条会失败的测试。门禁对真装真卸可以使用隔离的本地 Harness 主目录，MUST NOT 依赖维护者日常 Profile，MUST NOT 向公开网络写回。版本保持 `0.1.0`。
- **FR-019**: 开始实现前 MUST 重新核对公开上游，并把实际使用的 Harness、Cordis、Node 与插件 API 基线写入兼容性记录。无法完成必需验证时兼容性状态 MUST 为部分或不适用，不得按版本号相近推断。
- **FR-020**: Hufu 服务命名空间与领域事件命名空间 MUST 保持既有约定；插件贡献的工具 MUST 调用共享服务，不得成为另一套授权来源。

### Key Entities

- **DeepSeek Profile**: 一种组合方式，把同一领域合同接到 DeepSeek Harness 插件树；不是任务正本。
- **Standalone Profile**: 独立入口的组合方式，零 Cordis，以 CLI 组装同一核心。
- **Plugin Bundle**: 可安装的配置层，声明补丁文件；装入 Profile 的有序 Bundle 列表后才成为组合的一部分。
- **StorageDomain**: Hufu 持久边界。DeepSeek 入口可在其后使用已验证的 Host 存储提供者；独立入口继续使用本机只追加账本。
- **CurrentView**: 两种入口共享的确定性视图合同；含三轴事实、裁决引用与执行护栏。
- **Revocable Effect**: 工具、监听器与运行时资源；卸载时撤销，不等于删除历史事实。
- **Session Log**: Host 当前会话的可重建投影，使用公开支持的事件词汇；不是 Hufu 项目正本。
- **Compatibility Baseline**: 本发布系列实际核对过的公开上游身份；测试必须声明运行时实现。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 按快速开始，操作者能在 20 分钟内于 POSIX 上完成：隔离 Profile 装入 → 连接 → 查看当前视图，并得到机器可读成功结果（至少一次）。
- **SC-002**: 真装真卸契约：装入后服务可用；卸下后工具与监听器 100% 不可用；已持久事实 100% 仍可被独立入口回放。
- **SC-003**: 同一版本化夹具经两个入口各回放 3 次，规范化当前视图（含裁决引用、ACK 适用性、效果游标、执行护栏）100% 结构相等。
- **SC-004**: 缺失用量、墙钟或 Session/Run 观测的样例 100% 显示不可用或数据不足，不出现用 `0` 填充。
- **SC-005**: 无有效 Bundle 却被显式列入加载项的样例 100% 失败关闭；仅作为普通依赖安装的无 Bundle 包 100% 不启用 Hufu 组合层。
- **SC-006**: 契约测试清单 100% 声明运行时实现身份为 `@deepseek-ai/cordis`；交付物 100% 不修改 Host Agent Loop。
- **SC-007**: 验证过程不改写维护者默认日常 Profile；不写回外部议题；不启动后台调度或出站会话。

## Assumptions

- 目标用户仍是本仓库维护者在单台电脑上的操作。本模块不采集效能试点，不提升版本前两位。
- 真装真卸在隔离的 Harness 主目录（测试控制的 `DSH_HOME` 或等价）和专用 Profile 名下进行，不把维护者已有的 `web`/`headless` 当作可写试验场。
- 安装说明符默认使用可解析的相对路径或 `file:` 形式，以避免可选原生 peer 导致的裸名解析失败。本模块不要求把插件发布到公共 npm 才算交付。
- 2026-08-16 重新读取公开 `deepseek-ai/deepseek-harness` 的 `master`，提交仍为 `47f943859bef60e4160492346772ded9b24f765a`，与 `docs/COMPATIBILITY.md` 已记录基线一致。实现 Plan 仍须在动手前再核一次；若漂移则先更新兼容性记录再写代码。
- 插件贡献的能力覆盖既有有界命令的语义：`connect`、`doctor`、`status`、`handoff`、`decide`、`validate`。具体工具名、服务名与补丁行由 Plan 固定。
- Headless 或同等无 UI 组合足以做契约测试；本模块不交付网页控制台，也不依赖浏览器手工验收。
- DeepSeek 入口的项目事实可以走 Host 存储提供者，但必须经过 Hufu 持久合同；测试夹具以事件语义为准，不把 Host 私有文件布局写进产品合同。
- 本模块不把 DeepSeek Harness 的 pnpm/Vitest/Oxlint/tsdown 整包搬进 Hufu 门禁；只引入完成插件组合与契约测试所需的最小依赖，并在 Plan 中列明。
- 单人维护者路径下，指挥官仍可同时是项目负责人；角色绑定规则不因改走插件入口而省略信封或确认。
- 错误码族仍为既有 `0/2/3/4` 与机器可读 JSON。本模块若需表达「插件未装入 / Bundle 无效 / 运行时已卸载」，优先复用既有失败类别，新码由 Plan 列出。

## Out of Scope

- 修改 DeepSeek Harness Agent Loop，或 Fork Host
- 声称兼容上游 `cordis` 或其他未验证 Cordis 实现
- 出站 Runtime：创建、继续、向他人 Session 投递、取消他人运行中的 Agent
- 把 Host Session 日志当作项目正本、目标或授权
- GitLab 投影、LoopX 引擎、关键决策会商、loopback Web Console、MCP 服务器
- 后台调度器、心跳、配额、自动启动 Agent、外部议题写回
- 把本模块当作 `0.1.0` 发布门；发布门仍是只读影子纵切
- 跨机器同步；换机即失仍适用于本机账本
- 以发布到公共 npm 或申请上游 `dsh-plugin` 收录作为本模块验收条件
