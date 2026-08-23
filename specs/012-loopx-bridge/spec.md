# Feature Specification: Hufu↔LoopX Authority / Decision / Evidence 桥

**Feature Branch**: `012-loopx-bridge`

**Created**: 2026-08-23

**Status**: Design + implementation-authorized（#50 设计史保持；实现后继 [#58](https://github.com/Blicae8917/hufu/issues/58) / ADR 0007）。本波仍不交付 Adapter。

**Input**: User description: "GitHub Module Issue #50：按 ADR 0006 设计 Hufu 与 LoopX 之间仅覆盖 Authority / Decision / Evidence 的桥。Hufu 是 LoopX 下游的严格项目协调 Provider，不是第二套长任务控制面。已交付的 loopx-mechanisms（#9 / specs/008-loopx-engine）仍只是须显式选用的机制记录口，不是任务正本，也不得被本票静默升格。写明三端哪些字段可过桥、哪些必须留在本侧；LoopX 不得取代 GitHub / GitLab 原生 Issue 生命周期，也不得从 Journal、Receipt 或执行结果反推或扩大授权。不引入 LoopX 发行包、不复制上游源码。开本票与落地本设计 kit 都不是 Adapter 实现授权。"

**Parent Issue**: [#50](https://github.com/Blicae8917/hufu/issues/50)（设计史，不关闭）

**Implementation Issue**: [#58](https://github.com/Blicae8917/hufu/issues/58)

**RunOnce Implementation Issue**: [#68](https://github.com/Blicae8917/hufu/issues/68)

> **#68 增量优先级**：本文中“本波仍不交付 Adapter / 不改 `src/`”是 #50 设计波及
> #58 首批引用桥实现的历史边界。#68 已另获授权，交付固定 LoopX v0.5.2 的注入式
> RunOnce Consumer；若历史措辞与本增量冲突，以本节和
> `contracts/run-once.v1.md` 为准。#68 仍不交付真实 Host、Scheduler 或常驻循环。

**Parent Contract**: [ADR 0006](../../docs/adr/0006-upstream-positioning.md)（产品定位与三类后续能力）、[ADR 0003](../../docs/adr/0003-cordis-first-plugin-architecture.md)（已被 0006 修订的 LoopX 定位）、[008-loopx-engine](../008-loopx-engine/spec.md)（已交付机制记录口，不是本桥）、[005-zero-copy-decision](../005-zero-copy-decision/spec.md)（canonical Decision 引用）、[003-local-ledger-commands](../003-local-ledger-commands/spec.md)（AuthorizationGrant 与本机正本）

**ADR class**: 第 (2) 类。ADR 0006「三类后续能力」历史清单仍为：(1) 自建 GitLab AuthorityProvider；(2) Hufu↔LoopX 的 Authority / Decision / Evidence 桥；(3) 企业项目 Renderer。#50 / 本 kit 只属于第 (2) 类，不实现 (1) 或 (3)。ADR 0007 已授权实现本类；合同基线为 LoopX **v0.5.2**（release `423035f402e2f1703f076c3cfe60c14c5803433f`），不 vendoring，不依赖 `loopx`。最新 LoopX `main` 仅供研究。

## User Scenarios & Testing *(mandatory)*

本模块的用户仍是本公开仓库的维护者。它交付的是**设计合同**：桥的三端字段白名单、本侧留守清单，以及 LoopX 不得代管原生议题生命周期、不得从 Journal / Receipt / 执行结果反推授权的失败关闭规则。它不交付 Adapter、不改 CLI、不改 `src/` 运行时。

阅读本规格与 `contracts/` 即可独立验收设计合同。实现授权由 #58 / ADR 0007 下达；本波仍不交付 Adapter，后续实现 PR 必须先失败测试。

### User Story 1 - 三端字段白名单可独立核对 (Priority: P1)

维护者打开本 kit 的规格与合同，能够指出：Authority、Decision、Evidence 三类各有哪些字段允许过桥，哪些必须留在 Hufu 本侧，哪些必须留在 LoopX 本侧。过桥字段只携带稳定引用、摘要或带来源的观测指针，不携带授权正文、裁决正文或议题正文。

**Why this priority**: Issue #50 的首要必须交付是三端字段划分。没有白名单，后续 Adapter 会把 Journal、回执或 Goal 误当成可过桥权威。

**Independent Test**: `contracts/authority.v1.md`、`contracts/decision.v1.md`、`contracts/evidence.v1.md` 与 `contracts/stay-on-side.v1.md` 各自列出可过桥字段与本侧留守字段；设计约束测试断言这些合同存在且含字段表。

**Acceptance Scenarios**:

1. **Given** 维护者阅读 Authority 合同，**When** 核对接权相关字段，**Then** 仅 `task_authority` 声明、`task_ref` 身份、`AuthoritySnapshotRef` 与不透明 `authority_scope_ref` 允许过桥；`AuthorizationGrant` 正文、`scope_text`、RoleBinding / SessionBinding 作为授权本体、议题 `body` 必须留在 Hufu 或原生追踪器。
2. **Given** 维护者阅读 Decision 合同，**When** 核对裁决相关字段，**Then** 仅稳定 `DecisionRef`（`decision_id` / `version` / `content_digest`）允许过桥；`DECISION_PACKET` 语义正文、`EXECUTION_ENVELOPE`、`ROUTE_ACK` 与三类 Delta 正文必须留在 Hufu。
3. **Given** 维护者阅读 Evidence 合同，**When** 核对证据相关字段，**Then** 仅 `evidence_ref`、绑定身份指针与三轴 / `observed_at` 允许过桥；Receipt、Journal、TypedResult、效果 `observed_result` 不得作为授权或议题完成声明过桥。
4. **Given** 一份声称「LoopX Goal / Todo / Registry 可映射为 Hufu 工作项或 `task_authority`」的设计，**When** 对照本 kit，**Then** 该设计不合格。

---

### User Story 2 - 原生议题生命周期与反向授权被明确禁止 (Priority: P1)

维护者能够向评审者指出：桥不得让 LoopX 取代 GitHub / GitLab 原生 Issue 生命周期；也不得从 Journal、Receipt 或任何执行结果反推或扩大授权。即使上述对象作为观测出现，也只能 fail closed 回到既有授权渠道。

**Why this priority**: 这是 ADR 0006 第 4 条与 Constitution I 的硬边界。若执行结果能扩权，Hufu 就会变成第二套任务系统。

**Independent Test**: 规格 FR 与 `contracts/stay-on-side.v1.md` 写明禁止项；设计约束测试断言这些句子存在，且 kit 不把 Journal / Receipt / 执行结果列为授权来源。

**Acceptance Scenarios**:

1. **Given** 任务正本为 `github` 或 `gitlab`，**When** 评估任何桥接设计或未来 Adapter，**Then** 不得创建、修改、关闭、评论、合并或复制原生 Issue 生命周期；Hufu 继续只持有带来源与 freshness 的只读 Projection。
2. **Given** 出现 Journal、Receipt、TypedResult、效果读回或 Host 运行结果，**When** 任一侧试图据此签发、修订或扩大 `AuthorizationGrant`，**Then** 必须失败关闭，授权修订不变。
3. **Given** `ROUTE_ACK` 非空 `added_scope` 或 CurrentView 派生的 `next_action` / `blocked_by`，**When** 作为过桥授权依据，**Then** 不合格；这些对象不是授权来源。
4. **Given** 缺失墙钟、用量或读回，**When** 过桥或物化，**Then** 必须报告 `unavailable` 或 `data_insufficient`，MUST NOT 写成数字 `0`。

---

### User Story 3 - 本票是第 (2) 类设计，不得升格 008，也不得搬控制面 (Priority: P1)

维护者能够证明：本票引用 ADR 0006 且只属于第 (2) 类桥；#9 / `specs/008-loopx-engine` 的 `loopx-mechanisms` 仍只是须显式选用的机制记录口，不是任务正本，也不是本桥；本 kit 不复活 M10–M15，不把 Goal / Todo / Scheduler / Heartbeat 或完整 Web 控制面搬进 Hufu，不引入 LoopX 发行包，不复制上游源码。

**Why this priority**: ADR 0006 要求每个后续 Module 证明自己属于三类之一；#50 明确禁止把 #9 升格。没有这条，设计 kit 会被读成实现令或第二套控制面。

**Independent Test**: 规格与 `contracts/008-non-promotion.v1.md` 同时写明第 (2) 类归属、008 非升格、禁止发行包 / 源码搬入、禁止复活 M10–M15 / `hufu serve`；设计约束测试锁定这些句子。

**Acceptance Scenarios**:

1. **Given** 评审者打开本 spec，**When** 寻找 ADR 归属，**Then** 可见「第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥」，且写明不是 (1) GitLab AuthorityProvider、不是 (3) 企业 Renderer。
2. **Given** 已交付的 `loopx-mechanisms` 选用记录，**When** 对照本桥，**Then** 该选用不构成桥的启用、不改变 `task_authority`、不授权把 TypedResult / Receipt 当成正本。
3. **Given** 设计或后续实现试图加入 `loopx` 依赖、vendoring 上游源码、或默认启用完整控制面，**When** 对照本 kit，**Then** 不合格；采用任何机制仍须独立 Module、边界测试、效能假设、可逆关闭，并遵守该提交的许可证与 NOTICE。
4. **Given** 试图把本波 kit 更新读成已经交付 Adapter，或复活 M10–M15、会商 Runtime、`hufu serve`，**When** 对照 Status 与 Out of Scope，**Then** 本波仍未交付运行时；实现只属于 #58 后续 PR。

---

### User Story 4 - 固定基线的一次 RunOnce 可以安全计划、执行和恢复 (Priority: P1)

维护者注入一个已 qualified 的 RunOncePort、独立 Validator 和显式
`BridgeActivationReceipt` 后，可以为真实 `ExecutionEnvelopeRef` + `SessionBindingRef`
执行一次 bounded run-once；下一 Turn 只在 Effect readback 与 Receipt 完整后放行。

**Independent Test**: public-safe fake port 覆盖默认关闭、能力不合格、成功、失败、超时、
伪造 TypedResult、readback 缺失、重复 Turn 与重启恢复，且 RunOncePort 最多调用一次。

**Acceptance Scenarios**:

1. 没有显式 activation receipt 或没有齐备的 Adapter / Validator / readback 时，只能 Plan，不能 Execute。
2. Plan 必须包含真实 Envelope、真实 SessionBinding generation、固定 v0.5.2 commit 与稳定 turn key。
3. Execute 前先 readback；既有完整结果直接恢复，prepared / unavailable 不盲重试。
4. 独立 Validator 拒绝伪造结果时，不形成下一 Turn。
5. 只有 TypedResultRef、EffectRef、Validator Receipt、Effect readback 和 Receipt 全部匹配时，`next_allowed=true`。

---

### Edge Cases

- 本 kit 的存在不得改变 #6 / #8 / #9 已交付命令合同。未另立实现授权时，不得出现桥 Adapter。
- 选用 `loopx-mechanisms` 与启用本桥是两件独立的事；前者不得暗示后者。
- 过桥的 `authority_scope_ref` 只是 `{ grant_id, revision }` 指针，不得夹带 `scope_text` 或命令短语。
- 过桥的 `AuthoritySnapshotRef` 不得夹带 Issue `body`、评论或状态机枚举。
- 过桥的 `DecisionRef` 不得夹带 `business_outcome` 等 Packet 语义字段。
- 过桥的 Evidence 指针不得把 `proposition`、Journal 原文或模型响应写成指令。
- 未知字段、控制面字段或授权正文出现在桥载荷中必须失败关闭，不得猜测「只是引用」。
- 本模块不绑定真实客户 LoopX 项目或私有 Endpoint。
- 本模块不实现 GitLab 写能力或企业 Renderer。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 本模块 MUST 以设计合同回答三端字段划分。MUST 分别列出 Authority / Decision / Evidence 的可过桥字段与本侧留守字段。本 PR MUST NOT 实现桥 Adapter，MUST NOT 改变 CLI 行为，MUST NOT 修改 `src/` 运行时。
- **FR-002**: 本模块 MUST 引用 [ADR 0006](../../docs/adr/0006-upstream-positioning.md)、[#50](https://github.com/Blicae8917/hufu/issues/50) 与 [#58](https://github.com/Blicae8917/hufu/issues/58)，并证明自己属于第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥。MUST NOT 把本票写成第 (1) 类 GitLab AuthorityProvider 或第 (3) 类企业 Renderer。
- **FR-003**: 本模块 MUST 声明 #50 为设计史、#58 / ADR 0007 为实现授权。本波 MUST NOT 实现桥 Adapter，MUST NOT 改变 CLI，MUST NOT 修改 `src/` 运行时。后续实现 PR 在失败测试落地前 MUST 视为未开工。
- **FR-004**: Authority 可过桥字段 MUST 仅限：`task_authority` 枚举声明（`github` \| `gitlab` \| `local`）、`task_ref` 身份、`AuthoritySnapshotRef`（`task_ref` / `source_revision` / `observed_at` / `freshness`）、不透明 `authority_scope_ref`（`{ grant_id, revision }`）、不透明 `SessionBindingRef`。MUST NOT 过桥 `AuthorizationGrant` 正文、`scope_text`、`issuer_id`、RoleBinding / SessionBinding 授权本体、议题 `body`。
- **FR-005**: Decision 可过桥字段 MUST 仅限稳定 `DecisionRef`：`{ decision_id, version, content_digest }`，以及不透明 `ExecutionEnvelopeRef`。可选附带不透明成分摘要（`outcome_digest` / `state_digest` / `acceptance_digest`）仅供相等性核对。MUST NOT 过桥 `DECISION_PACKET` 语义正文、`EXECUTION_ENVELOPE` 正文、`ROUTE_ACK`、`FACT_DELTA` / `DECISION_DELTA` / `EFFECT_DELTA` 正文。
- **FR-006**: Evidence 可过桥字段 MUST 仅限：`EvidenceRef` / `evidence_ref`、相关目标 / 输入 / 效果 / 工作项的身份指针、`EffectRef`、`ReceiptRef`、`TypedResultRef`、`fact_class`、`availability`、`freshness`、`observed_at`。MUST NOT 把 Receipt / Journal / TypedResult / `observed_result` 或 Host 运行结果当作授权、验收或议题完成声明过桥。
- **FR-007**: LoopX MUST NOT 取代 GitHub / GitLab 原生 Issue 生命周期。`github` / `gitlab` 正本下，桥的全部路径 MUST 保持只读 Projection 合同；MUST NOT 出现创建、修改、关闭、评论、合并或第二套权威状态机。
- **FR-008**: Journal、Receipt、类型化结果、效果读回、Host 运行结果、CurrentView 派生值与 `ROUTE_ACK` MUST NOT 被用来反推或扩大授权。`authority_scope_ref` 只能引用既有 `AuthorizationGrant`，不能使桥载荷成为新的授权来源。
- **FR-009**: MUST NOT 把 #9 / `specs/008-loopx-engine` 的 `loopx-mechanisms` 升格为 `task_authority` 或本桥。008 仍只是须显式选用的机制记录口。绑定 008 MUST NOT 启用本桥。
- **FR-010**: MUST NOT 把 Goal / Todo / Scheduler / Heartbeat、PM Engine、Wave Engine 或完整 Web 控制面搬进 Hufu。MUST NOT 复活 M10–M15、关键决策会商 Runtime、出站 RuntimeProvider 或默认 `hufu serve`。
- **FR-011**: MUST NOT 引入 LoopX 发行包，MUST NOT 复制或 vendoring 上游源码。后续若另立 Module 采用机制或源码，MUST 遵守该提交的许可证与 NOTICE，并具备边界测试、效能假设与可逆关闭路径。
- **FR-012**: MUST NOT 实现自建 GitLab AuthorityProvider（#49）或企业 Renderer。本 kit MUST NOT 修改 `docs/SPEC.md`、`AGENTS.md` 或 008 的行为合同。
- **FR-013**: 每个已连接 Project MUST 仍然恰好报告一个 `task_authority`。LoopX、引擎、桥 Adapter 均 MUST NOT 加入该枚举。
- **FR-014**: 缺失的墙钟、用量、读回或上游观测 MUST NOT 写成 `0`。只能报告 `unavailable` 或 `data_insufficient`。
- **FR-015**: 本 kit MUST 附带会通过的设计约束测试。失败的 Adapter / 实现测试 MUST 只写在 `tasks.md` 供 #58 实现 PR，MUST NOT 在本波落地以免破坏 CI。版本保持 `0.1.0`。MUST NOT 引入 `loopx` 依赖或 vendoring 上游源码。后续实现结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。
- **FR-016**: #68 MUST 固定 LoopX `v0.5.2` / `423035f402e2f1703f076c3cfe60c14c5803433f`，不得使用 moving `main` 作为运行合同。
- **FR-017**: 桥 MUST 默认关闭；只有 digest 正确、能力齐备、Adapter 与 Validator 身份分离的 `BridgeActivationReceipt` 可以启用。
- **FR-018**: `prepareOutboundTurn` MUST 绑定真实 `ExecutionEnvelopeRef` 和真实 `SessionBindingRef`；MUST NOT 从 RoleBinding / project_lead 推导 generation。
- **FR-019**: RunOncePort MUST 由 Consumer 注入；没有 Port 时 MUST 仍可 Plan，但 MUST NOT Execute 或静默降级。
- **FR-020**: 每个 Plan MUST 为单次 bounded run-once，`max_invocations=1`；不得实现 Scheduler、while-loop 或持续唤醒。
- **FR-021**: 物质 TypedResult MUST 经独立 Validator；Validator 身份 MUST 与 Adapter 身份不同。
- **FR-022**: 只有 Effect readback、Validator Receipt 与最终 Receipt 完整绑定同一 Turn 后，才允许下一 Turn。
- **FR-023**: 失败 / 超时 / 重启 MUST 先 readback；complete 复用、prepared / unavailable 失败关闭，不得盲目重试。
- **FR-024**: 显式 wrapper 只能由 Provider 自有配置解析；桥只携带 `runtime_locator_ref`，不得持久化本机路径正文。
- **FR-025**: #68 MUST 不增加 `loopx` 依赖、不 vendor、不安装 LoopX、不调用真实 Host；测试只使用 public-safe fake port。

### Key Entities

- **BridgeClassProof**: 证明本票属于 ADR 0006 第 (2) 类的引用记录。
- **AuthorityCrossing**: 允许过桥的授权指针集合；不是授权正文。
- **DecisionCrossing**: 允许过桥的稳定决策引用；不是裁决正文。
- **EvidenceCrossing**: 允许过桥的证据身份与三轴；不是 Receipt / Journal / 执行结果授权。
- **StayOnSideSet**: 必须留在 Hufu 或 LoopX 本侧的字段与对象。
- **NonPromotion008**: 008 / #9 保持机制记录口的显式非升格声明。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 维护者能在 10 分钟内从本 kit 指出三端可过桥字段与本侧留守字段，无需阅读 `src/`。
- **SC-002**: 100% 设计约束测试通过，且断言本 kit 引用 ADR 0006、#50、#58 与 ADR 0007、禁止反向授权、禁止升格 008、禁止发行包 / 源码搬入。
- **SC-003**: 把 Journal / Receipt / 执行结果写成授权来源的设计陈述在本 kit 中 100% 被列为不合格。
- **SC-004**: 把 `loopx-mechanisms` 或 LoopX 写成 `task_authority` 的设计陈述在本 kit 中 100% 被列为不合格。
- **SC-005**: 本 PR 合入后 `package.json` 版本仍为 `0.1.0`，任何 `package.json` 依赖字段仍不含 `loopx`，CLI 行为与 `src/` 运行时不变。

## Assumptions

- 本模块用户是本公开仓维护者。字段名沿用已交付的 003 / 005 / 008 合同，不另造第二套授权或决策词汇。
- 「过桥」在本设计阶段只表示合同允许出现在未来桥载荷中的字段集合，不表示已经存在传输通道、网络客户端或 CLI 标志。
- 默认不复制、不改编、不 vendoring 上游源码，也不把 LoopX 发行包列为产品依赖。LoopX 核对本仍见 `docs/COMPATIBILITY.md`；本 kit 不改钉、不把 HEAD 观测写成已接受实现基线。
- 008 已交付的 TypedResult / Receipt / 有界恢复继续只在显式选用 `loopx-mechanisms` 后作为执行机制记录存在，不因本桥获得正本地位。
- #49 自建 GitLab AuthorityProvider 与企业 Renderer 由独立 Module 拥有；本 kit 只引用边界，不写入它们的树。
- 门禁使用公开安全夹具，不写客户项目名、本机路径或私有 Endpoint。
- 版本保持 `0.1.0`。不采集效能试点。不新增 Cordis 插件。

## Out of Scope

- 本波实现桥 Adapter、修改 CLI、修改 `src/` 运行时、提升版本或打标签
- 把 LoopX 或 `loopx-mechanisms` 作为 `task_authority`
- 把 Goal / Todo / Scheduler / Heartbeat、PM Engine、Wave Engine 或完整 Web 控制面搬进 Hufu
- 复活 M10–M15、会商 Runtime、出站 Runtime、默认 `hufu serve`
- 实现自建 GitLab AuthorityProvider（#49）或企业 Renderer
- 引入 LoopX 发行包，或复制 / vendoring 上游源码
- 外部议题写回、Webhook、私有控制面 Endpoint
- 修改 Host Agent Loop
- 关闭 #50 或改写 #5
