# Tasks: 零拷贝决策流

**Input**: Design documents from `/specs/005-zero-copy-decision/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-025 要求先写失败测试，再写生产代码。下列测试任务不可省略。门禁不得打真实网络、不得执行外部效果。

**Organization**: 按用户故事分组。事件类型、错误码、摘要与载荷校验是全部故事的前置。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 记下裁决 / US2 信封 / US3 路线确认 / US4 三类增量 / US5 语义重基护栏

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/005-zero-copy-decision/contracts/`

---

## Phase 1: Setup

- [ ] T001 [P] 新增 `tests/fixtures/decision/packet.valid.json` 与 `packet.forbidden-body.json`（后者含议题正文或过长复制字段，供负面断言）；不含凭据与本机绝对路径
- [ ] T002 [P] 确认 `package.json` 的 `test` 仍为 `tsc && node --test dist/tests/**/*.test.js`，version 保持 `0.1.0`

---

## Phase 2: Foundational

### Tests for Foundation

- [ ] T003 [P] 在 `tests/decision-digest.test.ts` 写失败测试：同一语义对象不同键序得到相同 `content_digest`；三项成分摘要稳定；`content_digest` 字段不计入输入
- [ ] T004 [P] 在 `tests/decision-schema.test.ts` 写失败测试：缺 `recheck_when` 拒绝；未知 `required_because` 拒绝；信封根对象含 `business_outcome` 拒绝；无 complete 读回却 `applied` 拒绝；`observed_result=0` 拒绝

### Implementation for Foundation

- [ ] T005 在 `src/hufu/errors.ts` 增加 `DECISION_CONFLICT`、`ENVELOPE_INVALID`、`ACK_INVALID`、`ROLE_NOT_ACTIVE` 及退出码映射
- [ ] T006 实现 `src/hufu/decision-digest.ts`：Packet 内容摘要与三项成分摘要，使 T003 转绿
- [ ] T007 实现 `src/hufu/decision-schema.ts`：校验 Packet/Envelope/ACK/Delta 载荷，使 T004 转绿
- [ ] T008 扩展 `src/hufu/envelope.ts` 的 `EVENT_TYPES`：六种 `hufu/decision.*` 类型；未知类型仍 fail closed

**Checkpoint**: 摘要与载荷单测绿；尚无 `hufu decide` 成功写入

---

## Phase 3: User Story 1 - 记下裁决且只完整保存一次 (Priority: P1) 🎯 MVP

**Goal**: `hufu decide --packet` 只完整保存 v1 一次；`status`/`handoff` 只暴露引用

**Independent Test**: 连接并打开工作项后提交合法 Packet，账本仅一条 `packet_recorded`；再提相同摘要幂等；改正文同 id 退出码 3；status JSON 不含 `business_outcome`

### Tests

- [ ] T009 [P] [US1] 在 `tests/decide-packet.test.ts` 写失败测试：合法 packet 退出码 0 且返回 `version=1` 与 `content_digest`；同摘要重提不新增事件；不同摘要同 id 退出码 3；非指挥官 `--actor` 退出码 2 `ROLE_NOT_ACTIVE`；未知工作项退出码 4
- [ ] T010 [P] [US1] 在 `tests/decide-status-handoff.test.ts` 写失败测试：有裁决时 `status` 的 `decision` 槽仅 id/version/digest；stdout 不含 `business_outcome`/`acceptance_metric`/`simplest_safe_route`；`handoff` 的 `decision_ref` 非空且 `next_action_text` 含 `decision_id`

### Implementation

- [ ] T011 [US1] 实现 `src/hufu/decide.ts` 的 `--packet` 路径：分配 `decision_id`、校验授权与活跃流基数、追加 `hufu/decision.packet_recorded`
- [ ] T012 [US1] 更新 `src/hufu/cli.ts`：解析 `decide --actor` 与互斥文件标志
- [ ] T013 [US1] 更新 `src/hufu/projector.ts`：折叠 `decision` 槽；无裁决时 `data_insufficient`
- [ ] T014 [US1] 更新 `src/hufu/handoff.ts`：成功结果带 `decision_ref`；下一步含引用、不含正文

