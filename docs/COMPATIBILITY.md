# 上游兼容性与同步基线

状态：DeepSeek 原生插件路径已实现；契约测试声明运行于 `@deepseek-ai/cordis` `4.0.1`。
LoopX 第一批机制已由 Module #9 按自有合同重写为可选引擎；完整控制面仍未采用，核对本仍为 MIT `0.4.7`。
最后核对：2026-08-22

本文件记录 Hufu 每个发布系列实际核对过的公开上游版本。它是动态兼容性记录，不是 Constitution；
版本出现于此只表示设计或测试基线，不表示 Hufu 已经实现、发布或支持对应集成。

## Hufu 0.1.0 目标基线

| 上游 | 公开仓库 | 已核对基线 | 相关版本 | 当前结论 |
| --- | --- | --- | --- | --- |
| DeepSeek Harness | `deepseek-ai/deepseek-harness` | `47f943859bef60e4160492346772ded9b24f765a` | `@deepseek-ai/dsh` `0.1.0-rc.5` | 已核对基线保持 `47f9438` / rc.5。2026-08-16「提交未变」不成立：当日 `master` 实际停在 `5bb600f`。2026-08-19 观测 HEAD 为 `99f6f02` / `dsh-v0.1.0-rc.7`（超前基线 111 commits / 24 first-parent）。2026-08-22 再核 HEAD 为 `b150a551` / `dsh-v0.1.1-rc.2`（超前基线 854 commits / 101 first-parent）。rc.7、rc.8 与 `0.1.1-rc.2` 都不是已接受实现基线。插件契约测试使用隔离 mount/dispose，不声明浮动 `master` 支持。 |
| DeepSeek 使用的 Cordis | DeepSeek Harness `vendor/cordis` | 同上 | `@deepseek-ai/cordis` `4.0.1` | 目标插件与生命周期基础；它是 DeepSeek 命名的实现，不等同于对其他 Cordis 项目的兼容承诺。 |
| LoopX | `huangruiteng/loopx` | `58f545aee1ce00c57b7a4f21b13d78ee0367b3da` | `loopx` `0.4.7` | 已完成机制级核对（MIT）。不是 Hufu 任务正本。2026-08-16 公开 `main` HEAD 为 `8c103df` / `v0.4.8`（Apache-2.0），相对核对本超前 47 个提交。2026-08-19 观测 HEAD 为 `88f96da2` / `v0.4.9`，相对核对本超前 146 个提交，相对 `v0.4.8` 超前 99 个提交。2026-08-22 再核 HEAD 为 `02cb68bb`（`pyproject` `0.5.1`），相对核对本超前 294 个提交。手工记录的 LoopX HEAD 具有当日失效性，上述观测都不是已接受实现基线。#9 第一批机制已按 Hufu 自有合同重写交付，未复制上游源码、未引入 `loopx` 发行包。定位裁决见 #26，不在本文件作出。 |

DeepSeek Harness 当前目标工具链基线为 Node.js `^22.19.0 || >=24.0.0`、pnpm `11.7.0`、
严格 TypeScript、ESM、Vitest、Oxlint 和 tsdown。Hufu 第一张实现 Module 的 Plan 必须重新核对这些值，
并只选择完成最小骨架所需的工具，不照搬上游 Monorepo 的全部基础设施。

上表「已核对基线」是源码提交，「相关版本」是已发布 npm 产物版本。上游无 tag 或 release 时，
二者之间没有可证明的绑定关系，不得互相推断身份，必须分别核对。`@deepseek-ai/cordis` 是
Hufu 当前唯一已验证的 Cordis 实现（决策见 ADR 0003「Cordis 实现身份」节）：它是上游 `cordis`
`4.0.0-rc.7` 的改名 vendored fork，Hufu 不声称兼容上游 `cordis`；`0.1.0` 的领域核心与
Standalone Profile 不组装任何 Cordis 运行时。

