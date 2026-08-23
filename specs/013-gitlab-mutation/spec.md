# Feature Specification: GitLabTaskMutationProvider（受控写回）

**Feature Branch**: `013-gitlab-mutation`

**Created**: 2026-08-23

**Status**: Design + implementation-authorized（#57 / ADR 0007）。本波不交付 Adapter。

**Input**: User description: "实现独立 GitLabTaskMutationProvider：preview / execute / readback；第一版只允许五种 mutation_kind；只读 GitLabPort 不加写方法；真实生产 execute 未授予。"

**Parent Issue**: [#57](https://github.com/Blicae8917/hufu/issues/57)

**Parent Contract**: [007-gitlab-readonly](../007-gitlab-readonly/spec.md)、[011-gitlab-authority](../011-gitlab-authority/spec.md)、[ADR 0007](../../docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md)、Constitution 系统边界修订

## 设计声明

本规格是 #57 的实现合同。本波只落地 kit 与约束测试，**不**修改 `src/` 写回运行时、**不**发 HTTP POST/PUT。后续实现 PR 必须先写会失败的适配器测试。真实生产 `execute` 仍未授予；真实项目第一次写停在 preview / 只读预检。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 独立写端口与五种 kind (Priority: P1)

维护者能指出：只读 `GitLabPort` 仍无写方法；写回只经 `GitLabTaskMutationProvider` 的 `preview` / `execute` / `readback`；第一版只允许 `append_comment`、`transition_managed_status_label`、`set_assignee`、`close_issue`、`reopen_issue`。

**Why this priority**: 把写方法加到只读端口会破坏 #8 / #53。

**Independent Test**: 能力表列出五种 kind 与禁止项；只读端口合同不被改写。

**Acceptance Scenarios**:

1. **Given** 已交付只读端口，**When** 对照本规格，**Then** 写方法不出现在只读端口，只出现在独立 mutation 端口。
2. **Given** 一个不属于五类的意图，**When** `preview`，**Then** 失败关闭。
3. **Given** 通用 GitLab 透传、编辑正文、删除、整表换标签、MR / 分支 / 发布，**When** 作为本端口能力，**Then** 不合格。

---

### User Story 2 - 绑定、readback 与幂等 (Priority: P1)

每个动作绑定列名引用。完成只能在 projection 显示真实目标态之后宣称。同一 `effect_id` + digest 返回已有结果；不同 digest 冲突停止。超时后必须先 readback。

**Acceptance Scenarios**:

1. **Given** 缺少 `effect_id` 或 `expected_source_revision` 的意图，**When** preview / execute，**Then** 失败关闭。
2. **Given** `close_issue` 且验收 Evidence 不完整或 readback 为 `unavailable` / `data_insufficient`，**When** 试图关闭，**Then** 不得关闭。
3. **Given** 标签 / 指派 / 关闭已在目标态，**When** execute，**Then** 合法 no-op。
4. **Given** 超时后重试，**When** 未先 readback，**Then** 不合格。

---

### User Story 3 - HTTP 例外与公开安全 (Priority: P1)

只读 allowlist 不授权明文 HTTP 写。自建 HTTP 写须操作者本机 `transport_security_exception_ref`。公开仓只用示例主机。

**Acceptance Scenarios**:

1. **Given** 只读 allowlist 含 `http://192.0.2.10:41101`（示例）且无 exception ref，**When** 评估 HTTP 写，**Then** 失败关闭。
2. **Given** 公开 kit 与约束测试，**When** 搜索真实 IP / token / 项目名 / 例外正文，**Then** 只允许标明示例的占位。

## Edge Cases

- 多动作必须拆成有序单个 Effect，禁止伪造跨 API 事务或自动回滚。
- 评论重试前必须检查隐藏 effect marker。
- GET 当前议题必须核对恰好 `instance_origin` + `project_path` + `iid` + `updated_at`/revision。
- 版本保持 `0.1.0`。不 npm-publish。

## Requirements *(mandatory)*

- **FR-001**: 只读 `GitLabPort` MUST NOT 增加写方法。写回 MUST 使用独立 `GitLabTaskMutationProvider`。
- **FR-002**: 第一版 MUST 只允许五种 `mutation_kind`：`append_comment`、`transition_managed_status_label`、`set_assignee`、`close_issue`、`reopen_issue`。
- **FR-003**: 端口 MUST 提供 `preview` / `execute` / `readback`。
- **FR-004**: 每个动作 MUST 绑定 `effect_id`、`task_ref`、`decision_ref`、`execution_envelope_ref`、`authority_scope_ref`、`expected_source_revision`、`mutation_kind`、`canonical_payload_digest`、`actor_binding`、`idempotency_key`。
- **FR-005**: MUST NOT 删除评论、编辑正文、删除议题、整表换标签、跨议题批量改、MR / 分支 / 发布或通用 API 透传。
- **FR-006**: 只读 allowlist MUST NOT 授权 HTTP 写。HTTP 写 MUST 另有本机 `transport_security_exception_ref`。
- **FR-007**: 真实生产 `execute` MUST 视为未授予。真实项目第一次写 MUST 停在 preview / 只读预检。
- **FR-008**: `close_issue` MUST 具备完整验收 Evidence；readback 为 `unavailable` / `data_insufficient` 时 MUST NOT 关闭。
- **FR-009**: 本波 MUST NOT 实现 Adapter。后续实现 PR MUST 先失败测试。版本 MUST 保持 `0.1.0`。MUST NOT npm-publish。
- **FR-010**: MUST NOT 实现 Goal/Todo/Scheduler/Heartbeat、PM/Wave Engine、`hufu serve`、会商或企业 Renderer。
- **FR-011**: 公开产物 MUST 只用示例 `https://gitlab.example.com`、`http://192.0.2.10:41101`、`http://gitlab.example.com:41101`。MUST NOT 写入真实 GitLab IP、token、项目名或例外正文。
- **FR-012**: 后续实现结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。

## Key Entities

- **GitLabTaskMutationProvider**: 独立写端口。
- **TaskMutationIntent / MutationPlan / MutationReceipt / MutationReadback**: preview / execute / readback 对象。
- **ManagedMutationKind**: 五种允许 kind。
- **TransportSecurityExceptionRef**: 仅本机持有的 HTTP 写例外引用。

## Success Criteria *(mandatory)*

- **SC-001**: 未读 `src/` 的维护者能在 10 分钟内指出五种 kind、独立端口与禁止项。
- **SC-002**: 100% 缺少绑定字段或禁止 kind 的样例被拒绝。
- **SC-003**: 100% 无 exception ref 的 HTTP 写样例被拒绝。
- **SC-004**: 本波门禁测试通过且不含会失败的 Adapter 测试；版本仍为 `0.1.0`。

## Assumptions

- #53 只读认证路径继续有效，不因本票获得写权。
- 公开示例主机一律标明示例。
- 本波不连真实 GitLab。

## Out of Scope

- 本波实现 HTTP POST/PUT 或关闭真实议题
- 把写方法加到只读端口
- 提升版本、npm-publish、企业 Renderer、M10–M15
