# Feature Specification: Codex NativeHost RuntimeProvider + SessionBinding

**Feature Branch**: `014-codex-native-host`

**Created**: 2026-08-23

**Status**: Design + implementation-authorized（#59 / ADR 0007）。本波不交付 Runtime。

**Input**: User description: "Hufu 核心不创建 Session。Codex Consumer 调用宿主原生工具；Hufu 只发 action packet 并记录结果。最小接口 capabilities/start/resume/send/observe/wait/interrupt/release/readback。"

**Parent Issue**: [#59](https://github.com/Blicae8917/hufu/issues/59)

**Parent Contract**: [ADR 0007](../../docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md)、ADR 0002 / 0003、Constitution V

## 设计声明

本规格是 #59 的实现合同。本波只落地 kit 与约束测试，不调用 Codex thread，不新增网络入口。后续实现 PR 必须先失败测试。独立 CLI / daemon 在宿主原生工具缺失时失败关闭，禁止静默回退到 subagent 或 CLI thread。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 最小宿主接口 (Priority: P1)

维护者能核对照表：Hufu 只下发 packet；Codex Consumer 把 `start` 映射到 `create_thread`，`send`/`resume` 到 `send_message_to_thread`，`wait` 到有界 `wait_threads`，handoff 到 `handoff_thread`，`interrupt` 到宿主原生 interrupt，`observe` 到 thread status / readback。

**Acceptance Scenarios**:

1. **Given** 独立 CLI 且宿主原生工具缺失，**When** 调用 start / send，**Then** 失败关闭，不静默改走 subagent。
2. **Given** 活跃 Turn，**When** 再发额外消息，**Then** 只能排队或拒绝，不得强行 interrupt。
3. **Given** 无投递 / readback，**When** 声称已唤醒或已投递，**Then** 不合格。

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
- **FR-008**: 本波 MUST NOT 实现 Runtime。版本 MUST 保持 `0.1.0`。MUST NOT npm-publish。MUST NOT vendoring LoopX。
- **FR-009**: MUST NOT 实现 Goal/Todo/Scheduler/Heartbeat、PM/Wave Engine、`hufu serve` 或企业 Renderer。
- **FR-010**: 后续实现结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。
- **FR-011**: 真实生产写回 MUST 仍视为未授予；HTTP 写 MUST 另有 exception ref。

## Key Entities

- **NativeHostRuntimeProvider**: 宿主能力探测与 packet 出口。
- **SessionBinding / SessionBindingRef**: 不透明绑定；不是授权正文。
- **HostCapabilityReport**: declared / observed / qualified。
- **ActionPacket / TypedResultRef**: 下发与结果引用。

## Success Criteria *(mandatory)*

- **SC-001**: 维护者能在 10 分钟内从本 kit 指出最小接口、映射表与失败关闭。
- **SC-002**: 100% 缺失宿主工具或未 qualified 的 start 样例失败关闭。
- **SC-003**: 100% 双 Session / 旧 generation 样例被拒绝。
- **SC-004**: 本波门禁通过且无 Runtime 实现测试变红；版本 `0.1.0`。

## Assumptions

- Codex 宿主原生工具由 Consumer 所在进程提供，不由 Hufu 安装。
- 本波不连真实 Codex 账户。

## Out of Scope

- 本波实现 thread 调用
- 把 Claude Chat 写成可写构建运行时
- 复活 M10–M15 或完整 Web 控制面