## 观测方法

全部提交计数必须在**完整历史**上取得（`git rev-parse --is-shallow-repository` 为 `false`）。
浅克隆的 `git rev-list --count` 会因历史截断给出错误结果。`git ls-remote` 只核验 ref 身份，不需要本地历史。

复核命令：

```
git ls-remote https://github.com/deepseek-ai/deepseek-harness
git rev-parse --is-shallow-repository    # 必须为 false 才能计数
git rev-list --count 47f943859bef60e4160492346772ded9b24f765a..origin/master
git rev-list --count --first-parent 47f943859bef60e4160492346772ded9b24f765a..origin/master
git ls-remote https://github.com/huangruiteng/loopx
git rev-list --count 58f545aee1ce00c57b7a4f21b13d78ee0367b3da..origin/main
```

## 漂移状态

- 2026-08-16 现文曾写公开 `deepseek-ai/deepseek-harness` `master`「提交未变」、仍为
  `47f943859bef60e4160492346772ded9b24f765a`。该观测为假。`master` first-parent 链在基线之后
  13 分钟即到 `fdab3aa`，17 分钟到 `fb82698`（rc.6）；2026-08-16 全天 `master` 停在
  `5bb600f9fb17c31f26089ada6c25eaf900104e71`（2026-08-15 02:49 +0800，超前基线 9 次
  first-parent / 40 个提交）。其后下一次 first-parent 合并为 `66cd593`（2026-08-17 10:05）。
- 2026-08-19 完整历史复核：当时 HEAD 为 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`
  （tag `dsh-v0.1.0-rc.7`，2026-08-17 19:03 +0800）。相对已核对基线 111 commits
  （first-parent 24 次合并），539 文件，+8183 / −1625。rc.7 不是已接受实现基线。
- 2026-08-22 再核：`git ls-remote` `refs/heads/master` =
  `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`（tag `dsh-v0.1.1-rc.2`，2026-08-21 20:03 +0800）。
  相对已核对基线 854 commits / 101 first-parent。另有 tag `dsh-v0.1.0-rc.8` =
  `141eb6fef83422698aef7a981029e843e8161534`。这些观测都不是已接受实现基线，也不把 rc.7
  或后续 rc 提升为插件目标。
- 2026-08-15 的一次 DeepSeek Harness 观测对应已核对基线提交；这是一条带日期的观测，不是“当前永远一致”的承诺。
- 2026-08-16 开始 Module #9（`engine-loopx`）前重新读取公开 `huangruiteng/loopx` `refs/heads/main`：
  HEAD 为 `8c103dfecae0f4424ecb0b07bad7cbc5f0797d6d`（tag `v0.4.8`，`pyproject` `0.4.8`），
  相对已接受机制核对本 `58f545aee1ce00c57b7a4f21b13d78ee0367b3da` 超前 47 个提交。
  主许可证已于 2026-08-15 `d13b980e9497`（`chore(license): adopt Apache-2.0 for LoopX open core`）
  从 MIT 改为 Apache-2.0；上游 NOTICE 声明 `v0.4.7` 及更早仍为 MIT，并由 `LICENSE-MIT` 保留历史文本。
  该 HEAD 观测不是已接受实现基线；#9 规格 Draft 默认不复制上游源码、不把 LoopX 发行包列为默认依赖。
  若后续 Plan 改钉提交或复制源码，必须按该提交许可证更新 NOTICE，并重新核对应采用的机制边界。
- 2026-08-19 完整历史复核 LoopX：当时 `main` HEAD 为
  `88f96da2674c2dc3d65d1b55597f17c196c00af7`（2026-08-19 16:55 +0800，当时版本 `v0.4.9`），
  相对已接受基线超前 **146 commits**，相对 2026-08-16 观测 `8c103df` 超前 99 commits。
  近日 first-parent 节奏（08-16 至 08-19）为四次 / 十八次 / 十次 / 三十三次。核对期间 `main`
  在同一天内从 `247b628`（09:49）前进到 `88f96da2`（16:55）。手工记录的 LoopX HEAD 具有当日失效性。
- 2026-08-22 再核 LoopX：`git ls-remote` `refs/heads/main` =
  `02cb68bb06fc811d41f207b62c5378249164f8c1`（2026-08-22 20:43 +0800，`pyproject` `0.5.1`），
  相对已接受基线超前 294 commits；tag `v0.4.9` 现为 `8bd1b6c426f3856a86f4a059b7cfd7215d159ef3`。
  `0.5.1` 与 `v0.4.9` 都不是已接受实现基线。
- 2026-08-15 通过 `refs/heads/main` 直接读取的 LoopX 漂移观测
  `38719201df6264a7d1940d32e853c3672aed9249` 已被后续 HEAD 观测取代，仍不是已接受基线。
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
8. DeepSeek Harness out-of-tree 插件安装契约：安装命令为
   `dsh plugin --profile <name> add <package>`；npm 包 manifest 必须声明
   `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，未声明该字段的包被显式列入 Profile
   加载项时必须 fail loud；Profile 位于 `$DSH_HOME/profiles/<name>`（Harness home 解析顺序为
   `$DSH_HOME`，否则 `~/.dsh`）；bare 包名解析依赖可选原生 peer `node-addon-require-builtin`，
   否则调用方必须使用可解析的相对或 file 说明符；用户 patch 对匹配条目是整块替换 `config`、
   不做深合并，任何覆盖都会丢弃未重述字段。DeepSeek Profile Module 必须包含一条真装真卸契约
   测试：装入 Profile 后服务可用，卸载后 Tool、Event Listener 与其他运行时 Effect 全部撤销，
   已持久化事实保留。

