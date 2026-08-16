# Tasks: LoopX 第一批机制接入

**Input**: Design documents from `/specs/008-loopx-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-017 要求先写失败测试，再写生产代码。下列测试任务不可省略。门禁不得打真实网络，不得要求 LoopX 发行包。

**Organization**: 按用户故事分组。引擎载荷校验与事件类型是全部故事的前置。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 显式选用 / US2 类型化结果 / US3 回执与读回 / US4 无进展与控制面边界

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/008-loopx-engine/contracts/`

---

## Phase 1: Setup

- [ ] T001 [P] 新增 `tests/fixtures/engine/`：合法 `engine.json`、`result-progress.json`、`result-stop.json`、`receipt.json`；非法 `goal-as-work-item.json`、`scheduler-hint.json`；不含凭据、客户项目名或上游源码
- [ ] T002 [P] 确认 `package.json` 的 version 保持 `0.1.0`，`test` 脚本仍为既有 `tsc` + `node --test` 门禁，dependencies 中无 `loopx`

---

## Phase 2: Foundational

### Tests for Foundation

- [ ] T003 [P] 在 `tests/engine-deps.test.ts` 写失败测试：根目录与 `packages/*/package.json` 的 dependencies/devDependencies/optionalDependencies/peerDependencies 均不含 `loopx`；`src/` 无 `from "loopx"`
- [ ] T004 [P] 在 `tests/engine-boundary.test.ts` 写失败测试：`EnginePort` 类型不含 schedule/heartbeat/quota/startAgent/createGoal；含 `goal_id` 或 `scheduler_hint` 的载荷被拒绝且不写入账本

### Implementation for Foundation

- [ ] T005 实现 `src/hufu/engine-schema.ts`：校验 `loopx-mechanisms` 选用、TypedResult `kind` 枚举、Receipt 核验字段，以及禁止键清单，使 T004 载荷拒绝转绿
- [ ] T006 实现 `src/hufu/engine-loopx.ts`：`EnginePort.assertBindable` / `assertTypedResult` / `assertReceipt`，无网络、无外部命令
- [ ] T007 更新 `src/hufu/errors.ts`：加入 `ENGINE_NOT_BOUND`、`ENGINE_AUTHORITY_REJECTED`、`ENGINE_CONTROL_PLANE_REJECTED`、`RECEIPT_INVALID` 及退出码映射
- [ ] T008 更新 `src/hufu/envelope.ts`：登记 `hufu/engine.bound`、`hufu/engine.typed_result`、`hufu/engine.receipt` 事件类型

**Checkpoint**: 依赖锁与禁止键单测可写；尚无 decide 成功路径

---

## Phase 3: User Story 1 - 显式选用可选引擎 (Priority: P1) 🎯 MVP

**Goal**: `decide --engine` 绑定 `loopx-mechanisms`；未绑定对照保持 #6；引擎不能当任务正本

**Independent Test**: 未选用时既有 decide/status 夹具不变；选用后 `status.engine.engine_id` 为 `loopx-mechanisms` 且 `task_authority` 不变；`connect --task-authority loopx` 退出码 2

### Tests

- [ ] T009 [P] [US1] 在 `tests/engine-bind.test.ts` 写失败测试：合法 `--engine` 退出码 0 且不联网；相同选用幂等；未知 id 退出码 2；`--task-authority loopx` 退出码 2 `TASK_AUTHORITY_UNSUPPORTED`；未绑定 `status` 的 engine 槽为 data_insufficient 且无 `engine_no_progress`
- [ ] T010 [P] [US1] 扩展 `tests/decide-packet.test.ts` 或对等 #6 夹具：未绑定引擎时 packet/envelope/ack 合同保持

### Implementation

- [ ] T011 [US1] 更新 `src/hufu/cli.ts` 与 `src/hufu/decide.ts`：解析互斥 `--engine`；校验 `--actor` 为当值 `project_lead`；追加 `hufu/engine.bound`
- [ ] T012 [US1] 更新 `src/hufu/connect.ts`：明确拒绝 `loopx` / `engine` / `engine-loopx` 作为 `task_authority`
- [ ] T013 [US1] 更新 `src/hufu/projector.ts`：折叠 `engine` 槽；未绑定为 data_insufficient

**Checkpoint**: T009 转绿；默认路径不变

---

## Phase 4: User Story 2 - 类型化结果 (Priority: P1)

**Goal**: `decide --result` 记录 `kind` 与信封引用；禁止 Goal 映射与控制面字段

**Independent Test**: 合法结果退出码 0；未绑定退出码 4；`goal_id` / `scheduler_hint` 退出码 2；status 不含工作项完成

### Tests

- [ ] T014 [P] [US2] 在 `tests/engine-result.test.ts` 写失败测试：绑定后合法 progress 结果退出码 0 且返回 `result_id`/`kind`/`content_digest`；未绑定 `ENGINE_NOT_BOUND`；无信封 `DATA_INSUFFICIENT`；非法 kind 为 `CONTRACT_INVALID`；`goal-as-work-item.json` 为 `ENGINE_AUTHORITY_REJECTED`；`scheduler-hint.json` 为 `ENGINE_CONTROL_PLANE_REJECTED`；status JSON 不含 `goal_id` 工作项

