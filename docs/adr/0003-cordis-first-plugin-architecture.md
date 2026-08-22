# ADR 0003：采用 Cordis-first 插件架构与双 Profile

- 状态：候选，待 `0.1.0` 设计 Pull Request 接受
- 日期：2026-08-15
- 决策所有者：Hufu 维护者
- 取代：ADR 0002

## 背景

Hufu 需要在 DeepSeek Harness、Codex、Claude、Kimi、Grok Build 等不同 Agent Host 中工作，
同时保持一套项目正本、角色、Session 绑定、Evidence 和 CurrentView 合同。若继续以 CLI 作为
首要集成边界，再为每个 Host 增加桥接层，会复制生命周期和上下文转换；若直接修改某个 Host
的 Agent Loop，又会把 Hufu 锁定在单一运行时。

DeepSeek Harness 使用 Cordis 组织插件树：插件向共享 Context 贡献 Service、类型化 Event 和可撤销
Effect，Profile 与 Bundle 决定组合方式。该模型与 Hufu 需要的 Provider、Runtime、Engine 和 Renderer
正交边界一致。DeepSeek Harness 仍处于 Developer Preview，公开兼容性可能变化，因此 Hufu 还需要
独立的兼容性边界和 Standalone 运行路径。

LoopX 已提供长期目标、typed result、Receipt、Effect readback、阶段 Journal、恢复与调度等机制，
并提供 DeepSeek Harness 连接器。ADR 0006 已把 Hufu 定为 LoopX 下游的严格项目协调 Provider：
可以沿 Hufu Service 记录已批准的机制，但不能让 LoopX 的 Registry、Goal/Todo 或 Scheduler
成为 Hufu 的任务正本和授权来源，也不得再把完整控制面写成可分阶段搬入的已接受方向。

## 决策

### Cordis-first

Hufu 的目标架构使用 Cordis-first 插件模型。每项可替换能力必须明确为：

1. **Service Definition**：供应商中立的能力、类型和不变量；
2. **Provider**：该能力的具体实现；
3. **Consumer**：调用服务的工具、命令、Renderer 或其他插件。

插件通过 Context Injection 声明依赖，通过类型化 Event 交换事实，通过可撤销 Effect 注册工具、监听器
或资源。Hufu 不通过修改 DeepSeek Harness 的 Agent Loop 实现产品行为，也不建立不可替换的 Host 特权层。

“Cordis-first”不表示所有同名实现可以直接互换。`0.1.0` 当前核对的是 DeepSeek Harness 使用的
`@deepseek-ai/cordis`，不是对其他 Cordis 实现的兼容承诺；精确身份、版本和上游提交记录在
`docs/COMPATIBILITY.md`。替换实现必须更新兼容性记录并重新运行 Service、Event、Effect 和生命周期合同测试。
Hufu Service 使用 `ctx.hufu*` 命名空间，领域事件使用 `hufu/*` 命名空间。

### Cordis 实现身份

`@deepseek-ai/cordis` 是 DeepSeek Harness vendored、改名发布的 fork（源自上游 `cordis`
`4.0.0-rc.7`），与上游 `cordiverse/cordis` 不是同一可互换实现。为避免“供应商中立层依赖被对冲
对象的私有 fork”与“长期维护双运行时”两种代价，本 ADR 决定：

1. **`0.1.0` 的领域核心与 Standalone Profile 不组装任何 Cordis 运行时。**核心是零框架依赖的
   严格 TypeScript 服务，Service Definition 由纯语言接口表达；Standalone Profile 是同一核心上的
   CLI 组装。
2. **Cordis 运行时随 DeepSeek Profile Module 引入**，选定 `@deepseek-ai/cordis` 并在
   `docs/COMPATIBILITY.md` 记为“当前唯一已验证的 Cordis 实现”。Hufu 不声称兼容上游 `cordis`；
   fork 与上游的差异作为显式技术债跟踪。
3. **契约测试必须声明其运行的 Cordis 实现。**未来若声明支持第二实现，必须存在对应的第二套
   合同测试，不得凭版本号相近推断兼容。

供应商中立的 `DecisionTransferService` 作为共享 Service Definition，负责校验 decision ref/digest、
追加 Packet、Envelope、ACK 与三类 Delta，并投影 semantic rebase 护栏。Storage Provider 只保存
append-only 记录；Runtime、Engine、Tool、CLI、MCP 和 Web 都是 Consumer，不得改写 Packet 正文、
授权引用或任务生命周期。

目标实现采用 Node.js、严格 TypeScript、ESM 和 pnpm，并与已验证的 DeepSeek Harness/Cordis 兼容基线
保持一致。精确依赖版本、Node 范围和验证过的上游提交属于功能 Plan 和兼容性记录，不写入 Constitution。

### 双 Profile

Hufu 提供两种组合方式，复用同一领域合同：

- **DeepSeek Profile**：作为 DeepSeek Harness 原生插件树的一部分，直接消费其公开 Service、Event、
  Session 和 Storage 能力；
