# Tasks: 本仓 GitHub 只读投影

**Input**: Design documents from `/specs/004-github-readonly/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-018 要求先写失败测试，再写生产代码。下列测试任务不可省略。门禁不得打真实 GitHub。

**Organization**: 按用户故事分组。引用解析、只读端口与投影缓存是全部故事的前置。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 连接 / US2 刷新边界 / US3 当前视图 / US4 失败保留与只读

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/004-github-readonly/contracts/`

---

## Phase 1: Setup

- [ ] T001 [P] 新增 `tests/fixtures/github/list-issues.sample.json`：公开议题元数据夹具（含一条 PR 项、一条带 `body` 的议题），不含凭据
- [ ] T002 [P] 确认 `package.json` 的 `test` 仍为 `tsc && node --test dist/tests/**/*.test.js`，version 保持 `0.1.0`

---

## Phase 2: Foundational

### Tests for Foundation

- [ ] T003 [P] 在 `tests/github-ref.test.ts` 写失败测试：本仓 HTTPS/SSH 解析成功；其他仓/残缺 URL 失败；`github:Blicae8917/hufu#4` 合法；`#012`、缺号、`gitlab:` 失败
- [ ] T004 [P] 在 `tests/github-adapter.test.ts` 写失败测试：list 只用 GET；POST/PATCH 被记录则失败；`body` 不进入投影；`pull_request` 项丢弃；Port 类型不含写方法（可用结构断言或显式禁止函数）

### Implementation for Foundation

- [ ] T005 实现 `src/hufu/github-ref.ts`：仓库身份与 `external_ref` 解析，使 T003 转绿
- [ ] T006 实现 `src/hufu/github-port.ts` 与 `src/hufu/github-http.ts`：只读 `listIssueProjections`，使 T004 转绿
- [ ] T007 实现 `src/hufu/projection-cache.ts`：读写 `.hufu/cache/github-projection.json`；失败不删旧文件；未知 schema fail closed

**Checkpoint**: 引用与只读端口单测绿；尚无 connect/status 成功联网路径

---

## Phase 3: User Story 1 - 把本仓连成 GitHub 正本 (Priority: P1) 🎯 MVP

**Goal**: `connect --task-authority github` 对本仓成功；默认不联网；与 `local` 互斥

### Tests

- [ ] T008 [P] [US1] 在 `tests/github-connect.test.ts` 写失败测试：本仓 github 连接退出码 0 且 `task_authority=github`；不发起 fetch；其他仓退出码 2；已 local 再 github 退出码 3
- [ ] T009 [P] [US1] 扩展 `tests/cli.test.ts`：`gitlab` 仍非 0；`local` 连接合同保持

### Implementation

- [ ] T010 [US1] 更新 `src/hufu/connect.ts` 与 `cli.ts`：允许 github 本仓；拒绝 gitlab 与非本仓
- [ ] T011 [US1] 更新 `src/hufu/work-item.ts`：`task_authority=github` 时拒绝打开本机工作项

**Checkpoint**: T008 转绿；连接不联网

---

## Phase 4: User Story 2 - 显式刷新才上网 (Priority: P1)

**Goal**: github 下 `--refresh` 只读拉取；缺省 status 不联网；local 下刷新仍为合同无效

### Tests

- [ ] T012 [P] [US2] 在 `tests/github-status.test.ts` 写失败测试：无 `--refresh` 时 fetch 调用次数为 0；`--refresh` 调用 list 一次并写缓存；local 下 `--refresh` 退出码 2 且 fetch 为 0

### Implementation

- [ ] T013 [US2] 更新 `src/hufu/status.ts` 与 `cli.ts`：解析 `--refresh`；仅 github 正本允许成功刷新
- [ ] T014 [US2] `doctor`/`handoff` 保持不调用 GitHubPort

**Checkpoint**: 网络边界由测试锁死

---

## Phase 5: User Story 3 - 同一套 CurrentView (Priority: P1)

**Goal**: 投影条目带链接、external_ref、观测时间与三轴；正文不进视图

### Tests

- [ ] T015 [P] [US3] 扩展 `tests/github-status.test.ts`：刷新后 work_items 含 `original_url` 与 `github:Blicae8917/hufu#`；`fact_class=observed`；夹具 `body` 不出现在 stdout JSON；缺失 revision 不为 `0`

### Implementation

- [ ] T016 [US3] 更新 `src/hufu/projector.ts`：合并缓存与账本；无缓存时工作项集合 `data_insufficient`

**Checkpoint**: 三轴与不可信正文测试绿

---

## Phase 6: User Story 4 - 失败保留与只读交接 (Priority: P1)

**Goal**: 刷新失败保留旧缓存并标 stale/unavailable；handoff 引用外部 ref 不写回

### Tests

- [ ] T017 [P] [US4] 扩展 `tests/github-adapter.test.ts`：先成功写入缓存，再让 list 失败，`status` 仍见旧项且 freshness 不是 `fresh`；缓存文件仍在
- [ ] T018 [P] [US4] 在 `tests/github-handoff.test.ts` 写失败测试：对缓存中的 `github:Blicae8917/hufu#4` 交接退出码 0 且 fetch 为 0；未知引用退出码 4；Port 无写调用

### Implementation

- [ ] T019 [US4] 刷新失败映射 `OBSERVATION_UNAVAILABLE` 且不删缓存；过期阈值将无刷新查看标 `stale`
- [ ] T020 [US4] 更新 `src/hufu/handoff.ts`：接受缓存中的 external_ref；不调用 GitHubPort

**Checkpoint**: 失败保留与只读交接绿

---

## Phase 7: Polish

- [ ] T021 [P] 按 `quickstart.md` 更新 `README.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `CHANGELOG.md`：GitHub 只读投影已由本模块交付；GitLab 仍未实现
- [ ] T022 [P] 扩展 `tests/ci-workflow.test.ts` 若需要：工作流仍只跑三道门、仍无 secrets
- [ ] T023 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录（通过只证明本地验证；夹具路径不替代真网验收）

## Dependencies

- Phase 2 阻塞 US1–US4
- US1 连接后 US2 刷新才有正本
- US2 写入缓存后 US3/US4 才能断言视图与失败保留
- US3 与 US4 测试文件可并行编写，实现上 projector 先于 handoff 更稳

## Parallel examples

- T001–T004 可并行
- T008–T009 可并行
- T017–T018 可并行

## Implementation Strategy

1. 先绿引用与只读端口
2. 再绿 github connect（不联网）
3. 再绿 `--refresh` 边界
4. 再绿 CurrentView 与失败保留
5. 文档与门禁

## Notes

- 不要实现 GitLab、token、写回、第五个产品命令、决策状态机或 Cordis
- 不要在 `pnpm test` 中访问网络
- 不要把缺失观测写成 `0`
