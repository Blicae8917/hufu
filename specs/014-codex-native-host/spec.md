# Feature Specification: Codex NativeHost RuntimeProvider + SessionBinding

**Feature Branch**: `014-codex-native-host`

**Created**: 2026-08-23

**Status**: Implemented（#59 packet-only Provider；#67 Codex App Consumer v2）

**Input**: User description: "Hufu 核心不创建 Session。Codex Consumer 调用宿主原生工具；Hufu 只发 action packet 并记录结果。最小接口 capabilities/start/resume/send/observe/wait/interrupt/release/readback。"

**Parent Issues**: [#59](https://github.com/Blicae8917/hufu/issues/59)、[#67](https://github.com/Blicae8917/hufu/issues/67)

**Parent Contract**: [ADR 0007](../../docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md)、ADR 0002 / 0003、Constitution V

## 设计声明

本规格先由 #59 落地 packet-only Provider，再由 #67 增加 Codex App Consumer v2。Consumer 使用
`prepare*` / `complete*` 两阶段：Hufu 先把脱敏 action packet 落入 append-only Ledger，运行中的
Codex Host Consumer 在两阶段之间调用宿主工具，随后把结果与 readback 落账。测试只使用公开安全
fake adapter，不调用真实 Codex thread，不新增网络入口。独立 CLI / daemon 仍失败关闭，禁止静默
回退到 subagent 或 CLI thread。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 最小宿主接口 (Priority: P1)

维护者能核对照表：Hufu 只下发 packet；Codex Consumer 把 `start` 映射到 `create_thread`，`send`
映射到 `send_message_to_thread`，`wait` 映射到有界 `wait_threads`，`observe` / `readback` / release
预检映射到 `read_thread`。当前 Host 没有可验证的原生 interrupt 时明确返回 `unavailable`；逻辑
换届只追加 Hufu handoff 事实，不误用物理 `handoff_thread`。

**Acceptance Scenarios**:

1. **Given** 独立 CLI 且宿主原生工具缺失，**When** 调用 start / send，**Then** 失败关闭，不静默改走 subagent。
2. **Given** 活跃 Turn，**When** 再发额外消息，**Then** 只能排队或拒绝，不得强行 interrupt。
3. **Given** 无投递 / readback，**When** 声称已唤醒或已投递，**Then** 不合格。
4. **Given** `create_thread` 只返回 `clientThreadId`，**When** Hufu 完成 start，**Then** binding 保持
   `pending`；`clientThreadId` 不得传给需要 `threadId` 的工具。Consumer 只能用准备时生成的唯一
   correlation title 经 `list_threads` 解析稳定 `threadId + hostId`，之后才能用 `read_thread` observe
   并进入 `ready`。

---

### User Story 2 - SessionBinding 唯一性 (Priority: P1)

每个 authority / work-item / role / channel 至多一个活跃 binding。`start` 使用 CAS + generation fence。旧 generation 的 send / result / close 被拒绝。换届 = Handoff 后后继带 `supersedes`。

**Acceptance Scenarios**:

1. **Given** 已有活跃 binding，**When** 同槽再 start，**Then** CAS 失败或进入换届，不得双 Session。
2. **Given** 旧 generation 回执，**When** 被当作当前结果，**Then** 拒绝。
3. **Given** 读取原始 transcript 的设计，**When** 对照本规格，**Then** 不合格。

---

### User Story 3 - Provider 不等价 (Priority: P1)

Claude / DeepSeek Harness / Codex 不是等价运行时。Codex App 可声明原生 thread 工具；Codex CLI 只声明 headless `exec` / `resume`；Claude Chat 默认只读，不得冒充可写构建运行时；attached provider 只能绑定已存在 Session。每个 Provider 必须做 declared / observed / qualified 检查。

**Acceptance Scenarios**:

1. **Given** Claude Chat Consumer，**When** 宣称可创建可写构建 Session，**Then** 不合格。
2. **Given** Codex CLI Provider，**When** 宣称拥有 App managed thread，**Then** 不合格。
3. **Given** 未 qualified 的能力，**When** start，**Then** 失败关闭。

## Edge Cases

- Codex CLI exec/resume、app-server managed thread、Desktop 可见任务必须分别声明。
- 不得读取原始 transcript。
- 不得把 Hufu 做成 Session 工厂。
- 版本保持 `0.1.0`。不 npm-publish。

## Requirements *(mandatory)*

- **FR-001**: Hufu 核心 MUST NOT 创建 Session。MUST 只下发 action packet 并记录结果。
- **FR-002**: 最小接口 MUST 为 `capabilities`、`start`、`resume`、`send`、`observe`、`wait`、`interrupt`、`release`、`readback`。`wait` MUST 有界，MUST NOT 紧循环轮询。
- **FR-003**: SessionBinding MUST 含不透明 `host_thread_ref`、`authority_ref`、`work_item_ref`、`role`、workspace/worktree/branch ref、generation/fence、parent/`supersedes`、`capability_digest`、created/observed 时间戳、current turn ref。
- **FR-004**: 每个 authority / work-item / role / channel MUST 至多一个活跃 binding。`start` MUST 使用 CAS + generation fence。
- **FR-005**: 独立 CLI / daemon 在宿主原生工具缺失时 MUST 失败关闭，MUST NOT 静默回退。
- **FR-006**: Claude Chat 默认 MUST 只读，MUST NOT 冒充可写构建运行时。
- **FR-007**: MUST NOT 读取原始 transcript。无投递 / readback MUST NOT 声称已唤醒或已投递。
- **FR-008**: Codex App Consumer MUST 以 `prepareStart/completeStart`、`prepareSend/completeSend`、
  `prepareWait/completeWait`、`prepareReadback/completeReadback` 执行；Host 调用 MUST 位于两阶段之间。
  prepared packet、binding、generation/fence、idempotency、hostId/cursor 与 receipt/readback MUST
  写入 Hufu Ledger并可在进程重启后恢复。
- **FR-009**: MUST NOT 实现 Goal/Todo/Scheduler/Heartbeat、PM/Wave Engine、`hufu serve` 或企业 Renderer。
- **FR-010**: 后续实现结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。
- **FR-011**: 真实生产写回 MUST 仍视为未授予；HTTP 写 MUST 另有 exception ref。
- **FR-012**: `message_ref` MUST 经受控 Resolver 生成 prompt；Ledger MUST 只保存 ref 与 digest，
  MUST NOT 保存 prompt正文、Issue正文或 raw transcript。
- **FR-013**: active Turn 的额外消息 MUST 真实耐久排队或明确拒绝；当前实现采用明确拒绝。
- **FR-014**: release MUST 先执行 Host `read_thread` 并由 readback 确认；逻辑 handoff MUST NOT
  调用物理 `handoff_thread`。
- **FR-015**: Codex App工具参数 MUST 与当前Host合同一致：`create_thread`使用`prompt + target`，
  `send_message_to_thread`使用`prompt + threadId`；pending解析使用`list_threads`，不得把
  `clientThreadId`传给`read_thread`、`wait_threads`或send。
- **FR-016**: `prepareStart` MUST 从Ledger最新Host capability observation解析能力，不接受调用方
  三布尔；receipt必须为exact `capability_id=codex_app`、provider contract ref、capability digest，且
  declared / observed / qualified与有效期全部通过。随后actor RoleBinding、当前grant/revision、current
  execution envelope、work-item、connected project与workspace Resolver结果还必须exact绑定；调用方
  字符串、历史Receipt或prepared事件不得产生或扩大授权。
- **FR-017**: prepared action一旦已有completion receipt，`recoverPrepared` MUST 拒绝再次生成Host
  call；active Turn的send拒绝不得由调用方通过`expectedIdle=false`放宽。
- **FR-018**: capability observation的`provider_binding_ref`与issuer MUST exact指向Ledger当前active
  Host ProviderBinding；该ProviderBinding必须由当前项目负责人RoleBinding签发，并绑定同一provider
  contract与capability digest。任意actor追加的同形receipt不得授权。
- **FR-019**: 任何无completion的非幂等prepared均不得恢复为原Host call。start只能恢复为基于唯一
  correlation title的`list_threads` readback；send在没有可验证effect marker时必须
  `DATA_INSUFFICIENT`并人工收口。只读wait/readback/release才可安全重放。

## Key Entities

- **NativeHostRuntimeProvider**: 宿主能力探测与 packet 出口。
- **SessionBinding / SessionBindingRef**: 不透明绑定；不是授权正文。
- **HostCapabilityReport**: declared / observed / qualified。
- **ActionPacket / TypedResultRef**: 下发与结果引用。

## Success Criteria *(mandatory)*

- **SC-001**: 维护者能在 10 分钟内从本 kit 指出最小接口、映射表与失败关闭。
- **SC-002**: 100% 缺失宿主工具或未 qualified 的 start 样例失败关闭。
- **SC-003**: 100% 双 Session / 旧 generation 样例被拒绝。
- **SC-004**: 重启恢复、pending thread、双 start / ABA、旧 generation、active-turn send、Host失败、
  未投递不宣称 awake 与 release readback 的测试全部通过；版本保持 `0.1.0`。

## Assumptions

- Codex 宿主原生工具由 Consumer 所在进程提供，不由 Hufu 安装。
- CI 与本地测试不连真实 Codex 账户；真实 pilot 由运行中的 Codex Host另行执行。

## Out of Scope

- Hufu CLI / daemon 直接调用 Codex App 专属工具
- 测试创建真实 Codex thread
- 把 Claude Chat 写成可写构建运行时
- 复活 M10–M15 或完整 Web 控制面
