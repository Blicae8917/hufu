# Tasks: Codex NativeHost RuntimeProvider + SessionBinding

**本波已交付**: kit 与通过的 `tests/014-codex-native-host-spec.test.ts`。下列任务属于 **#59 后续实现 PR**。

- [ ] T001 [P] 在 `tests/codex-native-host-provider.test.ts` 写失败测试：缺失宿主原生工具时 CLI 失败关闭，不回退 subagent
- [ ] T002 [P] 写失败测试：同槽双 start 被 CAS 拒绝；旧 generation send/result/close 被拒绝
- [ ] T003 [P] 写失败测试：Claude Chat Provider 不得声明可写构建；Codex CLI 不得声明 App managed thread
- [ ] T004 [P] 写失败测试：无 readback 不得声称投递；wait 紧轮询不合格
- [ ] T005 实现 `capabilities` / `start` / `resume` / `send` / `observe` / `wait` / `interrupt` / `release` / `readback` 类型与失败关闭
- [ ] T006 实现 SessionBinding 字段与 generation fence
- [ ] T007 运行门禁；报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`

## Notes

- 版本保持 `0.1.0`。不 npm-publish。不 vendoring LoopX。不读原始 transcript。
- 真实生产写回仍未授予。HTTP 写须额外 exception ref。
