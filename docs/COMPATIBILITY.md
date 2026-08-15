# 上游兼容性与同步基线

状态：设计基线，尚未完成 Hufu 插件实现与兼容性测试
最后核对：2026-08-15

本文件记录 Hufu 每个发布系列实际核对过的公开上游版本。它是动态兼容性记录，不是 Constitution；
版本出现于此只表示设计或测试基线，不表示 Hufu 已经实现、发布或支持对应集成。

## Hufu 0.1.0 目标基线

| 上游 | 公开仓库 | 已核对基线 | 相关版本 | 当前结论 |
| --- | --- | --- | --- | --- |
| DeepSeek Harness | `deepseek-ai/deepseek-harness` | `47f943859bef60e4160492346772ded9b24f765a` | `@deepseek-ai/dsh` `0.1.0-rc.5` | 2026-08-15 核对过的源码快照；插件实现尚未开始，不声明浮动 `master` 支持。 |
| DeepSeek 使用的 Cordis | DeepSeek Harness `vendor/cordis` | 同上 | `@deepseek-ai/cordis` `4.0.1` | 目标插件与生命周期基础；它是 DeepSeek 命名的实现，不等同于对其他 Cordis 项目的兼容承诺。 |
| LoopX | `huangruiteng/loopx` | `58f545aee1ce00c57b7a4f21b13d78ee0367b3da` | `loopx` `0.4.7` | 已完成机制级核对；不是 Hufu 任务正本，Engine 集成尚未开始。 |

