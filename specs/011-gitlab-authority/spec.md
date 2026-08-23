# Feature Specification: 自建 GitLab AuthorityProvider

**Feature Branch**: `011-gitlab-authority`

**Created**: 2026-08-23

**Status**: Design Only（不是实现授权）

**Input**: User description: "GitHub Module Issue #49：按 ADR 0006 设计自建 GitLab 作为 `task_authority` 的 AuthorityProvider。与已交付 #8 只读投影分开。须回答：自建 GitLab 何时可以成为任务正本（不只是影子）、写回与授权边界、身份 / 失败关闭 / 默认不写回。开本票与落地本 Kit 都不是 Adapter 实现授权。"

**Parent Issue**: [#49](https://github.com/Blicae8917/hufu/issues/49)

**Parent Contract**: [007-gitlab-readonly](../007-gitlab-readonly/spec.md)（#8 已交付的 gitlab.com 只读投影；本票不得默默扩权）、[ADR 0006](../../docs/adr/0006-upstream-positioning.md)（本票属于后续能力类 (1) 自建 GitLab AuthorityProvider）

## 设计声明

本规格是设计合同，不是 Adapter、CLI 或运行时开工令。落地本 Kit 与通过设计约束测试 **不授权** 修改 `src/`、不授权改变 CLI 行为、不授权写回、不授权修订 Constitution。任何后续实现必须另开实现 Pull Request，并先写会失败的适配器测试。外部写回在维护者批准修订 Constitution 之前保持禁止。

本票引用 [ADR 0006](../../docs/adr/0006-upstream-positioning.md)，并证明自己属于该 ADR「后续仅可设计、尚未授权实现」的三类之一：**类 (1) 自建 GitLab AuthorityProvider**。本票不是类 (2) Hufu↔LoopX 桥（#50），也不是类 (3) 企业 Renderer。本票不复活已废止的 M10–M15，也不把出站 Runtime 写成已接受方向。

## User Scenarios & Testing *(mandatory)*

本模块的读者是维护者：用合同判断「自建 GitLab 何时能成为唯一任务正本」，而不是再交付一份只读影子。已交付的 #8 / `007-gitlab-readonly` 继续约束公开 `gitlab.com` 形状的两段 `group/project` 投影。本规格不绑定某一个真实客户实例，公开仓只使用标明为示例的占位身份。

### User Story 1 - 分清只读影子与 Authority (Priority: P1)

维护者打开本 Kit，能指出：哪些能力仍归 #8 只读投影，哪些能力只有在自建实例被声明为 `task_authority=gitlab` 之后才进入 Authority。进入 Authority 并不等于默认可写。

**Why this priority**: Issue #49 的第一交付是与 #8 的边界。若边界含糊，本票会被读成静默扩大 007。

**Independent Test**: 能力表把每一行标成「仍只读（007）」或「进入 Authority（本 Kit 设计）」；007 合同文件不被本票改写；写回默认关闭。

**Acceptance Scenarios**:

1. **Given** 已交付的 #8 只读投影，**When** 维护者对照本规格的能力表，**Then** 公开 `gitlab.com` 两段项目的经典议题投影、无凭据、无写回、对自建 / 私有实例失败关闭，全部仍标为 007 只读，不得被本票改成默认可写。
2. **Given** 操作者要把自建实例当作任务正本而不是影子，**When** 维护者查阅「进入 Authority」行，**Then** 仅看到：显式实例身份、指挥官授权允许清单、默认只读投影、以及被 Constitution 挡住的未来写回闸门。
3. **Given** 本 Kit 已落地，**When** 有人把 007 的只读端口解释成已含自建写回，**Then** 该解释与本规格冲突，必须失败关闭，不得当作已接受行为。

---

### User Story 2 - 自建实例成为 `task_authority=gitlab` 的条件 (Priority: P1)

维护者能陈述：自建 GitLab 何时可以成为项目的唯一任务正本。条件必须同时覆盖身份、授权、失败关闭和默认不写回。缺少任一项就不能声称「已经是 Authority」。

**Why this priority**: Constitution 已允许枚举值 `gitlab`，但 #8 把自建实例拒绝在外。本票必须写清如何从「影子」走到「正本声明」，且默认仍不写回。

**Independent Test**: 用示例占位走完「允许声明 / 拒绝声明」两条；`gitlab.com` SaaS 不得成为默认可写正本；未写入指挥官允许清单的实例被拒绝。

**Acceptance Scenarios**:

1. **Given** 操作者显式声明自建实例身份、两段项目路径，且指挥官授权允许清单包含该实例来源，**When** 维护者按本规格判定，**Then** 该项目可以把 `task_authority=gitlab` 理解为「该自建实例拥有议题生命周期」，Hufu 仍只做带来源的投影，默认不写回。
2. **Given** 实例来源未出现在授权允许清单、写成 `gitlab.com` SaaS、从 git remote 猜测、或缺少指挥官授权，**When** 判定能否成为任务正本，**Then** 必须失败关闭，不得半套连接，也不得把 SaaS 客户项目默认为可写正本。
3. **Given** 正本声明已按本规格成立，**When** 询问写回是否开启，**Then** 默认值为不写回；在 Constitution 写回禁令被维护者修订之前，任何写回授权都无效。

---

### User Story 3 - 证明本票是 ADR 0006 类 (1)，不是废止路线复活 (Priority: P1)

维护者能从本 Kit 直接读到：本票是 ADR 0006 允许设计的自建 GitLab AuthorityProvider，不是复活 M10–M15，不是出站 Runtime，不是 LoopX 桥，也不是企业 Renderer。

**Why this priority**: ADR 0006 要求每个后续能力 Module 引用该 ADR 并证明属于三类之一。错误归类会把已废止控制面或另一张票的范围带进来。

**Independent Test**: 正文同时出现 ADR 0006、#49 与「类 (1)」；出现 M10–M15 / 出站 Runtime 时只作为禁止复活；不出现把 Goal、Todo、Scheduler、Heartbeat、PM Engine、Wave Engine、`hufu serve` 或会当作本票交付。

**Acceptance Scenarios**:

1. **Given** 维护者阅读本规格首页与 Out of Scope，**When** 寻找产品定位引用，**Then** 能看到 ADR 0006 与「自建 GitLab AuthorityProvider」类 (1)，以及「不是实现授权」。
2. **Given** 有人提议在本票实现通用 Goal/Todo/Scheduler/Heartbeat、PM/Wave、完整 Web、会商或出站 Runtime，**When** 对照本规格，**Then** 这些项被明确排除，并指向已废止的 M10–M15 或独立票，不得占用那些编号。
3. **Given** 本公开仓审阅本 Kit，**When** 搜索凭据、私有 Endpoint、内部项目路径或机房 / 家庭部署细节，**Then** 只允许标明为示例的占位符，不得出现真实秘密或私有地址。

---

### Edge Cases

- 本 Kit 落地不等于 007 开始接受自建 Host。007 对私有实例与自建 Host 的失败关闭保持有效，直到未来实现票经授权后另改运行时。
- `task_authority=gitlab` 在 Constitution 中已经表示「GitLab 拥有原生议题生命周期，Hufu 只投影」。本票不把该枚举改成 Hufu 自有生命周期。
- 声明自建实例为正本，仍禁止在本机账本复制议题开关事件。
- 嵌套组、史诗、迭代、Merge Request 作为工作项：仍失败关闭，不在本票发明新 scheme 猜测。
- 凭据不得写入连接记录、账本、缓存、公开仓或示例夹具。未来若需要认证读取，只能走宿主既有凭据机制，缺失时失败关闭，不得把缺失写成已授权。
- 公开仓只使用示例占位：`https://gitlab.example.com`（示例）与 `example-group/example-project`（示例）。真实客户名、内部路径、家庭或机房主机名不得入库。
- Constitution I 与「系统边界」写明第一版 GitHub / GitLab Adapter 只读、外部写回不在已接受范围。本 Kit **不修订** Constitution；未来写回实现在维护者批准修订之前保持阻断。
- 不得占用已废止的 M10–M15 编号；本 Kit 编号为 `011`，不复用 `007`。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 本 Kit MUST 引用 ADR 0006 与 #49，并 MUST 声明自己属于「自建 GitLab AuthorityProvider」类 (1)。MUST NOT 把本票写成 LoopX 桥、企业 Renderer、出站 Runtime，或已废止 M10–M15 的复活。
- **FR-002**: 本 Kit MUST 写明与 #8 / 007 的边界：公开 `gitlab.com` 只读投影、无凭据、无写回、自建 / 私有实例失败关闭，MUST 继续留在 007。MUST NOT 默默扩大 007 合同。
- **FR-003**: 自建实例要成为 `task_authority=gitlab` 的任务正本，MUST 同时满足：操作者显式声明实例来源与两段项目路径、指挥官授权允许清单包含该来源、每个项目恰好一个正本、默认能力为只读投影。MUST NOT 从 git remote 或议题正文推断身份或授权。
- **FR-004**: SaaS `gitlab.com` 上的任意客户项目 MUST NOT 被默认为可写正本。把 `gitlab.com` 写成自建实例 MUST 失败关闭。
- **FR-005**: 写回（创建、修改、关闭、评论、合并）的默认值 MUST 为关闭。在 Constitution 写回禁令被维护者修订之前，写回授权 MUST 视为无效并失败关闭。落地本 Kit MUST NOT 修订 Constitution。
- **FR-006**: 身份、授权、失败关闭与默认不写回 MUST 可独立验收。Journal、Receipt、Projection、RoleBinding 或模型意见 MUST NOT 扩大授权。
- **FR-007**: 公开产物 MUST NOT 包含凭据、私有 Endpoint、内部项目路径、客户名，或家庭 / 机房部署细节。示例 MUST 使用标明为示例的占位符。
- **FR-008**: 外部议题正文、评论与附件 MUST 仍视为不可信引用数据，MUST NOT 进入指令、授权体或裁决正文。
- **FR-009**: 本设计票 MUST NOT 实现 Adapter、MUST NOT 改变 CLI 行为、MUST NOT 改变 `src/` 运行时、MUST NOT 提升版本、MUST NOT 发布 npm。
- **FR-010**: MUST NOT 实现 Goal/Todo/Scheduler/Heartbeat、PM Engine、Wave Engine、`hufu serve`、会商 Runtime、出站 Runtime、Hufu↔LoopX 桥或企业 Renderer。
- **FR-011**: 未来实现票若开工，MUST 先写会失败的适配器测试，再写生产代码。那些失败测试 MUST NOT 作为本设计 PR 的门禁用例落地。
- **FR-012**: 版本 MUST 保持 `0.1.0`。本 Kit MUST NOT 占用 M10–M15 编号，MUST NOT 复用 `007`。

### Key Entities

- **GitLabAuthorityClass**: ADR 0006 三类后续能力中的类 (1)；本票的唯一归类。
- **GitLabInstanceIdentity**: 操作者显式声明的实例种类、来源与两段项目路径。示例来源为 `https://gitlab.example.com`（示例）。
- **AuthorityCapability**: `read_projection`（默认）或未来的 `write_back`（Constitution 修订前无效）。
- **WriteBackGate**: 记录「默认关闭」以及「须维护者修订 Constitution 后才可评估实现」。
- **007ReadonlyBoundary**: 已交付只读投影的不可扩张边界。
- **ExamplePlaceholder**: 公开仓允许的示例身份，必须标明为示例。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 未读过实现代码的维护者能在 10 分钟内从本 Kit 指出至少 8 条能力分别属于「仍只读」或「进入 Authority」，且写回默认关闭。
- **SC-002**: 100% 的「可成为正本」判定样例同时检查身份、授权允许清单、失败关闭与默认不写回；缺一项即判定失败关闭。
- **SC-003**: 100% 的 `gitlab.com` SaaS 可写正本样例被本规格拒绝。
- **SC-004**: 审阅者能在一页内找到 ADR 0006、#49、类 (1) 以及「设计 only / 不是实现授权」。
- **SC-005**: 公开 Kit 与设计约束测试 100% 不含凭据字面量、私有 Endpoint 或未标明示例的内部主机名。
- **SC-006**: 本设计 PR 的门禁测试 100% 通过，且不含会失败的 Adapter 实现测试；版本仍为 `0.1.0`。

## Assumptions

- 「任务正本」指项目声明的唯一 `task_authority`，生命周期仍归 GitLab 原生议题；Hufu 不因此拥有议题。
- 「不只是影子」指：自建实例的议题是该项目的权威来源，而不是另一正本旁边的只读旁路。这仍默认不写回。
- 自建实例身份由操作者手填，不得探测。公开仓示例固定为 `https://gitlab.example.com`（示例）与 `example-group/example-project`（示例）。
- 007 的两段路径、经典 Issue、正文不可信、无后台刷新等边界继续有效。
- Constitution 0.1.0 的只读与写回禁令仍然有效；本 Kit 只记录张力，不修订正文。
- 未来认证读取若被独立实现票接受，凭据仍由宿主常规机制持有，Hufu 不存储。

## Out of Scope

- 本票内实现 Adapter、改 CLI、改 `src/` 运行时、发布 npm、提升版本、打标签、关闭 #49 或编辑 #5
- 把 SaaS `gitlab.com` 任意客户项目默认为可写正本
- 修订 Constitution 或把本 Kit 落地解释成已经批准写回
- 默默扩大 007 只读合同
- Goal/Todo/Scheduler/Heartbeat、PM/Wave Engine、`hufu serve`、会商、出站 Runtime
- Hufu↔LoopX 桥（#50）与企业 Renderer
- 占用已废止的 M10–M15 编号
- 在公开仓写入凭据、内部路径、客户名或家庭 / 机房细节