2026-08-19 在完整历史上复核：上述 8 条安装契约项在 `dsh-v0.1.0-rc.7`（`99f6f02`）下仍成立。
证据：`vendor/cordis/package.json` 仍为 `@deepseek-ai/cordis` `4.0.1`；
`packages/bundle/README.md` 仍要求 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；
`$DSH_HOME/profiles/<name>` 与 `$DSH_HOME` → `~/.dsh` 解析仍见 `packages/boot/app-boot/README.md`；
无 bundle 声明的包被显式列入 Profile 时 fail loud；`dsh plugin --profile <name> add <package>`
仍见 `packages/boot/app-boot/src/profile.ts`；`node-addon-require-builtin` 仍为可选 peer；
patch 对匹配条目整块替换 `config`、不深合并；安装 / Bundle 加载 / Cordis 卸载仍为三种生命周期。
该结论只覆盖 rc.7，不把后续 HEAD 或 `0.1.1-rc.2` 提升为已接受实现基线。

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
| DeepSeek Harness | Cordis Plugin、Session Service、StorageDomain；Headless Profile 可执行一次 fresh task。已核对基线 `47f9438` **即已自带** `packages/goal/`（事件溯源 goal 服务，`GoalRef {id, revision}` CAS，phase `active\|paused\|blocked\|complete`，模型工具 `get_goal` / `create_goal` / `update_goal`，`/goal` 命令）、`packages/plan/plan-mode/`、`packages/acp/`（ACP over JSON-RPC stdio）、以及 `packages/subagent/subagent-codex`、`subagent-claude-code`、`subagent-acp`、`subagent-dsh-sdk`（均以 `git cat-file -e 47f9438:<path>` 验证 EXISTED at baseline） | Headless 只返回最终文本且没有 follow-up；外部插件不能假设任意自定义 SessionEvent。目标 Host 已自带同名 provider，会抬高与 Hufu / LoopX 的重合面，不能只看 Hufu Adapter 是否实现 | `hufu-dsh` 已作为隔离 Profile Module 交付；不修改 Agent Loop，不启用 Host JSON Storage Provider，不出站 Session |
| Codex | App Server 的 thread/turn 生命周期；非交互执行、resume、JSONL、JSON Schema 和 Usage 事件 | 具体权限、模型身份和取消语义仍需版本化合同测试。DeepSeek Harness 已自带 `subagent-codex`，与「Hufu Adapter 未实现」不是同一层事实 | Adapter 未实现，`UNAVAILABLE` |
| Claude Code | 非交互与 resume/continue；stream-json、JSON Schema、工具 allow/deny 和 Usage | 非交互模式的工作区信任与权限策略必须显式收窄。DeepSeek Harness 已自带 `subagent-claude-code`，与「Hufu Adapter 未实现」不是同一层事实 | Adapter 未实现，`UNAVAILABLE` |
| Kimi Code | ACP 的 new/load/resume/prompt/cancel；stream-json、MCP 和权限规则 | 稳定的 Schema 约束与机器可读 Token 字段尚未确认；裸 `-p` 不适合作为默认只读会商路径 | Adapter 未实现，`UNAVAILABLE` |
| Grok Build | Headless、ACP、resume/continue、JSON Schema、sandbox 和权限规则 | 稳定的机器可读 Token 字段尚未确认；扩展面仍需固定版本 | Adapter 未实现，`UNAVAILABLE` |

