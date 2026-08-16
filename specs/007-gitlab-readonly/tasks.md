# Tasks: GitLab 只读投影

**Input**: Design documents from `/specs/007-gitlab-readonly/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 规格 FR-018 要求先写失败测试，再写生产代码。下列测试任务不可省略。门禁不得打真实 GitLab。

**Organization**: 按用户故事分组。引用解析、只读端口与 GitLab 投影缓存是全部故事的前置。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 连接 / US2 刷新边界 / US3 当前视图 / US4 失败保留、只读交接与裁决

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/007-gitlab-readonly/contracts/`

---

## Phase 1: Setup

- [ ] T001 [P] 新增 `tests/fixtures/gitlab/list-issues.sample.json`：公开议题元数据夹具（示例身份 `example-group/example-project`，含一条 MR/非 Issue 项、一条带 `description` 的议题），不含凭据或客户项目名
- [ ] T002 [P] 确认 `package.json` 的 version 保持 `0.1.0`，`test` 脚本仍为既有 `tsc` + `node --test` 门禁

---

## Phase 2: Foundational

### Tests for Foundation

- [ ] T003 [P] 在 `tests/gitlab-ref.test.ts` 写失败测试：`example-group/example-project` 与 `gitlab.com` HTTPS/SSH 解析成功；嵌套组、GitHub 网址、`github:`、自建 Host 失败；`gitlab:example-group/example-project#456` 合法；`#012`、缺号、`github:Blicae8917/hufu#4` 失败
- [ ] T004 [P] 在 `tests/gitlab-adapter.test.ts` 写失败测试：list 只用 GET 且无 Authorization；POST/PATCH 被记录则失败；`description` 不进入投影；MR/非 Issue 项丢弃；Port 类型不含写方法

### Implementation for Foundation

- [ ] T005 实现 `src/hufu/gitlab-ref.ts`：项目身份与 `external_ref` 解析，使 T003 转绿；不得修改 `src/hufu/github-ref.ts` 去接受 `gitlab:`
- [ ] T006 实现 `src/hufu/gitlab-port.ts` 与 `src/hufu/gitlab-http.ts`：只读 `listIssueProjections`，Host 仅 `gitlab.com`，使 T004 转绿
- [ ] T007 实现 `src/hufu/gitlab-cache.ts`：读写 `.hufu/cache/gitlab-projection.json`；失败不删旧文件；未知 schema fail closed；不读取 GitHub 缓存文件

**Checkpoint**: 引用与只读端口单测绿；尚无 connect/status 成功联网路径

---

## Phase 3: User Story 1 - 把工作区连成 GitLab 正本 (Priority: P1) 🎯 MVP

**Goal**: `connect --task-authority gitlab` 对可解析 `group/project` 成功；默认不联网；与 `local` / 本仓 `github` 互斥

**Independent Test**: 连接后 `task_authority=gitlab`；非法身份与已有正本冲突被拒绝；本机与 GitHub 连接合同保持

### Tests

- [ ] T008 [P] [US1] 在 `tests/gitlab-connect.test.ts` 写失败测试：合法 gitlab 连接退出码 0 且 `task_authority=gitlab`；不发起 fetch；嵌套组/GitHub 网址退出码 2；已 local 或 github 再 gitlab 退出码 3；gitlab 正本下打开本机工作项被拒绝
- [ ] T009 [P] [US1] 扩展 `tests/connect.test.ts` / `tests/github-connect.test.ts`：`local` 与本仓 `github` 合同保持；不再把合法 `gitlab` 当作永久 `TASK_AUTHORITY_UNSUPPORTED`

### Implementation

- [ ] T010 [US1] 更新 `src/hufu/connect.ts` 与 `src/hufu/cli.ts`：允许 gitlab 两段路径；拒绝非法身份；`repository_canonical` 为 `group/project`
- [ ] T011 [US1] 更新 `src/hufu/work-item.ts` 与 `src/hufu/doctor.ts`：`task_authority=gitlab` 时拒绝打开本机工作项；doctor 接受 gitlab 且不联网

**Checkpoint**: T008 转绿；连接不联网

---

## Phase 4: User Story 2 - 显式刷新才上网 (Priority: P1)

**Goal**: gitlab 下 `--refresh` 只读拉取；缺省 status 不联网；local 下刷新仍为合同无效；github 刷新合同保持

**Independent Test**: 无刷新 fetch=0；有刷新 list 一次；local `--refresh` 仍退出码 2

### Tests

- [ ] T012 [P] [US2] 在 `tests/gitlab-status.test.ts` 写失败测试：无 `--refresh` 时 fetch 调用次数为 0；`--refresh` 调用 list 一次并写 GitLab 缓存；local 下 `--refresh` 退出码 2 且 fetch 为 0；github 正本刷新仍走 GitHubPort 而非 GitLabPort

