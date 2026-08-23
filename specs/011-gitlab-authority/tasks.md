# Tasks: 自建 GitLab AuthorityProvider

**Input**: Design documents from `/specs/011-gitlab-authority/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**本设计 PR**: 只落地 Kit 与 `tests/011-gitlab-authority-spec.test.ts`（必须通过）。下列任务属于**未来实现 PR**，本设计 PR **不得**执行。

**Tests**: 规格 FR-011 要求未来实现先写失败测试。下面 Phase 1 的失败适配器测试必须是未来实现 PR 的第一批工作，且不得在本设计 PR 落地（会破坏 CI）。

**Organization**: 先失败测试，再按用户故事实现。写回实现另被 Constitution 闸门阻断。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行
- **[Story]**: US1 只读/Authority 边界 / US2 自建正本条件 / US3 ADR 0006 归类与公开安全

## Path Conventions

仓库根目录单包：`src/hufu/`、`tests/`、`specs/011-gitlab-authority/contracts/`

---

## Phase 1: 未来实现的失败测试（必须先红，本设计 PR 不落地）

**Purpose**: 任何 Adapter / CLI / `src/` 改动之前，先有会失败的测试。

- [x] T001 [P] 在 `tests/gitlab-authority-adapter.test.ts` 写失败测试：007 的 `parseGitLabProject` / `parseGitLabExternalRef` 对示例自建来源 `https://gitlab.example.com/example-group/example-project`（示例）与 `gitlab-instance:gitlab.example.com/example-group/example-project#456`（示例）仍失败关闭；端口对象仍无写方法
- [x] T002 [P] 在 `tests/gitlab-authority-identity.test.ts` 写失败测试：显式 `self_hosted` + 允许清单内的示例来源才能声明正本；`gitlab.com` 冒充自建、缺允许清单、git remote 推断均失败关闭
- [x] T003 [P] 在 `tests/gitlab-authority-nowrite.test.ts` 写失败测试：正本声明成立后 `write_back_enabled` 仍为 false；create/update/close/comment/merge 路径不存在；Constitution 未修订时写回 grant 失败关闭
- [x] T004 [P] 扩展 `tests/gitlab-ref.test.ts` 与 `tests/gitlab-adapter.test.ts` 的失败断言：本实现不得让 007 解析器开始接受自建 Host 或 `gitlab-instance:`（证明不扩大 007）

**Checkpoint**: 未来实现 PR 在这些测试失败后，才能写生产代码。本设计 PR 停在此处之前。

---

## Phase 2: Foundational（未来实现，被 T001–T004 阻断）

- [x] T005 新增 `src/hufu/gitlab-instance-ref.ts`：只解析 `gitlab-instance:` 与显式自建来源；**不得**修改 `src/hufu/gitlab-ref.ts` 去接受自建 Host
- [x] T006 保持 `src/hufu/gitlab-port.ts` 只读；不得增加写方法。凭据不得进入连接记录或 HTTP 默认头

**Checkpoint**: 007 既有测试仍绿；自建解析与 007 解析分文件

---

## Phase 3: User Story 1 - 只读影子与 Authority 分界 (Priority: P1)

**Goal**: 运行时继续把 007 能力留在只读；自建正本声明走独立路径，默认不写回

**Independent Test**: 007 夹具行为不变；自建声明不打开写方法

- [x] T007 [P] [US1] 扩展 `tests/gitlab-authority-adapter.test.ts`：007 list 合同保持；Authority 路径即使存在也无写调用
- [x] T008 [US1] 若增加声明记录，只写 `instance_kind` / 示例安全字段到本机连接，不写凭据，不改 007 缓存文件名

---

## Phase 4: User Story 2 - 自建正本条件 (Priority: P1)

**Goal**: 身份、允许清单、失败关闭、默认不写回同时成立才能声明 `task_authority=gitlab` 自建正本

**Independent Test**: 四项缺一即失败关闭；SaaS 不可写

- [x] T009 [P] [US2] 扩展 `tests/gitlab-authority-identity.test.ts`：示例来源 + 允许清单成功声明后仍不联网、不写回
- [x] T010 [US2] 连接路径拒绝 `gitlab.com` 可写、拒绝 remote 推断；成功路径默认 `read_projection`

---

## Phase 5: User Story 3 - 不复活废止路线 (Priority: P1)

**Goal**: 实现不引入 Goal/Todo/Scheduler/Heartbeat、出站 Runtime、LoopX 桥或 Renderer

**Independent Test**: 无新控制面子命令；`hufu serve` 仍拒绝

- [x] T011 [P] [US3] 在 `tests/gitlab-authority-nowrite.test.ts` 或现有 CLI 测试中断言：本实现不增加 `serve` 成功路径、不增加会商 / 出站 Runtime / Goal 命令
- [x] T012 [US3] 不实现写回；若有人打开写回，须先有维护者批准的 Constitution 修订（本任务在闸门关闭时保持拒绝）

---

## Phase 6: Polish（未来实现 PR）

- [x] T013 [P] 仅在实现票且行为已变时更新 `CHANGELOG.md` Unreleased；版本保持 `0.1.0`；不编辑 #5，不关闭 #49 以外由实现票自己决定的流程
- [x] T014 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check` 并分别记录

## Dependencies

- T001–T004 阻塞全部实现任务
- T005–T006 阻塞 US1–US3
- 写回（T012 的开启分支）额外阻塞于 Constitution 修订，本 Kit 不授权该修订
- US1 / US2 / US3 测试文件可并行编写

## Parallel examples

- T001–T004 可并行
- T007 与 T009、T011 可并行编写失败测试

## Implementation Strategy

1. 本设计 PR：只合并 Kit + 通过的 `tests/011-gitlab-authority-spec.test.ts`
2. 未来实现 PR：先红 T001–T004，再写独立解析文件，永不扩大 007
3. 写回另等 Constitution 修订，不得在实现票顺手打开

## Phase 7: #53 后来源形状修订（指挥官授权，修订 011，不另开 013）

**Purpose**: 允许清单内的自建来源可使用 HTTP、IPv4 与非默认端口。这是真实自建形状，不是新 Module。

- [ ] T015 [P] 修订 011 research / spec / contracts：允许清单内 `http:` 或 `https:`；主机名或 IPv4；可选非默认端口；规范来源保留 scheme + host + port；公开示例增加 `http://192.0.2.10:41101`（RFC 5737 TEST-NET-1，示例）与 `http://gitlab.example.com:41101`（示例）
- [ ] T016 [P] 在身份 / 传输 / 011 约束测试中先红后绿：HTTP IPv4:port + allowlist + 宿主凭据可声明 `task_authority=gitlab` 并对该 origin 做认证 GET；HTTPS 示例仍通过；`http://gitlab.com` 与 `https://gitlab.com` 冒充自建失败关闭
- [ ] T017 007 `gitlab-ref.ts` / 007 测试保持拒绝自建 Host 与 `gitlab-instance:`；不改 Constitution；版本保持 `0.1.0`；写回保持关闭
- [ ] T018 公开仓、测试、CHANGELOG、PR 正文不得出现真实客户 / 内部地址或凭据

## Notes

- 不要在本设计 PR 落地 T001–T014
- 不要实现写回、token 存储、嵌套组、Goal/Todo/Scheduler/Heartbeat、会商、出站 Runtime、LoopX 桥或 Renderer
- 不要把 SaaS `gitlab.com` 默认为可写正本
- 不要占用 M10–M15 编号
- 不要修订 Constitution
- 不要创建 `specs/013`
- 公开仓只用标明为示例的占位符；IPv4 示例只用 RFC 5737 TEST-NET-1
