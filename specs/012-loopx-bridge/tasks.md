# Tasks: Hufu↔LoopX Authority / Decision / Evidence 桥

**Input**: Design documents from `/specs/012-loopx-bridge/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**本波已交付**: 扩展后的设计 kit 与通过的 `tests/012-loopx-bridge-spec.test.ts`。下列任务属于 **#58 未来实现 PR**。本波不得执行。

**Tests**: 未来实现 PR 必须先写会失败的 Adapter / 生命周期 / 依赖测试，再写生产代码。那些失败测试 **不得** 在本设计 PR 落地。门禁不得打真实网络，不得要求 LoopX 发行包。

**Organization**: 按用户故事分组。第一条任务就是失败测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 三端字段 / US2 生命周期与反向授权 / US3 非升格与依赖锁

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/012-loopx-bridge/contracts/`

---

## Phase 1: Future implementation — 先写失败测试

**Purpose**: 独立实现 PR 的第一条工作。本设计 PR 不得勾选或执行。

- [x] T001 [P] 在 `tests/012-loopx-bridge-adapter.test.ts` 写失败测试：尚不存在的 Bridge Adapter 拒绝把 Journal、Receipt、TypedResult 或 `observed_result` 当作 `AuthorizationGrant`；夹带 `scope_text` / `goal_id` / `business_outcome` 的载荷不得写入账本
- [x] T002 [P] 在 `tests/012-loopx-bridge-lifecycle.test.ts` 写失败测试：`task_authority` 为 `github` 或 `gitlab` 时桥不得调用议题写方法；LoopX Goal 完成不得关闭原生 Issue
- [x] T003 [P] 在 `tests/012-loopx-bridge-deps.test.ts` 写失败测试：实现后根目录与 `packages/*/package.json` 仍不得列出 `loopx`；`src/` 不得 `from "loopx"`；不得出现 vendored 上游源码树
- [x] T004 [P] 扩展 `tests/012-loopx-bridge-adapter.test.ts`：把 `loopx-mechanisms` 或 `engine_id` 写成 `task_authority` 必须得到 `BRIDGE_008_PROMOTION_REJECTED`；选用 008 不得隐式启用桥

---

## Phase 2: Foundational（仍属未来实现 PR）

**Purpose**: 白名单校验与错误码。阻塞全部用户故事。须先有 T001–T004。

- [x] T005 实现 `src/hufu/loopx-bridge-schema.ts`：编码 AuthorityCrossing / DecisionCrossing / EvidenceCrossing 白名单与 StayOnSideSet 禁止键，使 T001 载荷拒绝转绿
- [x] T006 实现 `src/hufu/loopx-bridge.ts`：`assertAuthorityCrossing` / `assertDecisionCrossing` / `assertEvidenceCrossing`，无网络、无外部命令、无议题写方法
- [x] T007 更新 `src/hufu/errors.ts`：加入 `BRIDGE_NOT_AUTHORIZED`、`BRIDGE_AUTHORITY_REJECTED`、`BRIDGE_LIFECYCLE_REJECTED`、`BRIDGE_CONTROL_PLANE_REJECTED`、`BRIDGE_008_PROMOTION_REJECTED` 及退出码映射

**Checkpoint**: 禁止键单测可写；仍无产品命令

---

## Phase 3: User Story 1 - 三端字段白名单 (Priority: P1)

**Goal**: 只接受合同列出的 Authority / Decision / Evidence 指针

**Independent Test**: 合法三端指针通过校验；grant 正文、Packet 正文、Receipt 被拒绝

- [x] T008 [P] [US1] 在 `tests/012-loopx-bridge-adapter.test.ts` 补失败夹具：合法 `AuthoritySnapshotRef` + `DecisionRef` + `evidence_ref` 被接受且不改 `grant_revision`；`scope_text`、`business_outcome`、Receipt `ok` 被拒绝
- [x] T009 [US1] 在 `src/hufu/loopx-bridge-schema.ts` 完成三端字段表，使 T008 转绿
- [x] T010 [US1] 确认不新增 CLI 标志也能被领域函数校验；若未来需要 Consumer，只能复用既有命令边界，不得新增 `hufu bridge`

---

## Phase 4: User Story 2 - 原生生命周期与反向授权 (Priority: P1)

**Goal**: LoopX 不得取代 GitHub / GitLab 原生 Issue 生命周期，也不得从 Journal、Receipt 或执行结果反推或扩大授权

**Independent Test**: 议题写路径不存在；Journal / Receipt / 执行结果不能改 grant