- **Standalone Profile**：`0.1.0` 以零 Cordis 依赖的纯 TypeScript 服务核心加 CLI 组装同一组
  Service，让 Codex、Claude、Kimi、Grok Build 等 Host 通过 Skill、Command 或 CLI 入站调用。
  对每一个非 DeepSeek Host，入站方向是一等公民和长期形态，不是过渡设计。创建、继续或投递
  Host Session 的出站 RuntimeProvider 在 ADR 0006 之后不是已接受方向，不得因本段文字自行实现。

DeepSeek Harness 是原生 Host Profile，不是 `task_authority`。CLI、MCP、Web 和模型可调用 Tool
都是 Consumer；它们不得复制领域服务、解析另一 Consumer 的展示文本或拥有独立 CurrentView。
Skill 和 Host Command 也只是 Consumer。CLI 作为人工或入站 Consumer 时不等同于 RuntimeProvider；
只有通过能力探测、结构化输出、取消、权限和 Usage 合同验证的 Adapter 才能承担出站 Runtime。

### 项目状态与 Session 状态

跨 Session 的 Project、WorkItem、RoleBinding、SessionBinding、Decision stream、Handoff 和本地 Ledger 状态必须进入
Hufu StorageDomain 或等价持久边界。DeepSeek Harness Session Log 只承载当前 Session 可重建的
使用受支持 SessionEvent 词汇表达的 Hufu 执行投影，不能承载 Hufu DomainEvent，
也不能单独成为项目 Goal 或外部 Issue 的正本。

`0.1.0` 在 Standalone Profile 中继续使用 append-only JSONL；DeepSeek Profile 可以在公开
StorageDomain 合同后使用其 JSON Storage Provider，但 Hufu 仍以 append-only 事件语义拥有自身记录。
两种 Profile 对同一版本化夹具必须折叠得到规范化结构相等的 CurrentView；Host 无法观测的字段明确为
`unavailable`。合同测试比较结构和字段语义，不要求不同序列化实现生成逐字节相同的输出。
决策夹具还必须得到相同的 decision ref/content digest、ACK 适用性、Effect cursor 和执行护栏；
Host 临时缓存不是新的 canonical persistence。

Hufu DomainEvent、Cordis Event 和 DeepSeek Harness SessionEvent 是不同合同。领域事实进入 Hufu
StorageDomain 或 Ledger；Cordis Event 是插件树内的瞬时通知；DeepSeek Harness Session Log 只使用
目标版本公开支持的事件词汇。外部插件在 `0.1.0` 不得假设可以注册任意自定义 SessionEvent。

卸载插件会撤销其 Tool、Listener、资源和其他运行时 Effect，但不删除已经持久化的领域事实。
取消、撤回或取代必须追加新事件，不能把“可撤销 Effect”解释成历史删除。

### Runtime、Engine 与 LoopX

EngineProvider 负责目标推进、步骤选择、恢复和可选调度，不属于 `task_authority`。
已交付的 `loopx-mechanisms`（#9）是须显式选用的机制记录口，可以记下 typed result 与 Receipt，
不是任务正本，也不引入 LoopX 发行包。

ADR 0006 之后，Hufu 不再把 LoopX 定位为「可分阶段搬入完整控制面的可选 Engine」。
Hufu 是 LoopX 下游的严格项目协调 Provider。Goal、Todo、Quota、Scheduler、Heartbeat
和 Host 执行循环属于 LoopX；Hufu 不重复实现它们。Hufu↔LoopX 的 Authority / Decision /
Evidence 桥必须另立 Module Issue，本 ADR 不授权实现。

采用任何 LoopX 机制或源码仍必须满足：

- 通过 Hufu Service Definition 接入，不让 LoopX Registry/Goal/Todo 成为第二任务正本；
- 每次采用都有独立 Module Issue、边界测试、效能假设和可逆关闭路径；
- 复制或改编源码时遵守该提交的许可证，保留来源和版权说明并更新 NOTICE；
- `0.1.0` 不因插件架构而增加后台 Scheduler、Heartbeat、Quota 或自动 Agent 启动。

出站 RuntimeProvider 在 ADR 0006 之后不是已接受方向。若未来另立 Issue 授权，
其有效权限仍是 `commander` 明示授权、Hufu `authorization_scope`、RoleBinding
资源范围、Host 能力和操作系统、沙箱、审批策略的交集。Hufu 不代替 CLI 登录或扩大 Host 权限。

LoopX 现有 DeepSeek Harness Python Adapter 可以作为协议样本、迁移对照和测试 Oracle；
DeepSeek Profile 的最终路径应优先使用 Cordis 原生 Service/Event，而不是永久保留 Python SDK 桥。

### 技术栈约束

以下约束由本 ADR 固定，第一张实现 Module 的 Plan 不得放宽：

