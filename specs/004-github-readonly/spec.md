# Feature Specification: 本仓 GitHub 只读投影

**Feature Branch**: `004-github-readonly`

**Created**: 2026-08-15

**Status**: Accepted

**Input**: User description: "GitHub Module Issue #4（M3）：为本仓库增加 GitHub 只读投影，并用本项目自身验证与本机账本同一套 CurrentView。每个已连接项目恰好一个任务正本；外部工作项带来源链接、观测时间和时效；status 默认读本地缓存，只有显式刷新才访问网络；失败时保留旧观测，不伪造时效、不写回议题、不把议题正文写入指令或授权。"

**Parent Issue**: [#4](https://github.com/Blicae8917/hufu/issues/4)

**Parent Contract**: [003-local-ledger-commands](../003-local-ledger-commands/spec.md)（本机账本与四命令；本模块在其之上增加 `github` 正本）

## User Scenarios & Testing *(mandatory)*

本模块的用户仍是在一台电脑上操作本公开仓库的维护者。它交付的是「把本仓 GitHub 议题当作唯一任务正本来查看」的只读影子，不是通用 GitHub 客户端，也不是第二套任务系统。

### User Story 1 - 把本仓连成 GitHub 正本 (Priority: P1)

操作者在一个工作目录里声明：任务正本是 GitHub、仓库就是本公开仓、谁是指挥官、授权范围是什么。系统完成本机冷启动（连接、指挥官、首份授权、项目负责人），但工作项生命周期仍归 GitHub 议题，不在本机再开一套。

**Why this priority**: 没有 `github` 连接，刷新、投影和交接都没有合法正本。这是发布门第二种任务正本的入口。

**Independent Test**: 用本仓身份连接 `github` 后，当前视图报告恰好一个正本且值为 GitHub；用其他仓库、GitLab 或改成本机正本的冲突提交被拒绝；本机 `local` 连接合同保持不变。

**Acceptance Scenarios**:

1. **Given** 工作区尚未连接，**When** 操作者以本公开仓身份连接 `task_authority=github` 并给出指挥官与授权范围，**Then** 冷启动成功，当前视图恰好报告一个任务正本 `github`，且不因此去网上拉取议题。
2. **Given** 已经用同一组本仓 GitHub 身份成功连接，**When** 操作者再次提交相同连接，**Then** 结果与首次成功等价，不产生第二套身份。
3. **Given** 操作者连接时声明 GitHub 正本，但仓库身份不是本公开仓、无法解析为 GitHub 仓库、或声明 GitLab，**When** 提交连接，**Then** 拒绝写入，不创建半套运行态。
4. **Given** 工作区已连接为本机 `local` 正本，**When** 操作者再以 GitHub 正本连接，**Then** 拒绝，原记录不变。

---

### User Story 2 - 显式刷新才上网，平时只看缓存 (Priority: P1)

操作者查看状态时，默认只读本机已保存的投影缓存和账本，不上网。只有明确要求刷新时，系统才读取本仓 GitHub 议题，并把这次观测连同源、时间和时效记下来。

**Why this priority**: 发布门刷新策略是本模块与 M2 的分界：M2 把刷新当合同无效；本模块必须让 GitHub 正本上的显式刷新成为唯一网络入口。

**Independent Test**: GitHub 正本下，无刷新参数的查看零网络；带刷新的查看产生一次只读读取；本机正本下刷新参数仍为合同无效。

**Acceptance Scenarios**:

1. **Given** 已连接为本仓 GitHub 正本，**When** 操作者不带刷新查看状态，**Then** 不访问网络；若尚无缓存，工作项相关事实标为数据不足或不可用，不得伪造清单。
2. **Given** 已连接为本仓 GitHub 正本且网络可读，**When** 操作者显式刷新后查看，**Then** 工作项来自这次观测，每项带原始链接、来源身份、观测时间和时效。
3. **Given** 已连接为本机 `local` 正本，**When** 操作者传入刷新类参数，**Then** 仍按合同无效拒绝，不上网。
4. **Given** 健康检查或交接，**When** 操作者未要求刷新，**Then** 这些命令不上网。

---

### User Story 3 - 用同一套当前视图看清议题能不能用 (Priority: P1)

操作者在当前视图里看到本仓议题投影：这是观测值不是本机权威任务；现在能不能用；是新、旧、未知还是不适用。议题标题可以显示，议题正文不得变成指令或授权。缺失用量不得写成 `0`。

**Why this priority**: 发布门要求外部工作项视图与本机账本共用三轴 CurrentView，否则 GitHub 正本只是另一份清单。

**Independent Test**: 刷新成功后的当前视图，每条外部工作项都能读到链接、`github:owner/repo#号` 引用、观测时间和三轴；把议题正文塞进交接或授权的路径不存在。

**Acceptance Scenarios**:

1. **Given** 最近一次刷新成功，**When** 操作者查看状态，**Then** 每条外部工作项暴露原始链接、来源引用、观测时间和时效，且 `fact_class` 为观测值而非本机权威任务生命周期。
2. **Given** 某条议题引用无法解析成 `github:owner/repo#号`，**When** 系统处理该条，**Then** 拒绝采用，不得猜测补全。
3. **Given** 议题含有正文、评论或附件，**When** 生成当前视图、交接或下一步文本，**Then** 这些正文不进入指令或授权字段；至多保留带来源的引用身份。
4. **Given** GitHub 未返回某项用量或时间，**When** 写入当前视图，**Then** 该槽为不可用或数据不足，不得填 `0`。

---

### User Story 4 - 刷新失败仍保住旧观测，并且绝不写回 (Priority: P1)

网络没有、配额用尽或读取失败时，系统留下上次观测，标成过期或不可用，不假装刚刚刷新成功，也不清空成「没有议题」。适配器不能改 GitHub 议题。交接可以引用已投影的议题，但不会关闭或评论该议题。

**Why this priority**: 失败路径若清空缓存或偷偷写回，会把影子做成第二套正本或破坏外部生命周期。

**Independent Test**: 先有一次成功缓存，再让刷新失败，旧工作项仍在且时效不是 fresh；测试替身证明读取路径只发生只读操作；交接成功不改变外部议题。

**Acceptance Scenarios**:

1. **Given** 本地已有一次成功投影，**When** 刷新因离线或读取失败而失败，**Then** 旧观测保留，时效为过期或不可用，不得静默清空，也不得把时效写成新鲜。
2. **Given** 投影缓存已超过项目默认过期阈值，**When** 操作者不刷新查看，**Then** 工作项仍展示，但时效为过期。
3. **Given** 任何本模块命令路径，**When** 运行适配器测试，**Then** 不出现创建、修改、关闭、评论或合并 GitHub 议题的操作。
4. **Given** 缓存中存在合法外部工作项引用，**When** 操作者对该引用做交接，**Then** 本机记下交接，外部议题生命周期不变。

---

### Edge Cases

- 本模块只把本公开仓当作 GitHub 正本；其他 GitHub 仓库、私有仓、需要凭据的读取一律拒绝，不存 token。
- 不从 git remote 自动探测仓库身份，以免暗含网络或 git 耦合。
- GitHub 列表里夹带的 Pull Request 不作为本模块工作项。
- 分页或过滤导致集合不完整时，工作项集合标数据不足或非新鲜，不得假装已穷尽本仓全部议题。
- 本机 `local` 正本的工作项生命周期、锁、损坏与 `validate` 合同保持 M2；本模块不得把 GitHub 状态转换追加成本机工作项打开/关闭事件。
- 外部引用必须是 `github:<owner>/<repo>#<issue>`；缺号、缺仓、把 GitLab 写法拿来用，一律拒绝猜测。
- 写者冲突时刷新不得抢锁改账本；缓存写入不得假装成授权或任务正本变更。
- 未知子命令、GitLab 正本、决策状态机、网页、出站运行时：仍明确失败。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 操作者 MUST 能把当前工作目录连接为 `task_authority=github` 的 Project，仓库身份 MUST 为本公开仓可解析身份。MUST NOT 存储 Provider 凭据。MUST NOT 从 git remote 自动探测。
- **FR-002**: 每个已连接 Project MUST 恰好报告一个任务正本。`github` 与 `local` 不得共存。GitLab 与非本仓 GitHub 身份 MUST 失败关闭。
- **FR-003**: GitHub 正本的冷启动 MUST 仍按 M2 顺序写入本机连接、指挥官、首份授权与当值项目负责人。连接成功 MUST NOT 默认访问网络。
- **FR-004**: GitHub 正本下，工作项生命周期 MUST 保持为 GitHub 议题的只读投影。本机账本 MUST NOT 复制议题状态转换，伪装成本机 WorkItem 生命周期。
- **FR-005**: `status` 默认 MUST 只读本机账本与可重建投影缓存，MUST NOT 访问网络。只有显式刷新选项才允许网络读取，且仅限 GitHub 正本。
- **FR-006**: `local` 正本下，刷新类参数 MUST 仍为合同无效（退出码 2），行为与 M2 一致。
- **FR-007**: 显式刷新 MUST 只读取本仓议题投影（身份、标题或目标、视图所需最小状态、原始链接、来源 revision 或等价观测标记、观测时间）。MUST NOT 写回议题、MUST NOT 自动合并、MUST NOT 部署。
- **FR-008**: 每条被采用的外部工作项 MUST 带 `external_ref`，格式为 `github:<owner>/<repo>#<issue>`。无法判定时 MUST 拒绝该条，禁止猜测。
- **FR-009**: 外部议题正文、评论、附件和原始角色卡 MUST 视为不可信引用数据，MUST NOT 进入指令、授权体或下一步命令文本。
- **FR-010**: 投影与观测 MUST 标识来源和 freshness。离线、配额不足或拉取失败时 MUST 保留旧观测，标记 `stale` 或 `unavailable`，MUST NOT 静默清空，MUST NOT 伪造 `fresh`。
- **FR-011**: 缓存中的投影超过项目默认过期阈值时，未刷新的查看 MUST 将对应时效标为 `stale`，而不是当作新鲜权威。
- **FR-012**: CurrentView 的每项重要事实 MUST 继续携带三轴。GitHub 工作项身份与状态 MUST 为 `observed`（不是本机 `authoritative` 任务生命周期）。缺失用量或时间 MUST NOT 写成 `0`。
- **FR-013**: `doctor`、`handoff` 与无刷新的 `status` MUST NOT 访问网络。`handoff` 可以引用已投影的外部工作项，MUST NOT 改变 GitHub 议题。
- **FR-014**: 当正本为 `github` 时，打开本机 WorkItem 的领域路径 MUST 拒绝，以免在 GitHub 正本下再生一套本地任务。
- **FR-015**: 适配器测试 MUST 证明没有发生 Issue 写回（创建、修改、关闭、评论、合并）。
- **FR-016**: 四个命令的退出码族、机器可读 JSON 与 `validate` 合同 MUST 保持 M1/M2。版本保持 `0.1.0`。
- **FR-017**: MUST NOT 实现 GitLab 适配器、Web 控制台、Cordis、决策状态机、出站 Runtime、后台刷新、守护进程或凭据存储。
- **FR-018**: 实现任何新的可观察行为前 MUST 先有一条会失败的测试。门禁测试 MUST 不依赖实时 GitHub 网络；实时读取若存在，只能是维护者可选步骤，失败时报告不可用，不得把未观测写成成功。
- **FR-019**: Windows 与 POSIX MUST 都能完成连接、默认查看、显式刷新（可用替身）与交接验证，无需后台服务。

### Key Entities

- **Project**: 连接记录；本模块允许 `task_authority=github` 且仓库为本公开仓。
- **GitHubIssueProjection**: 一次观测到的议题影子：来源引用、原始链接、标题或目标、最小状态、来源 revision 或等价标记、`observed_at`、freshness。不是第二套生命周期。
- **ProjectionCache**: 本机可重建派生缓存；刷新写入，默认状态读取。失败时不得无故删除。
- **ExternalRef**: `github:<owner>/<repo>#<issue>`。无法解析则不采用。
- **CurrentView**: 与 M2 同一视图合同家族；`task_authority` 可为 `github`；工作项可来自投影。
- **Handoff**: 仍为本机执行协调事实；可引用外部工作项身份，不拥有该议题。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 按快速开始，操作者能在 10 分钟内于 Windows 或 POSIX 上完成本仓 GitHub 连接，并得到机器可读成功结果（两类环境各至少一次；刷新可用替身）。
- **SC-002**: GitHub 正本下，100% 的无刷新 `status` / `doctor` / `handoff` 样例不发起网络读取。
- **SC-003**: 刷新成功样例中，100% 的被采用工作项带有原始链接、合法 `github:owner/repo#号`、观测时间和三轴；`task_authority` 恰好为 `github`。
- **SC-004**: 在已有缓存后注入刷新失败，100% 保留旧工作项集合，且时效不是 `fresh`；不得出现空清单冒充「仓库没有议题」。
- **SC-005**: 适配器测试 100% 断言只读：无创建/修改/关闭/评论/合并议题的调用。
- **SC-006**: 把议题正文放入夹具时，100% 的当前视图、交接和下一步字段不包含该正文。
- **SC-007**: 无法解析的外部引用、非本仓仓库、GitLab、以及 `local` 下的刷新参数，100% 失败关闭且不猜测。
- **SC-008**: 人为缺失的用量或时间槽 100% 显示不可用或数据不足，不出现用 `0` 填充。

## Assumptions

- 代表性仓库身份是本公开仓 `Blicae8917/hufu`（owner/repo 大小写不敏感）。`connect --repository` 仍由操作者手填；可接受的写法包括常见 HTTPS/SSH 形式，解析后必须等于该 owner/repo。
- 不存储、不读取、不提示 GitHub token。只使用公开、无需登录的读取。私有仓与需凭据的请求不在本模块。
- `status --refresh` 是唯一成功的网络入口。不增加第五个产品命令。
- 过期阈值沿用连接记录中的 `stale_after_hours`，默认 24 小时。
- 刷新读取本仓普通议题（排除 Pull Request）作为代表性集合，不要求一次穷尽全部历史。响应不完整时标数据不足或非新鲜。
- 投影缓存位于工作区 `.hufu/cache/`，已 gitignore，可重建，不是任务正本。
- `handoff --work-item` 对 GitHub 正本接受 `github:owner/repo#号`；该引用必须已出现在当前缓存。
- 门禁与 `pnpm test` 使用录制夹具和可注入的只读端口，不打真实 GitHub。维护者可选的真网步骤写在 quickstart，失败记 `unavailable`。
- 版本保持 `0.1.0`。零 Cordis。不采集效能试点。

## Out of Scope

- GitLab 只读投影
- 任意第三方 GitHub 仓库、GitHub Enterprise、私有仓、token 与 OAuth
- 写回议题、自动合并、部署、Webhook、后台刷新
- 把 GitHub 状态复制成本机第二套生命周期
- Web 控制台、Cordis、决策状态机、出站 Runtime、LoopX
- 从 git remote 或 Issue 正文推断授权
