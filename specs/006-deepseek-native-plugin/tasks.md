# Tasks: DeepSeek 原生插件路径

**Input**: `specs/006-deepseek-native-plugin/` 下的 design documents
**Prerequisites**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`
**Tests**: 规格 FR-018 要求实现行为前先写失败测试。本模块按用户故事组织测试与实现。
**Organization**: 任务按用户故事分组，使每个故事可独立实现与验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1–US5）
- 描述中必须包含确切文件路径

## Path Conventions

- 核心包（仓库根 `hufu`）：`src/hufu/`（零运行时依赖，禁止 import cordis / hufu-dsh）
- 插件包：`packages/hufu-dsh/`
- 插件测试：`tests/dsh/`
- 夹具：`tests/fixtures/dsh/`
- 文档：`README.md`、`docs/SPEC.md`、`docs/ARCHITECTURE.md`、`CHANGELOG.md`、`docs/COMPATIBILITY.md`

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 建立 workspace 与空插件包骨架，尚未实现领域行为。根包保持独立 CLI，不把 `src/hufu` 迁到 `packages/hufu`。

- [ ] T001 新增 `pnpm-workspace.yaml`，声明 `"."` 与 `"packages/hufu-dsh"`；根 `package.json` 保持 `name: "hufu"`、`version: "0.1.0"`、现有 `exports`/`bin`/`scripts`，并作为 workspace 根
- [ ] T002 [P] 新建 `packages/hufu-dsh/package.json`：`name: "hufu-dsh"`、`version: "0.1.0"`、`type: "module"`；依赖 `hufu: "workspace:*"` 与 `@deepseek-ai/cordis@4.0.1`；`exports` 指向 `./src/index.ts`；按 `contracts/plugin-bundle.md` 声明 `dsh.bundle.patch`；不把 `@deepseek-ai/cordis` 提升到根包
- [ ] T003 [P] 新建 `packages/hufu-dsh/tsconfig.json`，与仓库根 `tsconfig.json` 对齐 `NodeNext` / `strict`
- [ ] T004 [P] 新建 `packages/hufu-dsh/src/index.ts` 空导出占位，使包可被测试 import
- [ ] T005 [P] 在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 中按上游需要列入 `@deepseek-ai/ripgrep`（若安装后仍告警再补）
- [ ] T006 运行 `pnpm install`，确认 lockfile 更新且根包 `dependencies` 仍为空、`@deepseek-ai/cordis` 只出现在 `packages/hufu-dsh`

---

## Phase 2: Foundational（阻塞所有用户故事的失败测试与契约骨架）

**Purpose**: 先写会失败的契约测试与最小类型；这些测试必须在实现前失败。测试文件名与 `plan.md` 一致。

**⚠️ CRITICAL**: 本阶段完成前不得开始用户故事实现

- [ ] T007 [P] 新建 `tests/dsh/bundle-fail-closed.test.ts`：断言 `packages/hufu-dsh/cordis.patch.yml` 存在且符合 `contracts/plugin-bundle.md`（`id: hufu`、`runtime: isolate`、`exports` 指向包入口、`inject: ["hufu"]`）；无有效 bundle 却写入 `bundles` 得到既有 `CONTRACT_INVALID`；一份不完整用户补丁整块替换同 id 后 Hufu 行若被换掉则服务不可用（不得依赖深合并）；当前应失败
- [ ] T008 [P] 新建 `tests/dsh/runtime-identity.test.ts`：扫描 `src/hufu/**/*.ts` 禁止出现 `cordis`、`@deepseek-ai/cordis`、`hufu-dsh` 的 import；断言测试/包元数据声明运行于 `@deepseek-ai/cordis`，且不得声称兼容上游 `cordis`
- [ ] T009 [P] 新建 `tests/dsh/mount-tools.test.ts`：有效 bundle 安装后六工具可调用；工具实现不得 `spawn` `hufu` CLI。当前应失败
- [ ] T010 [P] 新建 `tests/dsh/unmount.test.ts`：无 bundle 的普通依赖不启用；`ctx.plugin.dispose(hufu)` 后工具不可用且 `.hufu/ledger` 仍在。使用临时目录，禁止写 `~/.dsh`
- [ ] T011 [P] 新建 `tests/dsh/view-parity.test.ts`：对 `tests/fixtures/dsh/` 事件夹具分别走 CLI 与插件折叠，断言规范化 JSON 结构相等且 `view_schema_version` 仍为 `1`；夹具或折叠未实现时必须失败
- [ ] T012 [P] 新建 `tests/dsh/missing-observation.test.ts`：缺失墙钟、Token、Session/Run 时断言字段为 `null` 且不得出现字面 `0`；当前应失败
- [ ] T013 [P] 新建 `tests/dsh/agent-loop-boundary.test.ts`：扫描 `packages/hufu-dsh/src` 不得出现 Host Agent Loop 补丁或出站 Runtime/Session 客户端；当前在空骨架上应先失败或明确断言文件尚未实现边界导出
- [ ] T014 [P] 新建 `tests/fixtures/dsh/` 版本化 `events.jsonl`、非法 bundle 夹具与 `README.md`：最小事件序列含 `DECISION_PACKET` 引用、空 `added_scope` 的 `ROUTE_ACK`、护栏拒绝样本；README 说明不得含真实 Issue 正文、凭据或本机绝对路径
- [ ] T015 [P] 在 `packages/hufu-dsh/src/` 增加类型占位 `plugin.ts`、`tools.ts`、`storage-domain.ts`、`runtime-identity.ts`（仅类型/空函数/常量占位，使测试可 import）
- [ ] T016 将 `tests/dsh/*.test.ts` 纳入根测试脚本（`pnpm test` 必须跑到这些文件；`tsc` 覆盖插件包源）
- [ ] T017 运行 `pnpm test`，确认本阶段新测试失败，且既有 `tests/*.test.ts` 仍通过

**Checkpoint**: 失败测试已就位；开始用户故事实现

---

## Phase 3: User Story 1 - 装上插件即可在隔离 Profile 使用六工具 (Priority: P1) 🎯 MVP

**Goal**: 有效 bundle 安装后，隔离 Profile 可调用 `hufu.validate|connect|doctor|status|handoff|decide`，内部走领域函数。

**Independent Test**: 隔离 Context 中六工具可调用；`hufu.decide` 返回与 CLI 同构的 receipt（引用+digest，无裁决正文）。

### Tests for User Story 1

- [ ] T018 [P] [US1] 补全 `tests/dsh/mount-tools.test.ts`：有效 `cordis.patch.yml` + `ctx.plugin(hufu)` 后六工具均注册；每个工具的参数/结果符合 `contracts/tools.md`
- [ ] T019 [P] [US1] 补全 `tests/dsh/bundle-fail-closed.test.ts`：无 bundle 的普通依赖不启用；无有效 bundle 写入 `bundles` → `CONTRACT_INVALID`（不新增 `error.code`）；不完整用户补丁整块替换同 id 后 fail closed

### Implementation for User Story 1

- [ ] T020 [US1] 编写 `packages/hufu-dsh/cordis.patch.yml`：`id: hufu`、`runtime: isolate`、`exports`、`inject: ["hufu"]`，整块自包含
- [ ] T021 [US1] 实现 `packages/hufu-dsh/src/plugin.ts`：`export const name = "hufu"`；`apply(ctx)` 注册 `ctx.hufu` 与六工具；`inject` 按 patch 声明
- [ ] T022 [US1] 实现 `packages/hufu-dsh/src/tools.ts`：六工具均调用根包 `hufu` 导出的领域函数，组装 `CommandError` 时复用 `src/hufu/errors.ts` 的既有 `code`；禁止 spawn CLI 再解析 stdout
- [ ] T023 [US1] 实现 `packages/hufu-dsh/src/index.ts` 导出 plugin apply 入口，供 cordis `exports` 加载
- [ ] T024 [US1] 实现 `packages/hufu-dsh/src/storage-domain.ts`：把工作区 `.hufu/ledger` 封装为 StorageDomain，内部调用核心 `src/hufu/storage.ts`；本模块不启用 Host JSON Storage Provider
- [ ] T025 [US1] 若根包缺少插件可调用的稳定导出，仅在 `src/hufu/` 增加最小 `export`，不得把 Host 类型泄漏进核心，也不得让核心 import 插件包

**Checkpoint**: US1 独立可演示——隔离 Profile 中六工具可用

---

## Phase 4: User Story 2 - 同一事件夹具下 CurrentView 结构相等 (Priority: P1)

**Goal**: CLI 与插件对同一 JSONL 夹具折叠出结构相等的 CurrentView。

**Independent Test**: `tests/dsh/view-parity.test.ts` 通过。

### Tests for User Story 2

- [ ] T026 [P] [US2] 补全 `tests/dsh/view-parity.test.ts`：规范化键序与时间字段后 deep equal；覆盖决策引用槽与护栏摘要；各入口至少回放 3 次自洽
- [ ] T027 [P] [US2] 在 `tests/dsh/view-parity.test.ts` 断言 `view_schema_version` 仍为 `1`，插件不得另起 schema；只比较结构与字段语义，不要求逐字节相同

### Implementation for User Story 2

- [ ] T028 [US2] 实现插件 `hufu.status` / CurrentView 折叠调用与 CLI 同一 `foldCurrentView`（或核心等价导出）
- [ ] T029 [US2] 如需规范化辅助，放在 `tests/dsh/` 或核心测试工具中，不得在 `packages/hufu-dsh/src` 重写折叠算法

**Checkpoint**: US2 独立可验收——夹具对等

---

## Phase 5: User Story 3 - 卸下插件只撤销运行时 Effect (Priority: P1)

**Goal**: dispose 后工具不可用，`.hufu/ledger` 仍在。

**Independent Test**: `tests/dsh/unmount.test.ts` 通过。

### Tests for User Story 3

- [ ] T030 [P] [US3] 补全 `tests/dsh/unmount.test.ts`：dispose 后调用工具失败；ledger 文件与 append-only 内容仍在；再次装入后继续追加而非重建正本
- [ ] T031 [P] [US3] 在 `tests/dsh/unmount.test.ts` 覆盖「仅删除包目录不得当作工具已卸载的证明」的负面断言（运行时 dispose 才算卸载）

### Implementation for User Story 3

- [ ] T032 [US3] 在 `packages/hufu-dsh/src/plugin.ts` 用可撤销 Effect 注册工具与 `ctx.hufu`，确保 `ctx.plugin.dispose(hufu)` 后服务与工具消失
- [ ] T033 [US3] 卸载路径不得调用删除 ledger 的 API；测试用临时工作区与临时 `DSH_HOME` 验证，禁止写 `~/.dsh`

**Checkpoint**: US3 独立可验收——卸下保留事实

---

## Phase 6: User Story 4 - 不可观测值不得写成 0 (Priority: P1)

**Goal**: 缺失墙钟/Token/Session/Run 时字段为不可用，测试断言无字面 `0`。

**Independent Test**: `tests/dsh/missing-observation.test.ts` 通过。

### Tests for User Story 4

- [ ] T034 [P] [US4] 补全 `tests/dsh/missing-observation.test.ts`：构造缺测样本，断言槽位为不可用/`null` 且序列化 JSON 不含把缺失项写成 `0`
- [ ] T035 [P] [US4] 增加断言：插件不得把 Host 未报告的 Token 标为实测；Session 日志不得被当成任务正本

### Implementation for User Story 4

- [ ] T036 [US4] 实现插件侧观测映射：仅透传 Host/Provider 原生值；缺失保持不可用/`null`
- [ ] T037 [US4] 核对本模块不把缺失墙钟写成 `0`；若核心 `foldCurrentView` 已满足则只加插件边界测试

**Checkpoint**: US4 独立可验收——不可观测不为 0

---

## Phase 7: User Story 5 - 运行时身份与不修改 Host Agent Loop (Priority: P2)

**Goal**: 契约测试声明 `@deepseek-ai/cordis`；源码不修改 Host Agent Loop；无出站 Runtime。

**Independent Test**: `tests/dsh/runtime-identity.test.ts` 与 `tests/dsh/agent-loop-boundary.test.ts` 通过。

### Tests for User Story 5

- [ ] T038 [P] [US5] 补全 `tests/dsh/runtime-identity.test.ts`：导出或断言 `CORDIS_IMPLEMENTATION`（`packages/hufu-dsh/src/runtime-identity.ts`）为 `@deepseek-ai/cordis`；文档与测试注释不得写「兼容上游 cordis」
- [ ] T039 [P] [US5] 补全 `tests/dsh/agent-loop-boundary.test.ts`：扫描 `packages/hufu-dsh/src` 不得出现修改 Host Agent Loop 的补丁或出站 Runtime/Session 客户端

### Implementation for User Story 5

- [ ] T040 [US5] 实现 `packages/hufu-dsh/src/runtime-identity.ts` 并确保插件只通过 Cordis Context/插件 API 注册能力，无 Host 源码补丁
- [ ] T041 [US5] 实现动手前核对 `docs/COMPATIBILITY.md` 与 `deepseek-ai/deepseek-harness` `master`；若 SHA 已不是 `47f943859bef60e4160492346772ded9b24f765a`，先更新兼容性记录再实现

**Checkpoint**: US5 独立可验收——身份与边界

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 文档、门禁与可选 dsh 烟测

- [ ] T042 [P] 按 `specs/006-deepseek-native-plugin/quickstart.md` 更新根 `README.md`：产品快速开始使用 `dsh plugin --profile hufu-fixture add <file-spec>`；说明门禁跑同一 Bundle 契约的隔离步骤，不把 `dsh` 二进制当硬依赖
- [ ] T043 [P] 更新 `docs/SPEC.md`、`docs/ARCHITECTURE.md`：DeepSeek 为原生 Host Profile；Standalone 复用同一领域合同；插件包边界
- [ ] T044 [P] 更新 `CHANGELOG.md` Unreleased 与 `docs/COMPATIBILITY.md`（核对日期与 SHA）
- [ ] T045 [P] 可选：`tests/dsh/dsh-cli-smoke.test.ts` 在 `dsh` 于 PATH 且非 Windows 时执行真装真卸；无 `dsh` 时显式 skip，不得假绿。Windows 无 POSIX 隔离时 skip 并记录 `UNAVAILABLE`
- [ ] T046 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`
- [ ] T047 确认未提交 Secret、本机路径、`~/.dsh` 产物；版本仍为已批准的 `0.1.0`（本模块默认不升 PATCH，除非人类维护者另批）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: 无依赖，立即开始
- **Phase 2**: 依赖 Phase 1 —— 阻塞所有用户故事
- **Phase 3 (US1)**: 依赖 Phase 2
- **Phase 4 (US2)**: 依赖 Phase 2；实践上依赖 US1 的插件入口
- **Phase 5 (US3)**: 依赖 Phase 2；实践上依赖 US1 的注册/撤销
- **Phase 6 (US4)**: 依赖 Phase 2；实践上依赖 CurrentView/工具输出
- **Phase 7 (US5)**: 依赖 Phase 2；可与文档并行
- **Phase 8**: 依赖目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 插件注册与工具 —— MVP
- **US2 (P1)**: 需要 US1 的折叠入口
- **US3 (P1)**: 需要 US1 的 dispose 边界
- **US4 (P1)**: 需要工具/视图输出
- **US5 (P2)**: 扫描与兼容性记录，可晚于 MVP 演示但必须在合并前完成

### Parallel Opportunities

- T002–T005 可并行
- T007–T015 可并行
- 各故事内标记 [P] 的测试可并行
- T042–T045 文档与可选烟测可并行

---

## Parallel Example: User Story 1

```text
# 同时启动 US1 测试：
T018 tests/dsh/mount-tools.test.ts
T019 tests/dsh/bundle-fail-closed.test.ts

# 然后顺序实现：
T020 cordis.patch.yml → T021 plugin.ts → T022 tools.ts → T023 index.ts → T024 storage-domain.ts
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational（失败测试）
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: 隔离 Profile 中六工具可调用
5. 再继续 US2–US5

### Incremental Delivery

1. Setup + Foundational → 失败测试就绪
2. US1 → 插件可装可用
3. US2 → 夹具对等
4. US3 → 卸载保留账本
5. US4 → 观测缺失不为 0
6. US5 + 文档 → 合并前完整

### Parallel Team Strategy

- 一人 workspace/插件骨架（Phase 1）
- 一人契约测试（Phase 2）
- Foundational 完成后：一人工具注册（US1/US3），一人对等与观测（US2/US4）

---

## Notes

- [P] 任务 = 不同文件、无未完成依赖
- [Story] 标签将任务映射到规格用户故事
- 每个用户故事独立可验收
- 测试必须先失败再实现
- 不要把 `dsh` 二进制当作 `pnpm test` 硬依赖
- 根包保持 `src/hufu/`；不要把领域核心迁入 `packages/hufu`
- 提交信息建议：`feat: add DeepSeek-native hufu plugin path`
- 不要在本文件勾选任务后声称 Issue #7 已验收；验收以 GitHub Issue 与维护者口令为准