### Implementation

- [ ] T013 [US2] 更新 `src/hufu/status.ts`：解析后仅 gitlab 正本使用 GitLabPort；github 路径保持 004
- [ ] T014 [US2] 确认 `src/hufu/doctor.ts`、`src/hufu/handoff.ts`、`src/hufu/decide.ts` 不调用 GitLabPort

**Checkpoint**: 网络边界由测试锁死

---

## Phase 5: User Story 3 - 同一套 CurrentView (Priority: P1)

**Goal**: 投影条目带链接、`gitlab:group/project#号`、观测时间与三轴；正文不进视图

**Independent Test**: 刷新后每条工作项可读链接与三轴；夹具 `description` 不出现在 JSON

### Tests

- [ ] T015 [P] [US3] 扩展 `tests/gitlab-status.test.ts`：刷新后 work_items 含 `original_url` 与 `gitlab:example-group/example-project#`；`fact_class=observed`；夹具 `description` 不出现在 stdout JSON；缺失 revision 不为 `0`

### Implementation

- [ ] T016 [US3] 更新 `src/hufu/projector.ts`：gitlab 正本合并 GitLab 缓存与账本；无缓存时工作项集合 `data_insufficient`；不把 GitHub 缓存混入 gitlab 视图

**Checkpoint**: 三轴与不可信正文测试绿

---

## Phase 6: User Story 4 - 失败保留与只读交接/裁决 (Priority: P1)

**Goal**: 刷新失败保留旧缓存并标 stale/unavailable；handoff 与 decide 引用 GitLab ref 不写回

**Independent Test**: 先成功再失败仍见旧项且非 fresh；交接/裁决 fetch=0；Port 无写调用

### Tests

- [ ] T017 [P] [US4] 扩展 `tests/gitlab-adapter.test.ts`：先成功写入缓存，再让 list 失败，`status` 仍见旧项且 freshness 不是 `fresh`；缓存文件仍在
- [ ] T018 [P] [US4] 在 `tests/gitlab-handoff.test.ts` 写失败测试：对缓存中的 `gitlab:example-group/example-project#456` 交接退出码 0 且 fetch 为 0；未知引用退出码 4；`github:` 引用退出码 2；Port 无写调用
- [ ] T019 [P] [US4] 在 `tests/gitlab-decide.test.ts` 写失败测试：GitLab 正本下对缓存引用记下 packet 退出码 0 且不联网；输出不含议题正文；`github:` `task_ref` 被拒绝

### Implementation

- [ ] T020 [US4] 刷新失败映射 `OBSERVATION_UNAVAILABLE` 且不删 GitLab 缓存；过期阈值将无刷新查看标 `stale`
- [ ] T021 [US4] 更新 `src/hufu/handoff.ts` 与 `src/hufu/decide.ts`：按当前正本分发到 `gitlab-ref.ts` 或 `github-ref.ts`；GitLab 正本只接受缓存中的 GitLab 引用；不调用 GitLabPort

**Checkpoint**: 失败保留、只读交接与裁决绿

---

## Phase 7: Polish

- [ ] T022 [P] 按 `quickstart.md` 更新 `README.md` / `docs/SPEC.md` / `docs/ARCHITECTURE.md` / `CHANGELOG.md`：GitLab 只读投影已由本模块交付；会商 / LoopX / Web / 出站 Runtime 仍未实现；不得把合入写成 `0.1.0` 已发布
- [ ] T023 [P] 扩展 `tests/ci-workflow.test.ts` 若需要：工作流仍只跑三道门、仍无 secrets、无本模块临时关 Issue 工作流
- [ ] T024 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录（通过只证明本地验证；夹具路径不替代真网验收）

## Dependencies

- Phase 2 阻塞 US1–US4
- US1 连接后 US2 刷新才有正本
- US2 写入缓存后 US3/US4 才能断言视图与失败保留
- US3 与 US4 测试文件可并行编写，实现上 projector 先于 handoff/decide 更稳

## Parallel examples

- T001–T004 可并行
- T008–T009 可并行
- T017–T019 可并行

## Implementation Strategy

1. 先绿引用与只读端口
2. 再绿 gitlab connect（不联网）
3. 再绿 `--refresh` 边界
4. 再绿 CurrentView 与失败保留
5. 文档与门禁

## Notes

- 不要实现写回、token、嵌套组、自建实例、第五个产品命令、会商、LoopX、Web 或新的 Cordis 插件
- 不要在 `pnpm test` 中访问网络
- 不要把缺失观测写成 `0`
- 不要把 GitLab 解析塞进 `github-ref.ts`
- 不要关闭 #5；不要把本模块写成 `0.1.0` 已发布
