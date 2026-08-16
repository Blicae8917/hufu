# Feature Specification: GitLab 只读投影

**Feature Branch**: `007-gitlab-readonly`

**Created**: 2026-08-16

**Status**: Accepted

**Input**: User description: "GitHub Module Issue #8（M6）：增加 GitLab 只读投影，并验证与本机账本、GitHub 投影使用同一套当前视图合同。GitLab 工作项只读投影必须带来源链接、来源身份、观测时间和时效；适配器测试证明没有写回；外部文本视为不可信引用数据；external_ref 使用 gitlab:group/project#456，无法判定时拒绝。不写回议题，不把 GitLab 状态复制成本地第二套生命周期，不引入后台刷新。不阻塞 0.1.0 发布。"

**Parent Issue**: [#8](https://github.com/Blicae8917/hufu/issues/8)

**Parent Contract**: [003-local-ledger-commands](../003-local-ledger-commands/spec.md)（本机账本与四命令）、[004-github-readonly](../004-github-readonly/spec.md)（同一套 CurrentView 与刷新策略；本模块解除其「不得实现 GitLab 适配器」边界，且仅限只读）、[005-zero-copy-decision](../005-zero-copy-decision/spec.md)（GitLab 正本下裁决与交接仍只传引用；`task_ref` 必须是缓存中的 GitLab 引用）

## User Scenarios & Testing *(mandatory)*

本模块的用户仍是在一台电脑上操作本公开仓库的维护者。它交付的是「把一份已声明的 GitLab 项目议题当作唯一任务正本来查看」的只读影子，并证明该影子与本机账本、本仓 GitHub 投影共用同一套当前视图。它不是通用 GitLab 客户端，不是第二套任务系统，也不绑定某一个真实客户 GitLab 项目。

本模块解除 004 中「MUST NOT 实现 GitLab 适配器」的限制，仅限本模块范围内的只读投影。`local` 与本仓 `github` 合同保持不变。

### User Story 1 - 把工作区连成 GitLab 正本 (Priority: P1)

操作者在一个工作目录里声明：任务正本是 GitLab、项目身份是可解析的 `group/project`、谁是指挥官、授权范围是什么。系统完成本机冷启动（连接、指挥官、首份授权、项目负责人），但工作项生命周期仍归 GitLab 议题，不在本机再开一套。

**Why this priority**: 没有 `gitlab` 连接，刷新、投影和交接都没有合法正本。这是第三种任务正本的入口。

**Independent Test**: 用可解析的 `group/project` 连接 `gitlab` 后，当前视图报告恰好一个正本且值为 GitLab；用 GitHub 网址或 `github:` 引用、无法解析的身份、或改成本机 / 本仓 GitHub 正本的冲突提交被拒绝；本机 `local` 与本仓 `github` 连接合同保持不变。

**Acceptance Scenarios**:

1. **Given** 工作区尚未连接，**When** 操作者以可解析的 `group/project` 身份连接 `task_authority=gitlab` 并给出指挥官与授权范围，**Then** 冷启动成功，当前视图恰好报告一个任务正本 `gitlab`，且不因此去网上拉取议题。
2. **Given** 已经用同一组 GitLab 身份成功连接，**When** 操作者再次提交相同连接，**Then** 结果与首次成功等价，不产生第二套身份。
3. **Given** 操作者连接时声明 GitLab 正本，但项目身份无法解析为两段 `group/project`、写成 GitHub 网址或 `github:` 引用、或声明私有实例地址，**When** 提交连接，**Then** 拒绝写入，不创建半套运行态。
4. **Given** 工作区已连接为本机 `local` 正本或本仓 `github` 正本，**When** 操作者再以 GitLab 正本连接，**Then** 拒绝，原记录不变。

---

### User Story 2 - 显式刷新才上网，平时只看缓存 (Priority: P1)

操作者查看状态时，默认只读本机已保存的投影缓存和账本，不上网。只有明确要求刷新时，系统才读取已连接 GitLab 项目的议题，并把这次观测连同源、时间和时效记下来。

**Why this priority**: 刷新策略必须与 GitHub 正本同一合同：默认零网络；显式刷新是 GitLab 正本上的唯一网络入口；本机正本下刷新仍为合同无效。

**Independent Test**: GitLab 正本下，无刷新参数的查看零网络；带刷新的查看产生一次只读读取；本机正本下刷新参数仍为合同无效；本仓 GitHub 正本的刷新合同不变。

**Acceptance Scenarios**:

1. **Given** 已连接为 GitLab 正本，**When** 操作者不带刷新查看状态，**Then** 不访问网络；若尚无缓存，工作项相关事实标为数据不足或不可用，不得伪造清单。
2. **Given** 已连接为 GitLab 正本且读取端口可读，**When** 操作者显式刷新后查看，**Then** 工作项来自这次观测，每项带原始链接、来源身份、观测时间和时效。
3. **Given** 已连接为本机 `local` 正本，**When** 操作者传入刷新类参数，**Then** 仍按合同无效拒绝，不上网。
4. **Given** 健康检查、交接或记下裁决，**When** 操作者未要求刷新，**Then** 这些命令不上网。

---

### User Story 3 - 用同一套当前视图看清议题能不能用 (Priority: P1)

操作者在当前视图里看到 GitLab 议题投影：这是观测值不是本机权威任务；现在能不能用；是新、旧、未知还是不适用。议题标题可以显示，议题正文不得变成指令或授权。缺失用量不得写成 `0`。

**Why this priority**: 发布门之后的 GitLab 正本必须与本机账本、GitHub 投影共用三轴 CurrentView，否则只是另一份清单。

**Independent Test**: 刷新成功后的当前视图，每条外部工作项都能读到链接、`gitlab:group/project#号` 引用、观测时间和三轴；把议题正文塞进交接、授权或裁决的路径不存在。

**Acceptance Scenarios**:

1. **Given** 最近一次刷新成功，**When** 操作者查看状态，**Then** 每条外部工作项暴露原始链接、来源引用、观测时间和时效，且 `fact_class` 为观测值而非本机权威任务生命周期。
2. **Given** 某条议题引用无法解析成 `gitlab:group/project#号`，或写成 `github:owner/repo#号`，**When** 系统处理该条，**Then** 拒绝采用，不得猜测补全。
3. **Given** 议题含有正文、评论或附件，**When** 生成当前视图、交接、裁决或下一步文本，**Then** 这些正文不进入指令或授权字段；至多保留带来源的引用身份。
4. **Given** GitLab 未返回某项用量或时间，**When** 写入当前视图，**Then** 该槽为不可用或数据不足，不得填 `0`。

---

### User Story 4 - 刷新失败仍保住旧观测，并且绝不写回 (Priority: P1)

网络没有、配额用尽或读取失败时，系统留下上次观测，标成过期或不可用，不假装刚刚刷新成功，也不清空成「没有议题」。适配器不能改 GitLab 议题。交接和裁决可以引用已投影的议题，但不会关闭、评论或改写该议题。

**Why this priority**: 失败路径若清空缓存或偷偷写回，会把影子做成第二套正本或破坏外部生命周期。

**Independent Test**: 先有一次成功缓存，再让刷新失败，旧工作项仍在且时效不是 fresh；测试替身证明读取路径只发生只读操作；交接或记下裁决成功不改变外部议题。

**Acceptance Scenarios**:

1. **Given** 本地已有一次成功投影，**When** 刷新因离线或读取失败而失败，**Then** 旧观测保留，时效为过期或不可用，不得静默清空，也不得把时效写成新鲜。
2. **Given** 投影缓存已超过项目默认过期阈值，**When** 操作者不刷新查看，**Then** 工作项仍展示，但时效为过期。
3. **Given** 任何本模块命令路径，**When** 运行适配器测试，**Then** 不出现创建、修改、关闭、评论或合并 GitLab 议题的操作。
4. **Given** 缓存中存在合法 GitLab 工作项引用，**When** 操作者对该引用做交接或记下裁决，**Then** 本机记下交接或裁决引用，外部议题生命周期不变。

---

### Edge Cases

- 本模块接受操作者手填、可解析为恰好两段 `group/project` 的 GitLab 项目身份；不绑定某一个真实客户项目，不从 git remote 自动探测。
- 不存储、不读取、不提示 GitLab token。私有项目、需凭据的读取、自建实例与私有 Endpoint 一律拒绝。
- 嵌套组路径（超过两段，如 `group/sub/project`）无法按已发布 scheme 判定，必须拒绝，不得猜测哪一段是项目名。
- GitLab 列表里夹带的 Merge Request 不作为本模块工作项。史诗、迭代、GitLab 原生 Work Item 层级超出经典 Issue 的部分不在本模块。
- 分页或过滤导致集合不完整时，工作项集合标数据不足或非新鲜，不得假装已穷尽该项目全部议题。
- 本机 `local` 正本与本仓 `github` 正本的工作项生命周期、锁、损坏、`validate` 与刷新合同保持既有模块；本模块不得把 GitLab 状态转换追加成本机工作项打开/关闭事件。
- 外部引用必须是 `gitlab:<group>/<project>#<issue>`；缺号、缺项目、前导零、把 GitHub 写法拿来用，一律拒绝猜测。
- GitLab 正本下，裁决的 `task_ref` 与交接的工作项引用必须是当前缓存中的合法 GitLab 引用；GitHub 引用不得混用。
- 写者冲突时刷新不得抢锁改账本；缓存写入不得假装成授权或任务正本变更。
- 未知子命令、会商、网页、出站运行时、LoopX 引擎：仍明确失败。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 操作者 MUST 能把当前工作目录连接为 `task_authority=gitlab` 的 Project，项目身份 MUST 为可解析的 `group/project`。MUST NOT 存储 Provider 凭据。MUST NOT 从 git remote 自动探测。MUST NOT 记录私有 Endpoint。
- **FR-002**: 每个已连接 Project MUST 恰好报告一个任务正本。`gitlab` 与 `local`、`github` 不得共存。无法解析的 GitLab 身份、GitHub 网址或 `github:` 引用、嵌套组路径与私有实例 MUST 失败关闭。
- **FR-003**: GitLab 正本的冷启动 MUST 仍按 M2 顺序写入本机连接、指挥官、首份授权与当值项目负责人。连接成功 MUST NOT 默认访问网络。
- **FR-004**: GitLab 正本下，工作项生命周期 MUST 保持为 GitLab 议题的只读投影。本机账本 MUST NOT 复制议题状态转换，伪装成本机 WorkItem 生命周期。
- **FR-005**: `status` 默认 MUST 只读本机账本与可重建投影缓存，MUST NOT 访问网络。只有显式刷新选项才允许网络读取，且仅限 GitLab 正本（本仓 GitHub 正本的刷新合同保持 004）。
- **FR-006**: `local` 正本下，刷新类参数 MUST 仍为合同无效（退出码 2），行为与 M2 一致。
- **FR-007**: 显式刷新 MUST 只读取已连接项目的经典 GitLab Issue 投影（身份、标题或目标、视图所需最小状态、原始链接、来源 revision 或等价观测标记、观测时间）。MUST NOT 写回议题、MUST NOT 自动合并、MUST NOT 部署。
- **FR-008**: 每条被采用的外部工作项 MUST 带 `external_ref`，格式为 `gitlab:<group>/<project>#<issue>`。无法判定时 MUST 拒绝该条，禁止猜测。GitHub scheme 的引用 MUST 拒绝。
- **FR-009**: 外部议题正文、评论、附件和原始角色卡 MUST 视为不可信引用数据，MUST NOT 进入指令、授权体、裁决正文或下一步命令文本。
- **FR-010**: 投影与观测 MUST 标识来源和 freshness。离线、配额不足或拉取失败时 MUST 保留旧观测，标记 `stale` 或 `unavailable`，MUST NOT 静默清空，MUST NOT 伪造 `fresh`。
- **FR-011**: 缓存中的投影超过项目默认过期阈值时，未刷新的查看 MUST 将对应时效标为 `stale`，而不是当作新鲜权威。
- **FR-012**: CurrentView 的每项重要事实 MUST 继续携带三轴。GitLab 工作项身份与状态 MUST 为 `observed`（不是本机 `authoritative` 任务生命周期）。缺失用量或时间 MUST NOT 写成 `0`。
- **FR-013**: `doctor`、`handoff`、`decide` 与无刷新的 `status` MUST NOT 访问网络。`handoff` 与 `decide` 可以引用已投影的外部工作项，MUST NOT 改变 GitLab 议题。
- **FR-014**: 当正本为 `gitlab` 时，打开本机 WorkItem 的领域路径 MUST 拒绝，以免在 GitLab 正本下再生一套本地任务。
- **FR-015**: 适配器测试 MUST 证明没有发生 Issue 写回（创建、修改、关闭、评论、合并）。
- **FR-016**: 四个命令的退出码族、机器可读 JSON、`validate` 与零拷贝决策合同 MUST 保持既有模块。GitLab 正本下 `task_ref` / 交接工作项 MUST 为缓存中的 `gitlab:group/project#号`。版本保持 `0.1.0`。
- **FR-017**: 本模块解除 004 的「不得实现 GitLab 适配器」限制，且仅限只读投影。MUST NOT 实现 GitLab 写回、Web 控制台、会商、出站 Runtime、LoopX 引擎、后台刷新、守护进程或凭据存储。
- **FR-018**: 实现任何新的可观察行为前 MUST 先有一条会失败的测试。门禁测试 MUST 不依赖实时 GitLab 网络；实时读取若存在，只能是维护者可选步骤，失败时报告不可用，不得把未观测写成成功。
- **FR-019**: Windows 与 POSIX MUST 都能完成连接、默认查看、显式刷新（可用替身）与交接验证，无需后台服务。
- **FR-020**: GitLab 特定状态与策略 MUST 放在 Adapter 之后。供应商中立核心 MUST NOT 把 GitLab 项目绑定成本仓 GitHub 身份，也 MUST NOT 把 GitLab 引用解析进 GitHub 专用规则。

### Key Entities

- **Project**: 连接记录；本模块允许 `task_authority=gitlab` 且项目身份为可解析的 `group/project`。
- **GitLabIssueProjection**: 一次观测到的议题影子：来源引用、原始链接、标题或目标、最小状态、来源 revision 或等价标记、`observed_at`、freshness。不是第二套生命周期。
- **ProjectionCache**: 本机可重建派生缓存；刷新写入，默认状态读取。失败时不得无故删除。与 GitHub 投影缓存同族，但按当前正本隔离，不得混用 scheme。
- **ExternalRef**: `gitlab:<group>/<project>#<issue>`。无法解析则不采用。
- **CurrentView**: 与 M2/M3 同一视图合同家族；`task_authority` 可为 `gitlab`；工作项可来自投影。
- **Handoff**: 仍为本机执行协调事实；可引用外部工作项身份，不拥有该议题。
- **DecisionRef**: 既有零拷贝决策引用；GitLab 正本下只指向缓存中的 GitLab 工作项，不复制议题正文。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 按快速开始，操作者能在 10 分钟内于 Windows 或 POSIX 上完成一次 GitLab 连接，并得到机器可读成功结果（两类环境各至少一次；刷新可用替身）。
- **SC-002**: GitLab 正本下，100% 的无刷新 `status` / `doctor` / `handoff` / `decide` 样例不发起网络读取。
- **SC-003**: 刷新成功样例中，100% 的被采用工作项带有原始链接、合法 `gitlab:group/project#号`、观测时间和三轴；`task_authority` 恰好为 `gitlab`。
- **SC-004**: 在已有缓存后注入刷新失败，100% 保留旧工作项集合，且时效不是 `fresh`；不得出现空清单冒充「项目没有议题」。
- **SC-005**: 适配器测试 100% 断言只读：无创建/修改/关闭/评论/合并议题的调用。
- **SC-006**: 把议题正文放入夹具时，100% 的当前视图、交接、裁决和下一步字段不包含该正文。
- **SC-007**: 无法解析的外部引用、GitHub 网址或 `github:` 引用、嵌套组路径、私有实例、以及 `local` 下的刷新参数，100% 失败关闭且不猜测。
- **SC-008**: 人为缺失的用量或时间槽 100% 显示不可用或数据不足，不出现用 `0` 填充。
- **SC-009**: GitLab 正本下对缓存中合法引用的交接或裁决 100% 只追加本机事实；外部议题身份保持不变。

## Assumptions

- 连接参数由操作者手填，必须能解析为恰好两段 `group/project`。可接受的写法包括 `group/project` 以及指向 `gitlab.com` 的常见 HTTPS/SSH 形式；解析后记录规范身份 `group/project`。大小写按 GitLab 路径字面保留，比较时路径大小写敏感（与 GitHub 本仓绑定的大小写不敏感规则分开）。
- 本模块不绑定某一个真实 GitLab 项目。门禁与 `pnpm test` 使用录制夹具和可注入的只读端口，不打真实 GitLab，不写私有 Endpoint。夹具使用公开安全的示例身份 `example-group/example-project`，不得写入客户项目名或本机路径。
- 不存储、不读取、不提示 GitLab token。只允许无需登录的公开读取作为维护者可选步骤；默认实现与门禁均走注入端口。私有项目、自建 GitLab、自定义 Host 不在本模块。
- `status --refresh` 仍是唯一成功的网络入口。不增加第五个产品命令。
- 过期阈值沿用连接记录中的 `stale_after_hours`，默认 24 小时。
- 刷新读取已连接项目的经典 GitLab Issue（排除 Merge Request）作为代表性集合，不要求一次穷尽全部历史。响应不完整时标数据不足或非新鲜。议题号是项目内 IID，对应 scheme 中的 `#<issue>`。
- 投影缓存位于工作区 `.hufu/cache/`，已 gitignore，可重建，不是任务正本。GitLab 缓存不得被 GitHub 正本当作合法工作项，反之亦然。
- `handoff --work-item` 与裁决 `task_ref` 对 GitLab 正本接受 `gitlab:group/project#号`；该引用必须已出现在当前缓存，且 group/project 必须等于已连接身份。
- 004 的 FR-017 中「不得实现 GitLab 适配器」由本模块解除；004 其余 GitHub 边界保持。005/006 中「GitLab 正本仍明确失败」的边沿由本模块改为：GitLab 正本按本规格成功，其余未实现能力仍明确失败。
- 版本保持 `0.1.0`。不采集效能试点。不引入 Cordis 新插件（GitLab 适配器走既有 Standalone 命令路径即可）。

## Out of Scope

- GitLab 写回、自动合并、部署、Webhook、后台刷新
- 把 GitLab 状态复制成本机第二套生命周期
- 任意自建 GitLab、私有项目、token、OAuth、私有 Endpoint
- 嵌套组、GitLab 史诗 / 迭代 / 非经典 Issue 的 Work Item
- 本仓 GitHub 正本行为变更、任意第三方 GitHub 仓库
- Web 控制台、会商、出站 Runtime、LoopX
- 从 git remote 或 Issue 正文推断授权
