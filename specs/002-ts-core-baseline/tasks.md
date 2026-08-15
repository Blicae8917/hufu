# Tasks: 当前工作基线与历史基线退役

**Input**: Design documents from `/specs/002-ts-core-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-012 要求先写失败测试，再写生产代码。下列测试任务不可省略。

**Organization**: 按用户故事分组。删除 Python 必须发生在 `v0.0.1` 标签已推送、且 TypeScript `validate` 已可用之后。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成任务）
- **[Story]**: US1 一套当前门禁 / US2 历史标签 / US3 信封校验 / US4 拒绝产品命令

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`scripts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立 TypeScript 单包骨架，暂时与 Python 树并存

- [x] T001 在 `.gitignore` 增加 `node_modules/`、`dist/`、`.pnpm-store/`
- [x] T002 新增根目录 `package.json`：name `hufu`、version `0.1.0`、type `module`、engines Node `>=22.19.0`、bin 指向 `dist/src/hufu/main.js`、scripts 含 `build`/`test`、`packageManager` 锁定 pnpm 主版本、零运行时依赖、devDependency 仅 `typescript`
- [x] T003 [P] 新增 `tsconfig.json`：strict、ESM、`module`/`moduleResolution` = `Node16`、root 含 `src` 与 `tests`、outDir `dist/`
- [x] T004 [P] 新增 `src/hufu/version.ts`，导出字面量 `0.1.0`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 版本门禁脚本与编译入口；此后才能写故事测试

**⚠️ CRITICAL**: 用户故事实现前完成本阶段

- [x] T005 新增 `scripts/check-version.mjs`，比对 `package.json`、`src/hufu/version.ts`、`VERSION.md` 中 `Current version: \`...\``，不一致则以非 0 退出
- [x] T006 新增 `src/hufu/main.ts` 与 `src/hufu/cli.ts` 占位：可编译，默认对未知参数非 0 退出，尚不实现 `validate` 成功路径
- [x] T007 运行 `pnpm install` 生成 `pnpm-lock.yaml`，确认 `tsc` 能产出 `dist/`

**Checkpoint**: `pnpm exec tsc` 通过；`node scripts/check-version.mjs` 在版本一致时通过

---

## Phase 3: User Story 2 - 历史 0.0.1 仍可完整取出 (Priority: P1)

**Goal**: 在删除 Python 之前冻结历史基线

**Independent Test**: `git checkout v0.0.1` 后按该树 README 能跑通当时验证

- [x] T008 [US2] 在提交 `638213a` 打 annotated 标签 `v0.0.1` 并推送到 `origin`（远程当前无标签）
- [x] T009 [US2] 在 `README.md` 增加「历史 0.0.1」一小节，说明 `git checkout v0.0.1` 后使用该树文档，不把 Python 命令留作当前主线步骤

**Checkpoint**: `git ls-remote --tags origin` 可见 `v0.0.1`；检出标签后 Python 测试仍可用

---

## Phase 4: User Story 3 - 最小信封校验仍然可用 (Priority: P2) 🎯 本模块可演示能力

**Goal**: TypeScript 入口提供与 0.0.1 同等的 `validate`

**Independent Test**: `pnpm hufu validate examples/task.json` 成功；缺字段退出码 2

### Tests for User Story 3 ⚠️

> 先写测试并确认失败，再写实现

- [x] T010 [P] [US3] 在 `tests/contracts.test.ts` 写失败测试：合法 native 信封通过；缺 objective、未知 source、空 authorization_scope 抛错；external_ref 合法时可保留；对象上不得出现 `external_status`
- [x] T011 [P] [US3] 在 `tests/cli.test.ts` 写失败测试：合法文件退出码 0 且 stdout 为键排序的 `ValidateSummary`；`{}` 退出码 2 且 stderr 含 `schema_version`；损坏 JSON 与缺失文件退出码 2

### Implementation for User Story 3

- [x] T012 [US3] 实现 `src/hufu/contracts.ts`：`ProjectRef`、`TaskEnvelope`、`validateTask`，对齐 `specs/002-ts-core-baseline/contracts/task-envelope.v0.1.json` 与 `data-model.md`
- [x] T013 [US3] 实现 `src/hufu/cli.ts` 的 `validate` 路径：读 UTF-8 文件、失败 stderr 前缀 `invalid task contract: `、成功打印键排序 JSON
- [x] T014 [US3] 连接 `src/hufu/main.ts` 到 CLI，使 `pnpm hufu validate examples/task.json` 可用

