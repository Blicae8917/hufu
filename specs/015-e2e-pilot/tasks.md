# Tasks: 端到端试点验收（大纲）

**本波已交付**: 大纲 kit 与通过的 `tests/015-e2e-pilot-spec.test.ts`。

#57 / #58 / #59 已有代码后的公开夹具测试：

- [X] T001 在 `tests/e2e-pilot-fixture.ts` + `tests/015-e2e-pilot.test.ts` 写失败测试：公开夹具为一个父 + 四个子，且不含真实项目名
- [X] T002 覆盖并行、串行、停线、换届
- [X] T003 覆盖重复回调、过期 revision、中断、重复 start、Turn 中额外消息
- [X] T004 覆盖有序 Effect 链 comment→label→assignee→close，且无重复评论 / 误关
- [X] T005 断言缺失事实不得写成 `0`；LoopX Goal/Todo 未写入议题正文
- [X] T006 真实环境预检仍停在 preview；报告 `IMPLEMENTATION_COMPLETE` 或类型化 `NO_GO`

## Notes

- 版本保持 `0.1.0`。不 npm-publish。不 vendoring LoopX。不连真实生产 GitLab。
- 夹具测试 Greened 不等于生产已自动化；真实项目第一次写仍停在 preview。