- [x] T011 [P] [US2] 扩展 `tests/012-loopx-bridge-lifecycle.test.ts`：GitHub / GitLab 正本下桥端口类型不含 `writeIssue` / `closeIssue` / `commentIssue` / `merge`
- [x] T012 [P] [US2] 扩展 `tests/012-loopx-bridge-adapter.test.ts`：Journal、Receipt、TypedResult、`observed_result` 推导 `authority_scope_ref` 一律 `BRIDGE_AUTHORITY_REJECTED`；缺失观测不得写成 `0`
- [x] T013 [US2] 更新 `src/hufu/loopx-bridge.ts`：生命周期与反向授权拒绝清单，使 T011–T012 转绿

---

## Phase 5: User Story 3 - 不升格 008、不搬控制面 (Priority: P1)

**Goal**: 008 保持机制记录口；无 `loopx` 依赖；不复活 M10–M15 / `hufu serve`

**Independent Test**: `connect --task-authority loopx` 仍失败；`hufu serve` 仍拒绝；package.json 无 `loopx`

- [x] T014 [P] [US3] 扩展 `tests/engine-bind.test.ts` 或 T004：008 选用后 `task_authority` 不变，且不出现桥启用记录
- [x] T015 [P] [US3] 扩展 `tests/012-loopx-bridge-deps.test.ts` 与既有 `tests/engine-deps.test.ts`：无 `loopx` 依赖、无上游源码树、NOTICE 不因本桥改为「已采用源码」
- [x] T016 [US3] 确认 `src/hufu/loopx-bridge.ts` 端口不含 `schedule` / `heartbeat` / `quota` / `startAgent` / `createGoal`；`hufu serve` 合同保持拒绝

---

## Phase 6: Polish（未来实现 PR）

- [x] T017 [P] 仅在独立实现授权下达后更新 `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `CHANGELOG.md`：写明桥 Adapter 已交付且 008 仍不是正本；不得把合入写成新的 `MAJOR.MINOR`
- [x] T018 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录（通过只证明本地验证）

## Dependencies

- T001–T004 阻塞 Phase 2–5
- US1 白名单后 US2 / US3 才能断言拒绝清单落在同一端口
- US2 与 US3 测试文件可并行编写
- 本设计 PR 不依赖、不执行上述任何任务

## Parallel examples

- T001–T004 可并行
- T008 与 T011–T012、T014–T015 可并行编写失败测试
- T017 与实现代码解耦，仅在授权后执行

## Implementation Strategy

1. 等待独立实现授权（本 kit 与 #50 都不是开工令）
2. 先红 T001–T004
3. 再绿白名单与错误码
4. 再绿生命周期 / 反向授权
5. 再绿 008 非升格与依赖锁
6. 文档与门禁

## Notes

- 不要在本设计 PR 勾选 T001 及之后的任务
- 不要引入 `loopx` 依赖或复制上游源码
- 不要实现 Scheduler、Heartbeat、Quota、自动开工、出站 Session
- 不要把 Goal/Todo/Registry 映射为工作项
- 不要复活 M10–M15 或默认 `hufu serve`
- 不要把缺失观测写成 `0`
- 不要关闭 #50 或改写 #5
- 不要把 #9 `loopx-mechanisms` 升格为任务正本

---

## Phase 7: #68 LoopX v0.5.2 RunOnce Consumer 实现增量

- [x] T019 在 `tests/loopx-run-once.test.ts` 先写红灯：无显式 qualified activation receipt 时桥保持关闭。
- [x] T020 实现 `BridgeActivationReceipt` 严格校验并钉住 v0.5.2 commit。
- [x] T021 先写红灯并修改 `prepareOutboundTurn`：绑定真实 `ExecutionEnvelopeRef` + `SessionBindingRef`，稳定 turn key，默认只 Plan。
- [x] T022 先写红灯并新增窄 `loopx-run-once.ts`：无 RunOncePort 时执行失败关闭。
- [x] T023 用 public-safe fake port 覆盖一次成功 run-once；独立 Validator、Effect readback、Receipt 全部完成后才允许 next。
- [x] T024 覆盖失败与超时：执行不确定后只 readback，不盲重试，不重复调用 Port。
- [x] T025 覆盖伪造 TypedResult 与伪造 / stale Plan，在调用 Port 前失败关闭。
- [x] T026 删除 CurrentView 将 project_lead RoleBinding 伪造成 `generation=1` SessionBinding 的路径。
- [x] T027 覆盖重复 Turn、重启恢复和 post-execution readback 仍 prepared 的停止线。
- [x] T028 更新 `contracts/run-once.v1.md`、本 kit 与定向测试；保持无 LoopX 依赖、无 vendor、无 Scheduler / while-loop。