1. 领域核心使用严格 TypeScript 与 ESM，零 Cordis 依赖；
2. Standalone Profile 是同一核心上的 CLI 组装；
3. DeepSeek Profile 由后续 Module 引入 `@deepseek-ai/cordis`，其契约测试必须声明运行于该实现；
4. 本地正本使用 append-only JSONL，不引入数据库、消息队列或 Daemon；
5. 不整包照搬 DeepSeek Harness Monorepo 的 pnpm、Vitest、Oxlint、tsdown 基础设施；
   第一张实现 Module 只选择完成最小骨架所需的工具与门禁；
6. 迁移 Module 合并前，不得把本项目描述为 TypeScript 项目。

LoopX 在 `0.1.0` 只作为机制目录（typed result、Receipt、readback、no-progress backoff 等）：
不作为 npm 依赖引入，也不把其 Goal、Todo 或 Registry 映射为 Hufu 正本。

### 兼容性与生态贡献

Hufu 每个发布系列必须记录验证过的 DeepSeek Harness、Cordis、Node 和插件 API 基线，并用契约测试验证
Service、Event、Storage、Session 和卸载清理行为。上游发生破坏性变化时，Hufu 必须显式报告不兼容，
不得静默降级或宣称支持。

当前 DeepSeek Harness 官方贡献政策不接受外部 Pull Request，鼓励通过 Discussion 和带有
`dsh-plugin` topic 的生态插件参与。Hufu 先以独立插件验证真实缺口；如果未来上游政策开放，只把
可复用的 Cordis/Session/Storage/Windows 或插件扩展点修复贡献上游，Hufu 的项目治理逻辑继续留在本仓库。

## 后果

### 正面影响

- Hufu 与 DeepSeek Harness 使用相同的插件、Service、Event、Effect、Profile 和 Bundle 技术语言。
- DeepSeek 集成不需要解析 CLI 或复制业务逻辑，Standalone Profile 仍可供其他 Host 入站调用。
- Runtime、Engine、Provider 和 Renderer 可以独立替换，不改变任务正本。
- Hufu 作为 LoopX 下游 Provider 接入已批准机制，而不会把完整控制面搬进本仓库。
- Hufu 的真实使用可以形成 DeepSeek Harness 生态插件和未来上游贡献证据。

### 成本与约束

- 当前 Python 3.11 CLI 只是 `0.0.1` 已实现基线；迁移到 Node/TypeScript/Cordis 必须由独立
  Module Issue 完成，本文不构成实现完成声明。
- DeepSeek Harness 处于 Developer Preview，Hufu 必须承担兼容性矩阵和升级验证成本。
- 双 Profile 只能共享合同和测试，不能通过复制两套状态模型获得兼容性。
- Cordis 插件化不等于自动化授权；Runner 或 Engine 仍受 commander、RoleBinding 和 WorkItem 范围约束。

## 考虑过的替代方案

### 继续以 Skill 调用 Python CLI 作为所有 Host 的主路径

部分拒绝，且需要精确表述被拒绝的对象。被拒绝的是：以 Python CLI 的人类可读文本作为唯一合同、
让每个 Host 各自包装一套业务逻辑，以及让 DeepSeek Harness 原生集成多一层协议转换。**入站方向
本身（Host 通过 Skill、Command 或 CLI 调用共享 Hufu Service）不被拒绝**——对非 DeepSeek Host
它是一等公民和长期形态；被替换的只是“文本包装当合同”的实现方式。

### 只做 DeepSeek Harness 插件，不提供 Standalone Profile

拒绝。Hufu 仍需支持 Codex、Claude、Kimi、Grok Build 等 Host，也需要在 DeepSeek Harness 快速变化时保持
供应商中立的合同和测试入口。

### Fork 或修改 DeepSeek Harness Agent Loop

拒绝。DeepSeek Harness 已提供插件和 Service 扩展点，修改 Agent Loop 会扩大维护面并阻断生态兼容。

### 一次性搬入完整 LoopX 控制面

拒绝，并由 ADR 0006 废止为产品方向。不得以「分阶段评估 EngineProvider」为名把 Goal、Todo、
Scheduler、Heartbeat 或完整 Web 控制面搬入 Hufu。

## 公开参考

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness 架构（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [DeepSeek Harness 贡献说明（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/CONTRIBUTING.md)
- [LoopX 已接受机制核对基线](https://github.com/huangruiteng/loopx/tree/58f545aee1ce00c57b7a4f21b13d78ee0367b3da)
- [Hufu 上游兼容性与同步基线](../COMPATIBILITY.md)

## 后续约束

- 第一张实现 Module Issue 必须只建立零 Cordis 依赖的 TypeScript 核心骨架、共享合同和 CLI 入口，
  并在同一 Module 内完成 Python 基线退役：以 tag 保留 `0.0.1` 历史、从主线删除 Python 实现、
  替换等价 TypeScript 门禁，并同步更新 AGENTS 自动化规则与 README 快速开始。
- 在该 Module 合并前，不删除当前 Python 实现，不把目标技术栈写成已实现能力。
- 每个 RuntimeProvider、EngineProvider、Provider 或 Renderer 都需要独立的契约、失败测试和成本边界。
- 任何自动 Agent 启动、后台调度或外部写回仍需要独立 ADR、Module Issue 和人类授权。