**Checkpoint**: T009/T010 转绿；`decide` 不联网

---

## Phase 4: User Story 2 - 附加执行信封 (Priority: P1)

**Goal**: 项目负责人附加信封；夹带正文拒绝；可建立 owner 绑定

**Independent Test**: 合法信封后 CurrentView 有 `execution_envelope` 且 decision digest 不变；含 `business_outcome` 的信封退出码 2

### Tests

- [ ] T015 [P] [US2] 在 `tests/decide-envelope.test.ts` 写失败测试：`project_lead` 附加单工作项信封退出码 0 并产生 owner 绑定；夹带 `business_outcome` 退出码 2 `ENVELOPE_INVALID`；摘要不匹配退出码 3；非负责人退出码 2；两工作项时建立 `mission_lead` 且拒绝工作项已属其他活跃流

### Implementation

- [ ] T016 [US2] 扩展 `src/hufu/decide.ts`：`--envelope` 校验禁字段、角色、范围收窄；必要时同批追加 `hufu/role_binding.established`
- [ ] T017 [US2] 更新 `src/hufu/projector.ts`：`execution_envelope` 槽与 `ack_required` 护栏

**Checkpoint**: T015 转绿

---

## Phase 5: User Story 3 - 开工前路线确认 (Priority: P1)

**Goal**: 空缺口确认后去掉 `ack_required`；非空合法缺口成功但 `scope_change_required`；不扩权

**Independent Test**: 空 ACK 后护栏为空缺口类；非空 ACK 后授权 revision 不变且出现 `scope_change_required`

### Tests

- [ ] T018 [P] [US3] 在 `tests/decide-ack.test.ts` 写失败测试：执行者空 `added_scope` 退出码 0 且不再 `ack_required`；四类合法非空原因退出码 0、`guardrails` 含 `scope_change_required`、grant revision 不变；非法原因退出码 2 `ACK_INVALID`；三项摘要被改退出码 2；同信封不同摘要重提退出码 3；stdout 无 `approved`/`rejected`

### Implementation

- [ ] T019 [US3] 扩展 `src/hufu/decide.ts`：`--ack` 校验成分摘要与执行者
- [ ] T020 [US3] 更新 `src/hufu/projector.ts`：`route_ack` 槽与 ACK 适用性（版本/信封/绑定/授权修订变化后 `applicable=false`）
- [ ] T021 [US3] 更新 `src/hufu/handoff.ts`：存在 `scope_change_required` 时 `next_action_text` 只陈述护栏、不含新前向步骤

**Checkpoint**: T018 转绿

---

## Phase 6: User Story 4 - 三类增量与单一后继 (Priority: P1)

**Goal**: FACT 不升版本；合法 revise 得到 v2；双后继拒绝；缺读回不得 applied/0

**Independent Test**: fact 后 version 仍为 1；revise 后为 2 且旧信封 `stale_envelope`；第二份不同后继退出码 3

### Tests

- [ ] T022 [P] [US4] 在 `tests/decide-delta.test.ts` 写失败测试：`--fact` 不改变 `version`；`--revise` 连续 +1 且新 digest 变化；同一 `expected_version` 第二份不同载荷退出码 3；跳跃版本退出码 3；`--effect` 在 `readback_status=unavailable` 时拒绝 `applied`/`confirmed_absent`/`0`；complete+applied+durable 后 `first_durable_effect.status=applied`

### Implementation

- [ ] T023 [US4] 扩展 `src/hufu/decide.ts`：`--fact` / `--revise` / `--effect` 追加与单一后继检查
- [ ] T024 [US4] 在 `src/hufu/decide.ts` 或新纯函数中物化当前语义对象（v1+有序 Delta），供摘要与投影使用
- [ ] T025 [US4] 更新 `src/hufu/projector.ts`：当前版本、`stale_envelope`、`first_durable_effect`

