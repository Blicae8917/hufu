# Tasks: 本机账本与四个有界命令

**Input**: Design documents from `/specs/003-local-ledger-commands/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-021 要求先写失败测试，再写生产代码。下列测试任务不可省略。

**Organization**: 按用户故事分组。账本信封、摘要与单写者存储是全部故事的前置。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成任务）
- **[Story]**: US1 连接与冷启动 / US2 健康检查 / US3 当前视图 / US4 交接

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/003-local-ledger-commands/contracts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 让测试运行器能收录本模块新文件；准备摘要夹具

- [x] T001 将 `package.json` 的 `test` 脚本改为 `tsc && node --test dist/tests/`，version 保持 `0.1.0`
- [x] T002 [P] 新增 `tests/fixtures/digest/rfc8785-examples.json`：收录 RFC 8785 附录中本模块用得到的对象/数组/字符串/整数样例及期望规范化字节

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 错误合同、摘要、事件信封、JSONL 单写者存储；此后才能写故事

**⚠️ CRITICAL**: 用户故事实现前完成本阶段

### Tests for Foundation ⚠️

> 先写测试并确认失败，再写实现

- [x] T003 [P] 在 `tests/digest.test.ts` 写失败测试：夹具输入经规范化 + SHA-256 得到固定小写 `sha256:<hex>`；键序不同的等价对象摘要相同；禁止用 `JSON.stringify` 冒充 RFC 8785
- [x] T004 [P] 在 `tests/envelope.test.ts` 写失败测试：合法信封通过；缺 `ledger_seq`/`payload_digest` 失败；`event_schema_version` 大于 1 失败关闭
- [x] T005 [P] 在 `tests/ledger.test.ts` 写失败测试（均用 `os.tmpdir()`）：空账本追加 `ledger_seq=1` 且行末 LF；已存在 `write.lock` 时拒绝写入且不改 `events.jsonl`；中间畸形行读取 fail closed；仅最后一行截断时读取报告未完成追加且默认不截除

### Implementation for Foundation

- [x] T006 实现 `src/hufu/errors.ts`：`CommandError`、`contracts/command-error.v1.md` 中的 code 枚举、退出码 `2/3/4` 映射
- [x] T007 实现 `src/hufu/digest.ts`：`digest_spec_version="1"` 的 RFC 8785 有界规范化与 SHA-256，使 T003 转绿
- [x] T008 实现 `src/hufu/envelope.ts`：按 `contracts/event-envelope.v1.md` 与 `data-model.md` 校验信封，使 T004 转绿
- [x] T009 实现 `src/hufu/storage.ts`：`StorageDomain` 接口 + JSONL（`.hufu/ledger/events.jsonl`、`write.lock` 独占创建 `wx`、幂等键、撕裂策略），使 T005 转绿

**Checkpoint**: 摘要、信封、锁与损坏策略单测全绿；尚不实现四命令成功路径

---

## Phase 3: User Story 1 - 第一次把本机项目连上并立下授权 (Priority: P1) 🎯 MVP

**Goal**: `connect` 按冷启动顺序写入 Project、指挥官、首份 AuthorizationGrant、当值 `project_lead`；冲突拒绝；相同重提幂等

**Independent Test**: 临时目录中带齐必填参数的 `hufu connect` 退出码 0；账本恰好一套冷启动身份；第二写者或不同载荷被拒绝

### Tests for User Story 1 ⚠️

- [x] T010 [P] [US1] 在 `tests/connect.test.ts` 写失败测试：合法 `local` 连接 stdout JSON 含 `grant_id` 与 `project_lead_binding_id`、退出码 0；相同参数重提身份不变且不双份引导事件；`--task-authority github` 退出码 2 且 code `TASK_AUTHORITY_UNSUPPORTED`；预先放置 `write.lock` 则退出码 3 且 `LEDGER_WRITER_CONFLICT`
- [x] T011 [P] [US1] 扩展 `tests/cli.test.ts`：无参数 `connect` 仍非 0 且不创建 `.hufu/`（与 M1 断言兼容）；成功路径的详细断言放在 `tests/connect.test.ts`

### Implementation for User Story 1

- [x] T012 [US1] 实现 `src/hufu/connect.ts`：校验参数、构造四条引导事件、一次性追加、幂等键由项目标识+正本+指挥官+授权范围确定性派生
- [x] T013 [US1] 更新 `src/hufu/cli.ts`：解析 `connect` 旗标、成功/失败均向 stdout 写 JSON、按 `contracts/cli.md` 设退出码；`validate` 行为保持 M1

**Checkpoint**: T010 转绿；`validate` 仍绿；裸 `connect` 不建账本

---

## Phase 4: User Story 2 - 检查本机是否健康、能否安全继续 (Priority: P1)

**Goal**: `doctor` 只读报告；尾部截断需显式 `--repair-truncated-tail`

**Independent Test**: 健康账本退出码 0；缺失账本退出码 4；中间损坏退出码 3；修复开关只处理最后一行未完成

### Tests for User Story 2 ⚠️

- [x] T014 [P] [US2] 在 `tests/doctor.test.ts` 写失败测试：冷启动后 `doctor` 退出码 0 且 `healthy=true`；无 `.hufu/` 退出码 4；中间坏行退出码 3 `LEDGER_CORRUPT` 且不改文件；仅尾部截断时无开关退出码 3、有 `--repair-truncated-tail` 后可再 `doctor` 成功并多一条 `hufu/ledger.repair.truncated_tail`

### Implementation for User Story 2

- [x] T015 [US2] 实现 `src/hufu/doctor.ts`：只读诊断与可选尾部修复，对齐 `contracts/cli.md`
- [x] T016 [US2] 更新 `src/hufu/cli.ts` 路由 `doctor` 与 `--repair-truncated-tail`

**Checkpoint**: T014 转绿；`connect` 仍绿

---

## Phase 5: User Story 3 - 从一份当前视图看清事实能不能用 (Priority: P2)

**Goal**: `status` 回放 CurrentView 三轴；默认不联网；无工作项时相关槽为 `data_insufficient`

**Independent Test**: 连接后 `status` 退出码 0 且每项重要事实含三轴；`--refresh` 退出码 2；同一账本三次 `status` 视图相同

### Tests for User Story 3 ⚠️

- [x] T017 [P] [US3] 在 `tests/status.test.ts` 写失败测试：连接后 `task_authority.value=local` 且带 `fact_class`/`availability`/`freshness`；`session`/`run` 非 `available` 且 value 不是 `0`；`--refresh` 退出码 2 `CONTRACT_INVALID`；未连接退出码 4
- [x] T018 [P] [US3] 在 `tests/replay.test.ts` 写失败测试：打开本机工作项后连续三次投影/三次 `status`，工作项集合、`grant_revision`、`project_lead` 绑定 id 相同

### Implementation for User Story 3

- [x] T019 [US3] 实现 `src/hufu/work-item.ts`：追加 `hufu/work_item.opened` 的领域函数（无新产品命令），供 T018 与后续交接测试调用
- [x] T020 [US3] 实现 `src/hufu/projector.ts`：确定性回放为 `contracts/current-view.v1.md` 的 CurrentView
- [x] T021 [US3] 实现 `src/hufu/status.ts` 并更新 `src/hufu/cli.ts` 路由 `status`（拒绝刷新类参数）

**Checkpoint**: T017/T018 转绿；无网络调用

---

## Phase 6: User Story 4 - 留下交接且下一步不越权 (Priority: P2)

**Goal**: `handoff` 追加交接；下一步文本含工作项 id 且不超出 `scope_text`

**Independent Test**: 已打开的 `wi-1` 上交接退出码 0；缺工作项退出码 4；写者锁冲突退出码 3

### Tests for User Story 4 ⚠️

- [x] T022 [P] [US4] 在 `tests/handoff.test.ts` 写失败测试：先 connect 再 `work-item.ts` 打开 `wi-1`，合法 `handoff` 退出码 0 且 `next_action_text` 含 `wi-1`；未知工作项退出码 4 `DATA_INSUFFICIENT`；缺 `--completed` 退出码 2；存在 `write.lock` 退出码 3

### Implementation for User Story 4

- [x] T023 [US4] 实现 `src/hufu/handoff.ts`：校验工作项与当前 Grant、字面范围检查、追加 `hufu/handoff.recorded`
- [x] T024 [US4] 更新 `src/hufu/cli.ts` 路由 `handoff` 旗标

**Checkpoint**: 四命令合同测试全绿；`validate` 仍绿

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 文档与门禁与行为一致

- [x] T025 更新 `README.md` 当前范围：四命令与本机账本已交付；GitHub 投影、Cordis、会商、网页仍为尚未实现；快速开始增加临时目录 connect/doctor/status 示例（不写本机绝对路径）
- [x] T026 [P] 更新 `CHANGELOG.md` 的 `[0.1.0]`：记录本机账本与四命令，明确不包含决策状态机与 GitHub 投影
- [x] T027 [P] 更新 `docs/SPEC.md` 与 `docs/ARCHITECTURE.md` 文首「当前实现」句，使其与 README 一致
- [x] T028 按 `specs/003-local-ledger-commands/quickstart.md` 在临时目录走通成功与失败样例
- [x] T029 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录结果（通过只证明本地验证）

---

## Phase 8: Increment - 显式项目根（#40）

**Goal**: 六条有界命令按标志 → 环境变量 → cwd 解析项目根，输出 `project_root`，失败关闭且不新增退出码。

**Independent Test**: 从非目标 cwd 用 `--project-root` 连接，账本只出现在指定目录；空值/缺失路径退出码 2；Windows 路径形状契约在 Ubuntu 上可跑。

### Tests ⚠️

- [ ] T030 [P] [US5] 在 `tests/project-root.test.ts` 写失败测试：解析顺序、stdout 顶层 `project_root`、跨 cwd 落点、空值/非目录退出码 2、`path.win32` 盘符/混用分隔符/UNC

### Implementation

- [ ] T031 [US5] 实现 `src/hufu/project-root.ts` 与 `src/hufu/cli.ts` 接入，使 T030 转绿；不改事件格式
- [ ] T032 [P] [US5] 更新 README、003 quickstart、CHANGELOG 与 `docs/SPEC.md`：写明 `--project-root` / `HUFU_PROJECT_ROOT` 为 #38 的显式逃生舱
- [ ] T033 [US5] 运行 `pnpm test`、`node scripts/check-version.mjs`、`node scripts/check-upstream-drift.mjs --mode=static`、`git diff --check`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖
- **Foundational (Phase 2)**: 依赖 Setup；阻塞全部用户故事
- **US1 (Phase 3)**: 依赖 Foundational；本模块 MVP
- **US2 (Phase 4)**: 依赖 US1（需要可检查的账本）
- **US3 (Phase 5)**: 依赖 US1；可与 US2 并行（不同文件）
- **US4 (Phase 6)**: 依赖 US3 的 `work-item.ts` 与 projector
- **Polish (Phase 7)**: 依赖 US1–US4
- **#40 Increment (Phase 8)**: 依赖已交付的六条有界命令；不改事件或 CurrentView

### User Story Dependencies

- **US1**: 不依赖其他故事；交付后即可演示连接与授权
- **US2**: 依赖 US1 写入的账本，但 doctor 代码与 connect 文件分离
- **US3**: 依赖 US1；不依赖 doctor 修复路径
- **US4**: 依赖 US3 打开工作项与 CurrentView 形状

### Parallel Opportunities

- T002 与 T001 之后的文档夹具
- T003、T004、T005
- T010 与 T011
- T017 与 T018
- T025 完成后 T026 与 T027
- Foundational 完成后，US2 与 US3 可由不同人并行，只要约定 `cli.ts` 合并点

### Parallel Example: Foundation tests

```bash
# 可并行写三个失败测试：
# tests/digest.test.ts
# tests/envelope.test.ts
# tests/ledger.test.ts
```

### Parallel Example: User Story 3 tests

```bash
# tests/status.test.ts
# tests/replay.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 Setup
2. 完成 Phase 2 Foundational（锁、摘要、信封）
3. 完成 Phase 3 US1 `connect` 冷启动
4. **停止并验收**：临时目录连接成功、幂等、冲突拒绝
5. 维护者确认后再做 doctor / status / handoff

### Incremental Delivery

1. Setup + Foundational → 可测的本机账本内核
2. US1 connect → MVP 演示
3. US2 doctor → 损坏与锁可诊断
4. US3 status → 三轴视图与回放相同
5. US4 handoff → 四个有界命令齐备
6. Polish → 文档与门禁

### Suggested MVP for maintainer review of this Spec Kit drop

本提交只含规格/计划/任务，不含实现。实现阶段建议的第一可演示切片是 **US1（connect + 冷启动）**；发布门验收需要 US1–US4 全部完成。

---

## Notes

- [P] 任务 = 不同文件、不依赖未完成任务
- 每个测试任务必须先红后绿
- 测试一律使用临时目录，不得在仓库根写入 `.hufu/`
- 不要实现 `DECISION_PACKET` 状态机、GitHub Adapter、Cordis 或 `--refresh` 成功路径
- 版本保持 `0.1.0`
