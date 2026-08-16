# Tasks: M8 效能试点与条件式本机网页

**Input**: `specs/009-pilot-gate/` 的设计产物  
**Prerequisites**: plan.md、spec.md、research.md、data-model.md、contracts/  
**GitHub Issue**: [#10](https://github.com/Blicae8917/hufu/issues/10)  
**Tests**: 实现行为前必须先有失败测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: 用户故事
- 每个用户故事必须能独立验收

## Path Conventions

- 源码：`src/hufu/`
- 测试：`tests/`
- 夹具：`tests/fixtures/pilot/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 合成夹具与测试入口，不含产品行为。

- [ ] T001 [P] 在 `tests/fixtures/pilot/` 增加合法净收益、权衡、数据不足、非法结论、单一用量宣称成功、含绝对路径和内部项目名的拒绝夹具；全部脱敏，不含凭据
- [ ] T002 [P] 在 `tests/fixtures/pilot/` 增加同一 `comparison_class` 的三轮净收益序列和三轮 `NO_NET_BENEFIT` 序列，供门禁测试使用
- [ ] T003 [P] 确认 `.gitignore` 与仓库根目录不存在 `pilots/`、`research-data/` 或其它 gitignored 研究目录；测试将锁定这一边界

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 结论枚举、度量槽、事件、错误码和 CurrentView 槽位。完成前不要开始用户故事实现。

**⚠️ CRITICAL**: 本阶段未完成时，用户故事无法落地。

- [ ] T004 [P] 在 `tests/pilot-record.test.ts` 增加失败测试：非法结论、`NET_BENEFIT` 缺质量声明、把缺失度量写成 `0`、估算标成实测均应 `PILOT_INVALID`
- [ ] T005 [P] 在 `src/hufu/pilot-schema.ts` 实现记录 schema、结论枚举、度量槽三态和隐私字符串拒绝
- [ ] T006 [P] 在 `tests/` 锁定 `hufu/pilot.recorded` 事件名与幂等键 `hufu/pilot.recorded:<pilot_id>`；payload 不得含系统时间戳
- [ ] T007 在 `src/hufu/envelope.ts` 与 `src/hufu/errors.ts` 登记 `hufu/pilot.recorded`、`PILOT_INVALID`、`EXPANSION_GATE_CLOSED`

**Checkpoint**: Schema 与错误码已有失败测试和最小实现，可以开始 US1。

---

## Phase 3: User Story 1 - 记录可解释的试点结论 (Priority: P1) 🎯 MVP

**Goal**: commander 或当值 project_lead 能提交脱敏记录，得到封闭结论。

**Independent Test**: 合法记录写入 Journal；非法结论或无 handoff 失败。

### Tests for User Story 1 ⚠️

- [ ] T008 [P] [US1] 在 `tests/pilot-record.test.ts` 覆盖：合法 `NET_BENEFIT` 成功；无 handoff 返回 `DATA_INSUFFICIENT`；非授权角色返回 `ROLE_NOT_ACTIVE`
- [ ] T009 [P] [US1] 在 `tests/pilot-record.test.ts` 覆盖同一 `pilot_id` 的幂等成功与 payload 冲突时的 `LEDGER_DIGEST_CONFLICT`

### Implementation for User Story 1

- [ ] T010 [US1] 在 `src/hufu/pilot.ts` 实现记录校验、工作项 `handoff` 前置检查和质量声明检查
- [ ] T011 [US1] 在 `src/hufu/cli.ts` 增加 `hufu pilot --actor <id> --record <file>`，成功 stdout 只含脱敏摘要
- [ ] T012 [US1] 在 `src/hufu/projector.ts` 增加 `pilot` 槽；未记录时 `data_insufficient` 且 `value=null`

**Checkpoint**: US1 可独立演示记录与拒绝。

---

## Phase 4: User Story 2 - 派生度量且缺失不为零 (Priority: P1)

**Goal**: 协调唤醒、零效果尝试和返工从事件派生；缺失墙钟/用量不为 `0`。

**Independent Test**: 合成 Journal 能证明派生计数；缺窗口的槽为 `data_insufficient`。

### Tests for User Story 2 ⚠️

- [ ] T013 [P] [US2] 在 `tests/pilot-metrics.test.ts` 覆盖协调唤醒与返工的事件派生，以及把缺失写成 `0` 的拒绝
- [ ] T014 [P] [US2] 在 `tests/pilot-metrics.test.ts` 覆盖无观测窗口时零效果尝试为 `data_insufficient`，有窗口且无新效果时计数为 1
- [ ] T015 [P] [US2] 在 `tests/pilot-metrics.test.ts` 覆盖估算用量不得标 `measured`，原生用量缺失不得输出 `0`

### Implementation for User Story 2

- [ ] T016 [US2] 在 `src/hufu/pilot.ts` 实现 `coordination_wakeups`、`rework`、`zero_effect_attempts` 派生，并在冲突时 fail closed
- [ ] T017 [US2] 把派生结果写入 `hufu/pilot.recorded` payload 与 status 投影，保持 `origin` 语义

**Checkpoint**: US2 可独立证明度量合同。

---

## Phase 5: User Story 3 - 三轮门禁默认不做网页 (Priority: P1)

**Goal**: 不足三轮或非净收益时拒绝网页/远程/新控制面；即使三轮净收益也不实现网页。

**Independent Test**: `hufu serve` 恒失败；三轮净收益后门禁为 `evaluation_allowed` 但 `serve_allowed=false`。

### Tests for User Story 3 ⚠️

- [ ] T018 [P] [US3] 在 `tests/pilot-gate.test.ts` 覆盖不足三轮时 `expansion_gate.status=closed`，`hufu serve` 返回 `EXPANSION_GATE_CLOSED` 且不监听端口
- [ ] T019 [P] [US3] 在 `tests/pilot-gate.test.ts` 覆盖三轮同类 `NET_BENEFIT` 后门禁为 `evaluation_allowed`，但 `serve` 仍失败，`web_implemented=false`
- [ ] T020 [P] [US3] 在 `tests/pilot-gate.test.ts` 覆盖三轮 `NO_NET_BENEFIT` 后 `status=paused`；`TRADEOFF`/`FAIL`/`DATA_INSUFFICIENT` 不能打开评估；`connect --task-authority web` 失败

### Implementation for User Story 3

- [ ] T021 [US3] 在 `src/hufu/pilot.ts` 与 `src/hufu/projector.ts` 实现 `ExpansionGate` 三态，`serve_allowed` 与 `web_implemented` 恒为 `false`
- [ ] T022 [US3] 在 `src/hufu/cli.ts` 把 `serve` 登记为已知拒绝命令；在 `src/hufu/connect.ts` 明确拒绝网页类 `task_authority`

**Checkpoint**: US3 可独立证明默认不做网页。

---

## Phase 6: User Story 4 - 公开仓只留口径与脱敏聚合 (Priority: P1)

**Goal**: 私有路径、内部项目名和凭据被拒绝；公开输出只有脱敏聚合。

**Independent Test**: 拒绝夹具失败；status/stdout 不含路径和项目名；`.gitignore` 不增加研究目录。

### Tests for User Story 4 ⚠️

- [ ] T023 [P] [US4] 在 `tests/pilot-privacy.test.ts` 覆盖绝对路径、内部项目名和凭据形态的 `PILOT_INVALID`
- [ ] T024 [P] [US4] 在 `tests/pilot-privacy.test.ts` 覆盖脱敏聚合只含比较类别、结论计数、度量名称和方法引用，不含按工作项用量明细
- [ ] T025 [P] [US4] 在 `tests/pilot-privacy.test.ts` 断言仓库不新增 gitignored 研究目录，夹具不含本机绝对路径

### Implementation for User Story 4

- [ ] T026 [US4] 在 `src/hufu/pilot-schema.ts` 与记录输出路径落实隐私扫描和脱敏聚合
- [ ] T027 [US4] 确保 `tests/fixtures/pilot/` 只有合成脱敏数据，不添加真实试点文件

**Checkpoint**: US4 可独立证明公开仓边界。

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] 更新 `README.md`、`docs/SPEC.md`、`docs/ARCHITECTURE.md`、`CHANGELOG.md`：写明试点合同已交付为记录与门禁，网页仍未实现，且不把合入写成 `0.1.0` 已发布
- [ ] T029 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`；版本保持 `0.1.0`

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup → Foundational → US1 → US2 → US3 → US4 → Polish
- Foundational 阻塞全部用户故事实现
- US2 依赖 US1 的记录命令
- US3 依赖 US1/US2 的记录与度量
- US4 可与 US3 部分并行，但隐私扫描属于同一 schema

### User Story Dependencies

- **US1 (P1)**: 只依赖 Foundational
- **US2 (P1)**: 依赖 US1
- **US3 (P1)**: 依赖 US1 和 US2 的门禁输入
- **US4 (P1)**: 依赖记录输出形状，可在 US1 后开始测试

### Parallel Opportunities

- T001–T003 可并行
- T004 与 T006 可并行
- 每个故事的测试任务可在实现前并行编写
- T028 文档更新可并行于测试稳定之后

---

## Parallel Example: User Story 1

```text
# 先一起写失败测试：
T008 + T009

# 再实现：
T010 → T011 → T012
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. 完成 Setup + Foundational
2. 交付 `hufu pilot --record`
3. 停下来验证非法记录被拒绝

### Incremental Delivery

1. Setup + Foundational
2. US1 记录
3. US2 度量
4. US3 门禁与 `serve` 拒绝
5. US4 隐私
6. 文档与门禁

### Notes

- 本模块不实现网页、HTTP 服务器或远程访问
- 不要把 Journal 当授权
- 不要把缺失度量写成 `0`
- 不要在公开仓保存真实试点数据
- 版本保持 `0.1.0`
- 合入前不要写 `Closes #10`；维护者说「合」后再合并并关闭 Issue
