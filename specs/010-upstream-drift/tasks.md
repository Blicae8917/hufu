# Tasks: M9 上游漂移核对门禁

**Input**: [plan.md](./plan.md)、[spec.md](./spec.md)
**GitHub Issue**: [#27](https://github.com/Blicae8917/hufu/issues/27)

## Phase 1: 失败测试

- [x] T001 在 `tests/upstream-drift.test.ts` 覆盖匹配、漂移、网络失败、仓库不可解析、表无法解析、非法 SHA、`HUFU_DENY_NETWORK=1` 未核对
- [x] T002 扩展 `tests/ci-workflow.test.ts`：CI 含 `node scripts/check-upstream-drift.mjs`，仍无 secrets

## Phase 2: 脚本与合同

- [x] T003 写 `scripts/check-upstream-drift.mjs`：解析门禁核对表；注入或默认 `git ls-remote`
- [x] T004 距离缺失报 `data_insufficient`，不得写 `0`；不改 COMPATIBILITY.md
- [x] T005 在 `docs/COMPATIBILITY.md` 增加门禁核对表（HEAD 观测，不升已接受基线）
- [x] T006 接入 `.github/workflows/ci.yml`

## Phase 3: 文档

- [x] T007 合同 `specs/010-upstream-drift/contracts/gate.md`

## Amendment (#41)

- [x] T008 测试覆盖 `static` / `observe` / `release`：match、HEAD 前进、tag 移动、不可达、离线、契约错误
- [x] T009 脚本按 mode 映射退出码；`drift` 在 observe 中不是不兼容
- [x] T010 普通 CI 只跑 `--mode=static`；观测放入 `schedule` / `workflow_dispatch`
