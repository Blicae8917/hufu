# Feature Specification: GitLab→Hufu→LoopX→Host 端到端试点验收（大纲）

**Feature Branch**: `015-e2e-pilot`

**Created**: 2026-08-23

**Status**: Outline + public-safe fixture tests（#60 / ADR 0007）。公开夹具测试已对照 #57–#59 API 落地；真实生产 `execute` 仍未授予。

**Input**: User description: "公开安全夹具：一个父 + 四个子。覆盖并行、串行、用户决策停线、换届、重复回调、过期 revision、中断、重复 start、Turn 中额外消息、有序 Effect 链。"

**Parent Issue**: [#60](https://github.com/Blicae8917/hufu/issues/60)

**Depends on**: [#57](https://github.com/Blicae8917/hufu/issues/57)、[#58](https://github.com/Blicae8917/hufu/issues/58)、[#59](https://github.com/Blicae8917/hufu/issues/59)

**Parent Contract**: [ADR 0007](../../docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md)、`013` / `012` / `014`

## 设计声明

本规格是验收大纲，不是第二套 Milestone / Goal / Todo / PM Engine / Wave Engine。真实环境试点 **不在本波**，且 **未授权** 对生产执行写。公开产物只用示例主机。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 公开夹具形状 (Priority: P1)

维护者能描述一个父议题 + 四个子议题的公开安全夹具，覆盖：两个并行子项、一条串行依赖、一条用户决策停线、PM/Leader 换届。

**Acceptance Scenarios**:

1. **Given** 夹具描述，**When** 寻找真实项目名或地址，**Then** 只看到示例 `https://gitlab.example.com`、`http://192.0.2.10:41101`、`http://gitlab.example.com:41101`。
2. **Given** 有人把本票读成 Goal/Todo 引擎，**When** 对照 Out of Scope，**Then** 不合格。

---

### User Story 2 - 故障与幂等场景 (Priority: P1)

大纲列出必须覆盖：重复回调、过期 revision、prepared Effect 后进程中断、同一 Session 重复 start、活跃 Turn 额外消息、有序 Effect 链 comment→label→assignee→close。

**Acceptance Scenarios**:

1. **Given** 上述场景清单，**When** 未来夹具测试落地，**Then** 每条都有独立断言，且缺失事实不得写成 `0`。

---

### User Story 3 - 真实环境预检仍未授权写 (Priority: P1)

将来真实环境试点必须证明 GitLab 是唯一议题权威、Hufu 只存 Decision/Envelope/Binding/Effect/Receipt/Readback、LoopX Goal/Todo 不复制进议题、新 Session 只读稳定 refs/digests、每次外部写有 write-before/readback-after。本波与本票都不授权生产 `execute`。

**Acceptance Scenarios**:

1. **Given** 本波交付物，**When** 寻找真实 GitLab 写调用，**Then** 不存在。
2. **Given** 有人把 CI 绿写成生产已自动化，**When** 对照本规格，**Then** 不合格。

## Requirements *(mandatory)*

- **FR-001**: 公开夹具 MUST 为一个父 + 四个子，MUST NOT 含真实项目名或地址。
- **FR-002**: MUST 覆盖并行、串行、用户决策停线、换届、重复回调、过期 revision、中断、重复 start、Turn 中额外消息、有序 Effect 链。
- **FR-003**: MUST NOT 把 LoopX Goal/Todo 复制进 GitLab 议题。GitLab MUST 保持唯一议题权威。
- **FR-004**: Hufu MUST 只存 Decision / Envelope / Binding / Effect / Receipt / Readback。
- **FR-005**: 缺失事实 MUST 报告 `unavailable` / `data_insufficient`，MUST NOT 写成 `0`。
- **FR-006**: 本波 MUST 只写大纲。夹具测试 MAY 等到 #57–#59 有代码。
- **FR-007**: 真实生产 execute MUST 未授予。版本 MUST 保持 `0.1.0`。MUST NOT npm-publish。MUST NOT vendoring LoopX。
- **FR-008**: MUST NOT 创建第二套 Milestone / Goal / Todo / PM / Wave Engine，MUST NOT 复活 M10–M15 或企业 Renderer。
- **FR-009**: 结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。
- **FR-010**: HTTP 写 MUST 另有 exception ref。

## Key Entities

- **PublicSafePilotFixture**: 一个父 + 四个子的示例夹具。
- **PilotAcceptanceTicket**: #60。
- **DeferredRealEnvPilot**: 未授权生产写的后续预检。

## Success Criteria *(mandatory)*

- **SC-001**: 维护者能在 10 分钟内从大纲指出夹具形状与禁止项。
- **SC-002**: 本波不出现真实主机 / token / 生产 execute。
- **SC-003**: 012 / 013 / 014 / 015 均不引入 Goal/Todo 引擎。

## Assumptions

- 夹具实现依赖三张实现票的代码。
- 公开示例主机与 011 / 013 相同。

## Out of Scope

- 本波运行夹具或连接真实 GitLab
- 关闭真实议题
- 第二套控制面或企业 Renderer