DeepSeek Harness 当前目标工具链基线为 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`、
严格 TypeScript、ESM、Vitest、Oxlint 和 tsdown。Hufu 第一张实现 Module 的 Plan 必须重新核对这些值，
并只选择完成最小骨架所需的工具，不照搬上游 Monorepo 的全部基础设施。

## 漂移状态

- 2026-08-15 的一次 DeepSeek Harness 观测对应上述提交；这是一条带日期的观测，不是“当前永远一致”的承诺。
- 2026-08-15 通过 `refs/heads/main` 直接读取的 LoopX 漂移观测为
  `38719201df6264a7d1940d32e853c3672aed9249`；
  它尚未完成源码复盘，因此不是已接受兼容基线。开始 `engine-loopx` Module 前必须重新读取公开上游、
  比较许可证与边界变化，再更新本文件。
- DeepSeek Harness 官方明确处于 Developer Preview，并提示可能发生破坏性兼容变更；
  Hufu 不使用浮动的“最新版本”声明支持。

## 每次升级必须验证

1. 已选择 Cordis 实现的 Service Definition、Context Injection、类型化 Event 和 Effect 卸载行为；
   卸载不得删除已经持久化的 Hufu 事实。
2. DeepSeek Harness Tool、公开支持的 Session Event、StorageDomain 与 Session 生命周期边界；
   Hufu DomainEvent 不得伪装为未支持的自定义 SessionEvent。
3. DeepSeek Profile 与 Standalone Profile 对同一版本化事件夹具生成规范化结构相等的 CurrentView，
   Host 不可观测字段保持 `unavailable`；决策夹具还必须得到相同的 decision ref/content digest、
   ACK 适用性、Effect cursor 和 semantic rebase 护栏。
4. Windows 与 POSIX 上的构建、测试、路径和进程清理。
5. LoopX typed result、Receipt、Effect readback 和恢复合同没有取得任务正本或授权所有权。
6. 第三方源码归属、许可证和 NOTICE 与实际采用内容一致。
7. 外部 Issue、角色卡和模型响应保持为不可信引用数据，并通过 Prompt Injection 与越权失败测试。

DeepSeek Harness 的包安装、Profile Bundle 加载和 Cordis 运行时卸载是三种不同生命周期：安装一个
没有 `dsh.bundle` 声明的普通包可能只产生警告并保留依赖；把没有有效 Bundle 的包显式列入
Profile 加载项时必须 fail loud；Cordis 卸载只撤销运行时 Effect。实现测试必须分别覆盖三者，
不能用“npm 包已删除”证明 Tool、Listener 已卸载，也不能因卸载插件而删除 Hufu 持久事实。

无法完成任一必需验证时，兼容性状态必须报告为 `PARTIAL` 或 `UNAVAILABLE`，不得根据版本号相近
推断兼容。

## Host 与会商 Runtime 能力观察

下表只记录 2026-08-15 从公开接口核对到的候选接入面，不表示 Hufu 已经支持、安装或启用这些 Host。
每个 Runtime Module 仍需固定版本并验证 fresh Session、resume/send、结构化输出、取消、工具与沙箱策略、
Usage、模型身份和授权读回；未验证字段必须报告 `UNKNOWN` 或 `UNAVAILABLE`。

| Host | 已观察的候选接入面 | 已知限制 | Hufu 状态 |
| --- | --- | --- | --- |
| DeepSeek Harness | Cordis Plugin、Session Service、StorageDomain；Headless Profile 可执行一次 fresh task | Headless 只返回最终文本且没有 follow-up；外部插件不能假设任意自定义 SessionEvent | Adapter 未实现，`UNAVAILABLE` |
| Codex | App Server 的 thread/turn 生命周期；非交互执行、resume、JSONL、JSON Schema 和 Usage 事件 | 具体权限、模型身份和取消语义仍需版本化合同测试 | Adapter 未实现，`UNAVAILABLE` |
| Claude Code | 非交互与 resume/continue；stream-json、JSON Schema、工具 allow/deny 和 Usage | 非交互模式的工作区信任与权限策略必须显式收窄 | Adapter 未实现，`UNAVAILABLE` |
| Kimi Code | ACP 的 new/load/resume/prompt/cancel；stream-json、MCP 和权限规则 | 稳定的 Schema 约束与机器可读 Token 字段尚未确认；裸 `-p` 不适合作为默认只读会商路径 | Adapter 未实现，`UNAVAILABLE` |
| Grok Build | Headless、ACP、resume/continue、JSON Schema、sandbox 和权限规则 | 稳定的机器可读 Token 字段尚未确认；扩展面仍需固定版本 | Adapter 未实现，`UNAVAILABLE` |

角色目录同样按 Host 探测。角色卡存在于磁盘不等于能够在当前 Runtime 调度，Hufu 不承诺固定角色数量。
至少两个 Runtime 通过探测但模型独立性未知时只能声明“多 Runtime 复核”；只有模型身份和独立性均通过
版本化合同验证时才能声明“已验证多模型复核”。

## 上游参与方式

DeepSeek Harness 当前不接受外部 Pull Request，官方建议通过 GitHub Discussions 和带有
`dsh-plugin` topic 的独立插件参与生态。Hufu 先通过独立插件形成可复现问题和通用修复证据；
只有未来官方政策开放后，才提交与 Hufu 产品治理解耦的上游代码。

公开来源：

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness 架构（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [DeepSeek Harness 贡献说明（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/CONTRIBUTING.md)
- [Codex 非交互模式](https://developers.openai.com/codex/noninteractive)
- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Claude Code 程序化调用](https://code.claude.com/docs/en/headless)
- [Kimi Code 命令](https://moonshotai.github.io/kimi-code/en/reference/kimi-command)
- [Kimi Code ACP](https://moonshotai.github.io/kimi-code/en/reference/kimi-acp.html)
- [Grok Build Headless 与 ACP](https://docs.x.ai/build/cli/headless-scripting)
- [LoopX 已接受机制核对基线](https://github.com/huangruiteng/loopx/tree/58f545aee1ce00c57b7a4f21b13d78ee0367b3da)
- [LoopX 2026-08-15 漂移观测](https://github.com/huangruiteng/loopx/commit/38719201df6264a7d1940d32e853c3672aed9249)
