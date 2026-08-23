# Tasks: Codex NativeHost RuntimeProvider + SessionBinding

**#59 已交付**: packet-only Provider与原合同测试。**#67 已交付**: Codex App Consumer v2。

- [x] T001 [P] 在 `tests/codex-native-host-provider.test.ts` 写失败测试：缺失宿主原生工具时 CLI 失败关闭，不回退 subagent
- [x] T002 [P] 写失败测试：同槽双 start 被 CAS 拒绝；旧 generation send/result/close 被拒绝
- [x] T003 [P] 写失败测试：Claude Chat Provider 不得声明可写构建；Codex CLI 不得声明 App managed thread
- [x] T004 [P] 写失败测试：无 readback 不得声称投递；wait 紧轮询不合格
- [x] T005 实现 `capabilities` / `start` / `resume` / `send` / `observe` / `wait` / `interrupt` / `release` / `readback` 类型与失败关闭
- [x] T006 实现 SessionBinding 字段与 generation fence
- [x] T007 运行门禁；报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`
- [x] T008 [#67] RED→GREEN：prepare→Host call→complete/readback 两阶段与进程重启恢复
- [x] T009 [#67] RED→GREEN：`clientThreadId` pending→稳定 `threadId`，hostId/cursor耐久化
- [x] T010 [#67] RED→GREEN：受控 message Resolver、active Turn明确拒绝、Host失败耐久回执
- [x] T011 [#67] RED→GREEN：双 start / ABA /旧generation、逻辑handoff、release Host readback
- [x] T012 [#67] 回归 #59 / #60 与全量门禁；版本保持 `0.1.0`

## Notes

- 实现测试文件为 `tests/codex-native-host.test.ts`（覆盖 T001–T004 合同）。
- V2 测试文件为 `tests/codex-native-host-consumer-v2.test.ts`（覆盖 T008–T011）。
- 版本保持 `0.1.0`。不 npm-publish。不 vendoring LoopX。不读原始 transcript。
- 真实生产写回仍未授予。HTTP 写须额外 exception ref。
