# Feature Specification: GitLabTaskMutationProvider（受控写回）

**Feature Branch**: `013-gitlab-mutation`

**Created**: 2026-08-23

**Status**: Implemented（#57）+ production binding hardening candidate（#66，待评审）。真实项目首次写仍停在 preview。

**Input**: User description: "闭合 production execute grant、Ledger exact refs、精确写 allowlist、六状态互斥标签、EvidenceRef 关闭闸门与 revision-safe 恢复；不得因注入 fetch 获得写权。"

**Parent Issue**: [#57](https://github.com/Blicae8917/hufu/issues/57)

**Hardening Issue**: [#66](https://github.com/Blicae8917/hufu/issues/66)

**Parent Contract**: [007-gitlab-readonly](../007-gitlab-readonly/spec.md)、[011-gitlab-authority](../011-gitlab-authority/spec.md)、[ADR 0007](../../docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md)、Constitution 系统边界修订

## 设计声明

本规格是 #57 的实现合同，也是 #66 的收口合同。#66 只把库级端口从公开夹具提升为“具备显式 production grant 后才可执行”的失败关闭实现；测试仍只使用注入式 fake transport，不连接真实 GitLab。真实项目第一次写仍停在 preview / 只读预检。

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
2. **Given** `close_issue`，**When** 调用方只给 boolean、EvidenceRef 不存在于当前 decision 或验收矩阵引用不在 EvidenceRef 集合，**Then** 不得关闭；readback 为 `unavailable` / `data_insufficient` 时同样不得关闭。
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
- 任意注入 `fetch` 只提供 transport，不产生授权；`execute` 还必须持有 owner-local `ProductionExecuteGrantRef`，且它命中当前 Ledger grant id + revision。该 Ledger grant 的结构化 `scope` 必须为 `action=mutate`、`resource=gitlab_issue`，并以 `mutation_allowances` 覆盖 exact target / kind / payload；不得从 `scope_text` 猜写权。
- `readAllowlist` 与写 allowlist 都参与 preview / execute；写 allowlist 的单元是 exact origin + project + iid + kind，并在标签/指派时继续精确到 label 或 assignee + id。
- 标签转换的 owner-local 集合必须恰好六个唯一标签；写入同时 add 目标标签并 remove 当前其他受管标签。
- prepared 恢复先按原 grant / label scope 只读核验 effect marker 或目标态；已实现则只读收尾，不要求 successor grant。目标尚未实现时才核验 current grant / envelope / source revision，任一变化即停车。
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
- **FR-009**: #57 / #66 MUST 只实现库级 Provider 与 fake transport 测试，不得连接真实项目。实现 PR MUST 先失败测试。版本 MUST 保持 `0.1.0`。MUST NOT npm-publish。
- **FR-010**: MUST NOT 实现 Goal/Todo/Scheduler/Heartbeat、PM/Wave Engine、`hufu serve`、会商或企业 Renderer。
- **FR-011**: 公开产物 MUST 只用示例 `https://gitlab.example.com`、`http://192.0.2.10:41101`、`http://gitlab.example.com:41101`。MUST NOT 写入真实 GitLab IP、token、项目名或例外正文。
- **FR-012**: 后续实现结束 MUST 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，MUST NOT 把「CI 绿」写成生产已自动化。
- **FR-013**: 新写入 MUST 要求显式 `ProductionExecuteGrantRef`，并核对当前 Ledger `AuthorizationGrant` 的 exact `grant_id + revision`。当前 grant MUST 具备机器可读 `scope.action=mutate`、`scope.resource=gitlab_issue` 与 `scope.mutation_allowances`，且 exact 覆盖 target / kind / payload / label / assignee；read-only scope、自由文本 `scope_text` 或注入 `fetch` MUST NOT 构成授权。
- **FR-014**: `authority_scope_ref`、`decision_ref`、`execution_envelope_ref`、`actor_binding`、`task_ref` MUST 共同命中当前 Ledger 的 grant / decision / 当前 envelope / executor / work item；`task_ref` MUST 与 exact mutation target 相同。
- **FR-015**: `readAllowlist` MUST 实际参与判断。production write allowlist MUST 使用 exact origin + project + iid + kind；标签和指派还 MUST 精确到受管 label、assignee 与 assignee id。origin-only 条目 MUST NOT 授权 execute。
- **FR-016**: `transition_managed_status_label` MUST 使用 owner-local 注入的恰好六标签集合，并通过 `add_labels + remove_labels` 保证互斥；current issue 或 projection 缺少完整 `labels` 时 MUST `data_insufficient`，不得把缺失当 `[]`。readback / projection MUST 同时证明目标存在且其他受管标签不存在。
- **FR-017**: `close_issue` MUST 绑定当前 decision version 中真实存在的 `acceptance_evidence_refs` 和 `acceptance_matrix_ref`；Effect 证据还 MUST 匹配 current `execution_envelope_ref` 与 decision version。旧 envelope / 旧 version EvidenceRef 和调用方 boolean MUST NOT 充当证据。
- **FR-018**: `mutation.prepared` MUST 审计 `production_execute_grant_ref` 与标签 scope。恢复 MUST 先只读核验原 effect；目标已实现时只允许 readback 收尾，即使 current grant / envelope 已换版也不得重复写。目标尚未实现时才要求 current production grant / envelope，并重新核验 exact source revision；任一变化 MUST 以冲突停车。

## Key Entities

- **GitLabTaskMutationProvider**: 独立写端口。
- **TaskMutationIntent / MutationPlan / MutationReceipt / MutationReadback**: preview / execute / readback 对象。
- **ManagedMutationKind**: 五种允许 kind。
- **TransportSecurityExceptionRef**: 仅本机持有的 HTTP 写例外引用。
- **ProductionExecuteGrantRef**: owner-local 显式执行授权引用；只含既有 Ledger grant id + revision。真实写权来自该 Ledger grant 的结构化 mutation scope 与 owner-local exact allowlist 的交集，不由 scope_text、fetch、Receipt 或 readback 推导。
- **MutationWriteAllowance**: 单个 exact target / kind / label 或 assignee 的本机允许项；旧式字符串 origin 只能被识别并失败关闭，不能形成合法 plan 或授权 execute。

## Success Criteria *(mandatory)*

- **SC-001**: 未读 `src/` 的维护者能在 10 分钟内指出五种 kind、独立端口与禁止项。
- **SC-002**: 100% 缺少绑定字段或禁止 kind 的样例被拒绝。
- **SC-003**: 100% 无 exception ref 的 HTTP 写样例被拒绝。
- **SC-004**: 所有 RED→GREEN 与既有回归门禁通过；版本仍为 `0.1.0`。
- **SC-005**: arbitrary fetch、错误 grant/ref/scope/label/assignee/evidence/revision 的夹具 100% 在零写入前失败关闭。
- **SC-006**: prepared 恢复对已实现目标先于 successor grant / envelope 做只读收尾，对 grant / envelope / revision 已变且目标未实现的计划 100% 停车。

## Assumptions

- #53 只读认证路径继续有效，不因本票获得写权。
- 公开示例主机一律标明示例。
- 本波不连真实 GitLab；当前项目 `write_back_enabled=false`、`production_execute_grant_ref=null` 时只允许 preview。

## Out of Scope

- 对真实网络执行 HTTP POST/PUT 或关闭真实议题
- 把写方法加到只读端口
- 提升版本、npm-publish、企业 Renderer、M10–M15