### 入站路径可观测性矩阵（`0.1.0` 设计基线）

下表列出入站路径（Host 调用 Hufu；DeepSeek 列为原生插件路径）上 Hufu 预计可观测的执行事实。
这是设计基线：未经版本化合同测试验证的项必须报告 `UNKNOWN`；标记 `unavailable` 的字段在
CurrentView 中必须显式保持 `unavailable`，不得以 `0` 或推断值填充。

| 观测项 | DeepSeek Harness（原生） | Codex | Claude Code | Kimi Code | Grok Build |
| --- | --- | --- | --- | --- | --- |
| Session 起止 | available（原生事件） | unknown | unknown | unknown | unknown |
| 调用者身份（AgentIdentity） | available | declared（调用方自报） | declared | declared | declared |
| Tool 调用明细 | available | unavailable | unavailable | unavailable | unavailable |
| Token 用量 | available（原生报告） | unknown | unknown | unknown | unknown |
| 取消或中断信号 | available | unavailable | unavailable | unavailable | unavailable |
| 命令边界墙钟 | available | available | available | available | available |

非 DeepSeek Host 的执行事实轴在入站路径上结构性偏瘦，这是已接受的不对称；“双 Profile 语义一致”
只指同一事件输入折叠出相同 CurrentView，不表示各 Host 能力等价。

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
- [LoopX 2026-08-16 HEAD 观测（`v0.4.8`，非已接受基线）](https://github.com/huangruiteng/loopx/commit/8c103dfecae0f4424ecb0b07bad7cbc5f0797d6d)
- [LoopX 2026-08-19 HEAD 观测（当时 `v0.4.9`，非已接受基线）](https://github.com/huangruiteng/loopx/commit/88f96da2674c2dc3d65d1b55597f17c196c00af7)
- [LoopX 2026-08-22 HEAD 观测（`pyproject` `0.5.1`，非已接受基线；HEAD 具有当日失效性）](https://github.com/huangruiteng/loopx/commit/02cb68bb06fc811d41f207b62c5378249164f8c1)
- [DeepSeek Harness 2026-08-19 HEAD 观测（`dsh-v0.1.0-rc.7`，非已接受基线）](https://github.com/deepseek-ai/deepseek-harness/commit/99f6f02fecdb7dff40c3fbc9470f5907c29f74ca)
- [DeepSeek Harness 2026-08-22 HEAD 观测（`dsh-v0.1.1-rc.2`，非已接受基线）](https://github.com/deepseek-ai/deepseek-harness/commit/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e)
