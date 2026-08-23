# Tasks: GitLabTaskMutationProvider（受控写回）

**Input**: Design documents from `/specs/013-gitlab-mutation/`

**本波已交付**: kit 与通过的 `tests/013-gitlab-mutation-spec.test.ts`。下列任务属于 **#57 后续实现 PR**，本波不得执行。

**Tests**: 实现 PR 必须先写会失败的测试，再写生产代码。那些失败测试不得在本波落地。

## Phase 1: 未来实现的失败测试

- [ ] T001 [P] 在 `tests/gitlab-task-mutation-provider.test.ts` 写失败测试：只读 `GitLabPort` 仍无写方法；独立端口只接受五种 kind
- [ ] T002 [P] 写失败测试：缺少任一绑定字段则 preview 失败；同一 `effect_id` + 不同 digest 冲突停止
- [ ] T003 [P] 写失败测试：无 `transport_security_exception_ref` 的 HTTP 写失败关闭；只读 allowlist 不足
- [ ] T004 [P] 写失败测试：`close_issue` 在 Evidence 不全或 readback `data_insufficient` 时不得关闭；真实项目 execute 被拒绝，只允许 preview

## Phase 2: Foundational（被 T001–T004 阻断）

- [ ] T005 新增独立 mutation 端口类型与五种 kind 枚举，不修改只读端口
- [ ] T006 实现 preview：GET + 身份 / revision / allowlist / kind 校验，持久化 `mutation.prepared`
- [ ] T007 实现 execute / readback / 幂等 / 隐藏 comment marker；无跨 API 事务

## Phase 3: 用户故事

- [ ] T008 [US1] 五种 kind 绿；禁止项保持拒绝
- [ ] T009 [US2] 绑定字段、合法 no-op、超时先 readback
- [ ] T010 [US3] HTTP 例外与公开安全夹具（仅示例主机）

## Phase 4: Polish

- [ ] T011 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`
- [ ] T012 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，不得写「CI 绿 = 生产已自动化」

## Notes

- 版本保持 `0.1.0`。不 npm-publish。不连真实生产 GitLab。不 vendoring LoopX。
- 不要把本波 kit 勾选为已实现 Adapter。