**Checkpoint**: T022 转绿

---

## Phase 7: User Story 5 - 语义重基护栏 (Priority: P2)

**Goal**: 在 status/handoff/decide 边界硬触发一次 `semantic_rebase_required`；缺读回不硬触发零效果；不写回议题、不回滚

**Independent Test**: 夹具满足 FR-018 条件 (1) 与 (2) 时 status 出现该护栏；同一指纹第二次不追加新确认 Delta

### Tests

- [ ] T026 [P] [US5] 在 `tests/decide-guardrail.test.ts` 写失败测试：`recheck_when.wall_clock` 已过 + complete 读回 `confirmed_absent` + `implementation_activity=true` 的 effect → `semantic_rebase_required`；确定性 `non_goals` 命中同样触发；仅缺读回不得 `confirmed_absent` 也不得硬触发；同一指纹二次 `--fact` 确认幂等；`status`/`handoff`/`decide` 调用栈不出现 `setInterval`/`setTimeout`；GitHub 路径无 Port 写调用

### Implementation

- [ ] T027 [US5] 实现 `src/hufu/guardrails.ts` 纯函数：硬触发、指纹、`suspected_drift` 不得进入 `execution_guardrails`
- [ ] T028 [US5] 从 `projector.ts`、`handoff.ts`、`decide.ts` 调用护栏；handoff 在该护栏下不生成旧信封前向步骤；`--fact` 可写入 `rebase_fingerprint`
- [ ] T029 [US5] 扩展 `tests/github-handoff.test.ts` 或 `decide-packet.test.ts`：github 正本 `decide --packet` 不调用 GitHubPort；不在缓存的 ref 退出码 4

**Checkpoint**: T026 转绿；无后台、无写回

---

## Phase 8: Polish

- [ ] T030 [P] 按 `quickstart.md` 更新 `README.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `CHANGELOG.md`：零拷贝决策流已由本模块交付；会商/GitLab/Cordis 仍未实现
- [ ] T031 [P] 扩展既有 `tests/github-status.test.ts` / `tests/status.test.ts`：无裁决时新槽为 `data_insufficient`，旧槽语义不变；`view_schema_version` 仍为 `1`
- [ ] T032 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录（通过只证明本地验证；未合并、未部署、未验收）

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 Setup → Phase 2 Foundation（阻塞全部故事）
- US1 依赖 Foundation
- US2 依赖 US1（信封引用已有裁决）
- US3 依赖 US2（确认引用信封）
- US4 依赖 US1（增量引用裁决；revise 可在无 ACK 时测试，但 stale_envelope 需 US2）
- US5 依赖 US4（硬触发需要 effect/fact 观测）
- Polish 依赖所欲交付的故事

### User Story Dependencies

- **US1**：Foundation 之后即可，本模块 MVP
- **US2**：需要 US1 的 `decision_id`
- **US3**：需要 US2 的信封
- **US4**：需要 US1；与 US3 文件冲突少，但 `decide.ts` 同一文件须串行
- **US5**：需要 US4 的效果观测

### Parallel Opportunities

- T001/T002；T003/T004；T009/T010；T030/T031 可并行
- `decide.ts` / `projector.ts` / `cli.ts` 同一文件的任务必须串行

### Parallel Example: Foundation tests

```bash
# 可同时起草：
# tests/decision-digest.test.ts
# tests/decision-schema.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1–2
2. Phase 3 US1：能记下裁决，status/handoff 只传引用
3. 停下来用 `decide-packet` 与 `decide-status-handoff` 测试验证

### Incremental Delivery

Issue #6 必须交付 US1–US5 才算模块完成。顺序：US1 → US2 → US3 → US4 → US5 → Polish。不要在未合入的实现上并行改同一批核心文件。

### Notes

- 先失败测试再写生产代码
- 不要把 Python 命令当门禁
- 不要提交 Secret 或本机路径
- `tasks/` 历史指针不要当工作队列