**Checkpoint**: T010/T011 由红转绿；样例文件校验成功

---

## Phase 5: User Story 4 - 产品协调命令明确尚未提供 (Priority: P2)

**Goal**: connect/doctor/status/handoff 不能成功、不能建运行态

**Independent Test**: 四个子命令均非 0 退出，工作区无 `.hufu/`

### Tests for User Story 4 ⚠️

- [x] T015 [US4] 扩展 `tests/cli.test.ts`：对 `connect`/`doctor`/`status`/`handoff` 断言非 0 退出，且测试临时目录中不出现 `.hufu/`

### Implementation for User Story 4

- [x] T016 [US4] 在 `src/hufu/cli.ts` 拒绝未登记子命令；错误信息不得暗示这些产品命令已执行

**Checkpoint**: 四命令失败；`validate` 仍成功

---

## Phase 6: User Story 1 - 只面对一套当前验证入口 (Priority: P1)

**Goal**: 主线只留一套 Node 门禁；Python 实现与旧门禁从主线消失

**Independent Test**: README 与 AGENTS 指向同一套命令且能跑通；仓库中不再有「当前必须跑 Python」的步骤

- [x] T017 [US1] 从主线删除 `pyproject.toml`、`src/hufu/*.py`、`tests/test_*.py`、`tests/smoke.py`、`tests/smoke.sh`、`scripts/check_version.py`、`scripts/check-version.sh`（此时 `v0.0.1` 必须已存在）
- [x] T018 [US1] 把 `AGENTS.md` 交付门禁改为 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`
- [x] T019 [P] [US1] 同步 `.specify/memory/constitution.md`「交付流程与质量门禁」为同一组 Node 命令，并更新同步影响报告（版本保持 0.1.0）
- [x] T020 [P] [US1] 更新 `README.md` 快速开始与 `CONTRIBUTING.md` 为 pnpm 步骤；删除 Python 快速开始
- [x] T021 [US1] 通读 `README.md`、`docs/SPEC.md`、`docs/ARCHITECTURE.md` 的当前范围/状态，确保四命令、账本、插件、会商、网页仍标为尚未实现

**Checkpoint**: 主线无法再靠 Python 跑当前门禁；文档只有一套步骤

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 对照 quickstart 做一次完整验收

- [x] T022 按 `specs/002-ts-core-baseline/quickstart.md` 跑当前主线全部步骤
- [x] T023 确认 `CHANGELOG.md` 的 `[0.1.0]` 只记录本模块基线迁移，不把四命令写成已交付
- [x] T024 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并记录结果

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖
- **Foundational (Phase 2)**: 依赖 Setup
- **US2 (Phase 3)**: 依赖 Foundational；必须在删除 Python 之前
- **US3 (Phase 4)**: 依赖 Foundational；可与 US2 并行
- **US4 (Phase 5)**: 依赖 US3 的 CLI 入口
- **US1 (Phase 6)**: 依赖 US2 标签已推送，且 US3/US4 已绿
- **Polish (Phase 7)**: 依赖 US1

### User Story Dependencies

- **US2**: 可在 Foundational 后立即做；阻塞 Python 删除
- **US3**: 不依赖 US2 代码，但合并前必须两者都完成
- **US4**: 依赖 US3
- **US1**: 依赖 US2 + US3 + US4

### Parallel Opportunities

- T003 与 T004
- T010 与 T011
- T018 完成后，T019 与 T020
- US2（T008–T009）可与 US3 测试编写并行

---

## Parallel Example: User Story 3

```text
T010 tests/contracts.test.ts
T011 tests/cli.test.ts
然后串行：T012 → T013 → T014
```

---

## Implementation Strategy

### MVP

1. Setup + Foundational
2. US2 打上 `v0.0.1`
3. US3 `validate` 由红转绿
4. 此时已可演示新基线校验，但仍可能与 Python 并存

### 完整交付（本模块合并前必须全部完成）

5. US4 拒绝四命令
6. US1 删除 Python 并统一门禁文档
7. Polish / quickstart

本模块不拆第二张 PR 来「稍后再删 Python」。

---

## Notes

- 不引入 Cordis、Vitest、网络或 `.hufu/`
- 版本保持 `0.1.0`
- 每完成一个逻辑组可提交；删除 Python 的提交必须发生在标签推送之后
