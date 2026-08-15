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
并提供 DeepSeek Harness 连接器。Hufu 希望复用这些机制乃至适用源码，但不能让 LoopX 的 Registry、
Goal/Todo 或 Scheduler 自动成为 Hufu 的任务正本和授权来源。

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
- **Standalone Profile**：由 Hufu 组装 Cordis Context；`0.1.0` 先让 Codex、Claude、Kimi、
  Grok Build 等 Host 通过 Skill、Command 或 CLI 调用同一组 Service。创建、继续或投递 Host Session
  的出站 RuntimeProvider 属于后续独立能力。

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

未来的 RuntimeProvider 负责 Host Session 的创建、继续、消息投递、观测和终止能力；是否允许执行某项动作仍由
Hufu 授权合同决定。EngineProvider 负责目标推进、步骤选择、恢复和可选调度，不属于 `task_authority`。

LoopX 作为 `engine-loopx` Provider 和机制来源。Hufu 可以分阶段采用其 typed result、TurnEnvelope、
Receipt、`effect_id`/readback、阶段 Journal、validation timeout、no-progress backoff、benchmark，
以及未来证明必要的 Goal、Scheduler 或其他模块，但必须满足：

- 通过 Hufu Service Definition 接入，不让 LoopX Registry/Goal/Todo 成为第二任务正本；
- 每次采用都有独立 Module Issue、边界测试、效能假设和可逆关闭路径；
- 复制或改编源码时遵守 MIT 许可证，保留来源和版权说明并更新 NOTICE；
- `0.1.0` 不因插件架构而增加后台 Scheduler、Heartbeat、Quota 或自动 Agent 启动。

任何出站 Runtime 的有效权限都是 `commander` 明示授权、Hufu `authorization_scope`、RoleBinding
资源范围、Host 能力和操作系统、沙箱、审批策略的交集。Hufu 不代替 CLI 登录或扩大 Host 权限。

LoopX 现有 DeepSeek Harness Python Adapter 可以作为协议样本、迁移对照和测试 Oracle；
DeepSeek Profile 的最终路径应优先使用 Cordis 原生 Service/Event，而不是永久保留 Python SDK 桥。

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
- DeepSeek 集成不需要解析 CLI 或复制业务逻辑，Standalone Profile 仍可供其他 Host 入站调用，
  并为未来受治理的出站 Runtime 保留同一合同。
- Runtime、Engine、Provider 和 Renderer 可以独立替换，不改变任务正本。
- LoopX 可以逐步深入采用，而不会自动成为第二套项目控制面。
- Hufu 的真实使用可以形成 DeepSeek Harness 生态插件和未来上游贡献证据。

### 成本与约束

- 当前 Python 3.11 CLI 只是 `0.0.1` 已实现基线；迁移到 Node/TypeScript/Cordis 必须由独立
  Module Issue 完成，本文不构成实现完成声明。
- DeepSeek Harness 处于 Developer Preview，Hufu 必须承担兼容性矩阵和升级验证成本。
- 双 Profile 只能共享合同和测试，不能通过复制两套状态模型获得兼容性。
- Cordis 插件化不等于自动化授权；Runner 或 Engine 仍受 commander、RoleBinding 和 WorkItem 范围约束。

## 考虑过的替代方案

### 继续以 Skill 调用 Python CLI 作为所有 Host 的主路径

拒绝作为目标架构。它可以保留为过渡和人工 Consumer，但会让 DeepSeek Harness 原生集成多一层协议转换，
也不利于共享 Session、Storage 和插件生命周期。

### 只做 DeepSeek Harness 插件，不提供 Standalone Profile

拒绝。Hufu 仍需支持 Codex、Claude、Kimi、Grok Build 等 Host，也需要在 DeepSeek Harness 快速变化时保持
供应商中立的合同和测试入口。

### Fork 或修改 DeepSeek Harness Agent Loop

拒绝。DeepSeek Harness 已提供插件和 Service 扩展点，修改 Agent Loop 会扩大维护面并阻断生态兼容。

### 一次性搬入完整 LoopX 控制面

不在 `0.1.0` 采用。完整能力可以按 EngineProvider 分阶段评估，但必须先拆清任务正本、授权、持久化和
调度所有权，并用真实试点证明时间、质量和 Token 的净收益。

## 公开参考

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness 架构（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md)
- [DeepSeek Harness 贡献说明（已核对提交）](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/CONTRIBUTING.md)
- [LoopX 已接受机制核对基线](https://github.com/huangruiteng/loopx/tree/58f545aee1ce00c57b7a4f21b13d78ee0367b3da)
- [Hufu 上游兼容性与同步基线](../COMPATIBILITY.md)

## 后续约束

- 第一张实现 Module Issue 必须只建立 Cordis 技术基线、共享合同和两种 Profile 的最小可运行骨架。
- 在该 Module 合并前，不删除当前 Python 实现，不把目标技术栈写成已实现能力。
- 每个 RuntimeProvider、EngineProvider、Provider 或 Renderer 都需要独立的契约、失败测试和成本边界。
- 任何自动 Agent 启动、后台调度或外部写回仍需要独立 ADR、Module Issue 和人类授权。