### Implementation

- [ ] T015 [US2] 更新 `src/hufu/decide.ts`：解析 `--result`，`--actor` 必须为信封执行者，追加 `hufu/engine.typed_result`
- [ ] T016 [US2] 更新 `src/hufu/projector.ts`：折叠 `typed_result` 槽；`kind=progress` 不得改写工作项生命周期或 `first_durable_effect`

**Checkpoint**: 类型化结果与拒绝清单绿

---

## Phase 5: User Story 3 - 回执只证明核验，读回前不得重试 (Priority: P1)

**Goal**: `--receipt` 只记录 `ok` 与证据；不得当授权；无 complete 读回不得冒充效果

**Independent Test**: 合法回执不改 grant_revision；夹带授权字段 `RECEIPT_INVALID`；`--effect` 无读回仍拒绝 applied

### Tests

- [ ] T017 [P] [US3] 在 `tests/engine-receipt.test.ts` 写失败测试：指向已有 result 的回执退出码 0 且授权修订不变；夹带 `grant_id`/`observed_result` 退出码 2 `RECEIPT_INVALID`；未绑定退出码 4；未知 result 退出码 4；回执后 `first_durable_effect` 不得因 `ok=true` 变成 applied
- [ ] T018 [P] [US3] 扩展 `tests/decide-delta.test.ts`：引擎绑定后 `--effect` 无 complete 读回仍不得 `applied`/`confirmed_absent`/`0`

### Implementation

- [ ] T019 [US3] 更新 `src/hufu/decide.ts`：解析 `--receipt` 并追加 `hufu/engine.receipt`
- [ ] T020 [US3] 更新 `src/hufu/projector.ts`：折叠 `receipt` 槽；Receipt 不写入效果耐久状态

**Checkpoint**: 回执与读回约束绿

---

## Phase 6: User Story 4 - 无进展停止且绝不调度 (Priority: P1)

**Goal**: 无进展派生 `engine_no_progress`；handoff 不给新前向步骤；Goal/Todo/Registry 与调度输入失败关闭；无议题写回

**Independent Test**: stop + confirmed_absent 的 status 含 `engine_no_progress`；未绑定对照不含该护栏；边界夹具不产生工作项

### Tests

- [ ] T021 [P] [US4] 在 `tests/engine-recovery.test.ts` 写失败测试：绑定引擎、complete 读回 `confirmed_absent`、最后结果 `kind=stop` 时 status 含 `engine_no_progress`；handoff `next_action_text` 不含新前向步骤但仍退出码 0；未绑定对照无该护栏；缺少 TypedResult 时不因「没看到」而派生无进展
- [ ] T022 [P] [US4] 扩展 `tests/engine-boundary.test.ts`：GitHub/GitLab 正本下 `--result`/`--receipt` 不调用 GitHubPort/GitLabPort；不出现议题写方法

### Implementation

- [ ] T023 [US4] 更新 `src/hufu/guardrails.ts`：按 data-model 派生 `engine_no_progress`；无 timer
- [ ] T024 [US4] 更新 `src/hufu/handoff.ts` 与 `src/hufu/projector.ts`：护栏出现时下一步只陈述护栏

**Checkpoint**: 无进展与只读边界绿

---

## Phase 7: Polish

- [ ] T025 [P] 按 `quickstart.md` 更新 `README.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `CHANGELOG.md`：LoopX 第一批机制已由 #9 交付为可选引擎；会商 / Web / 出站 Runtime 仍未实现；不得把合入写成 `0.1.0` 已发布；不得把 HEAD Apache-2.0 写成已接受实现基线
- [ ] T026 [P] 确认 `NOTICE.md` 仍只是设计研究引用（本批未复制源码则不改为采用源码）；`docs/COMPATIBILITY.md` 核对本保持 `58f545ae`
- [ ] T027 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录（通过只证明本地验证）

## Dependencies

- Phase 2 阻塞 US1–US4
- US1 绑定后 US2 才能记结果
- US2 有结果后 US3 回执与 US4 无进展才有输入
- US3 与 US4 测试文件可并行编写；护栏实现依赖结果与 #6 效果增量

## Parallel examples

- T001–T004 可并行
- T009–T010 可并行
- T017–T018 可并行
- T021–T022 可并行

## Implementation Strategy

1. 先绿依赖锁与禁止键
2. 再绿 `--engine` 与未绑定对照
3. 再绿 `--result`
4. 再绿 `--receipt` 与读回不放宽
5. 再绿无进展护栏与投影只读
6. 文档与门禁

## Notes

- 不要引入 `loopx` 依赖或复制上游源码
- 不要实现 Scheduler、Heartbeat、Quota、自动开工、出站 Session
- 不要把 Goal/Todo/Registry 映射为工作项
- 不要新增顶级产品命令或 Cordis 插件
- 不要在 `pnpm test` 中访问网络
- 不要把缺失观测写成 `0`
- 不要关闭 #5；不要把本模块写成 `0.1.0` 已发布
