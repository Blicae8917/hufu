# Tasks: GitLabTaskMutationProvider（受控写回）

**Input**: Design documents from `/specs/013-gitlab-mutation/`

**交付历史**: 初始波交付 kit；#57 完成 T001–T012；#66 完成 T013–T019 的 production binding hardening。

**Tests**: 每个实现切片必须先写会失败的测试，再写最小生产代码；最终分支不得保留红灯。

## Phase 1: #57 实现的失败测试

- [x] T001 [P] 在 `tests/gitlab-task-mutation-provider.test.ts` 写失败测试：只读 `GitLabPort` 仍无写方法；独立端口只接受五种 kind
- [x] T002 [P] 写失败测试：缺少任一绑定字段则 preview 失败；同一 `effect_id` + 不同 digest 冲突停止
- [x] T003 [P] 写失败测试：无 `transport_security_exception_ref` 的 HTTP 写失败关闭；只读 allowlist 不足
- [x] T004 [P] 写失败测试：`close_issue` 在 Evidence 不全或 readback `data_insufficient` 时不得关闭；真实项目 execute 被拒绝，只允许 preview

## Phase 2: Foundational（被 T001–T004 阻断）

- [x] T005 新增独立 mutation 端口类型与五种 kind 枚举，不修改只读端口
- [x] T006 实现 preview：GET + 身份 / revision / allowlist / kind 校验，持久化 `mutation.prepared`
- [x] T007 实现 execute / readback / 幂等 / 隐藏 comment marker；无跨 API 事务

## Phase 3: 用户故事

- [x] T008 [US1] 五种 kind 绿；禁止项保持拒绝
- [x] T009 [US2] 绑定字段、合法 no-op、超时先 readback
- [x] T010 [US3] HTTP 例外与公开安全夹具（仅示例主机）

## Phase 4: Polish

- [x] T011 运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`
- [x] T012 报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`，不得写「CI 绿 = 生产已自动化」

## Phase 5: #66 production binding hardening

- [x] T013 RED→GREEN：任意 injected fetch 无显式 production grant 时零写入失败关闭
- [x] T014 RED→GREEN：只读 grant 拒写；结构化 `action=mutate` scope 与 exact target / kind / payload allowance 求交；authority / decision / envelope / actor / task refs exact Ledger 绑定
- [x] T015 RED→GREEN：read allowlist、exact target/kind/label/assignee write allowance
- [x] T016 RED→GREEN：owner-local 六状态互斥转换；issue / projection labels 缺失失败关闭
- [x] T017 RED→GREEN：current decision version + current envelope Effect EvidenceRef / acceptance matrix 关闭闸门，拒绝旧 evidence 与 boolean
- [x] T018 RED→GREEN：prepared grant / label scope 审计；readback-first 收尾与 current grant / envelope / revision-safe 续写
- [x] T019 更新公开安全 e2e 夹具；仍无真实 endpoint、secret 或 GitLab 写入

## Notes

- 版本保持 `0.1.0`。不 npm-publish。不连真实生产 GitLab。不 vendoring LoopX。
- 不要把本波 kit 勾选为已实现 Adapter。
