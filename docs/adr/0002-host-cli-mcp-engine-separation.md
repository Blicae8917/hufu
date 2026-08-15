# ADR 0002：分离 Host 集成、CLI、MCP 与执行引擎

- 状态：已由 ADR 0003 取代；保留为历史候选记录
- 日期：2026-08-15
- 决策所有者：Hufu 维护者

> 取代说明：ADR 0003 保留“共享合同、上下文有界、Host 不拥有任务正本”的约束，
> 但取代本文的 CLI-first 路径、Plugin 延后定位和 LoopX 只读兼容定位。

## 背景

Hufu 需要在 Codex、Claude、Kimi 和未来其他 Agent Host 中使用，同时控制上下文、时间和 Token 成本。
如果每个 Host 各自实现任务读取、角色判断和 CurrentView，系统会产生多套行为；如果直接把 MCP、Plugin
或执行引擎视为任务正本，又会破坏 ADR 0001 确立的所有权分离。

第一版还需要借鉴 LoopX 等公开项目的有效执行机制，但不能引入其 Registry、Scheduler、Quota 等控制面，
也不能为了接入多个 Agent 而自动启动 Agent 或建立常驻服务。

## 决策

### Host 与 Skill

Agent Host 负责承载 Session、暴露其原生工具和报告可取得的身份或用量。Host 中的 Hufu Skill
只负责识别意图、选择有界操作和解释结构化结果，不拥有业务状态，也不从提示词产生授权。

提示词中指定“担任参谋”或其他角色只是 RoleBinding 申请。Application Service 必须根据 AgentIdentity、
SessionBinding、现有目标和人类授权验证当值角色。

### CLI

CLI 是 `0.1.0` 的默认操作者和 Host 集成接口。Codex 等 Host 默认通过 Skill 调用 CLI；人工也可以运行
同一命令。CLI 负责输入校验、退出码和结构化结果，不拥有独立 CurrentView。

### MCP

MCP 是未来可选的跨 Host Adapter，不是第一条实现路径。若后续引入，它必须调用与 CLI 相同的
Application Service 和供应商中立合同，不得解析 CLI 的人类可读文本，不得复制 Provider 映射，
也不得维护任务、角色或 Session 生命周期。

MCP 工具必须保持有界并按需返回信息，避免把完整 Ledger、Issue 历史或研究材料注入每轮上下文。
是否实现 MCP 由独立 Module Issue、效能基线和 Constitution Check 决定。

### Runner 与 Engine

RunnerAdapter 负责未来经授权的 Agent 启动、观测和停止；EngineAdapter 负责未来可能的持久步骤、
恢复或调度。二者都不属于 `task_authority`，也不从 Receipt、Journal 或历史运行推导授权。

`0.1.0` 可以生成可复制的下一步指令和读取兼容执行事实，但不自动启动 Agent，不实现 Engine 控制面。
任何 Runner 或 Engine 能力都需要新的已接受 ADR 或对本决策的显式修订。

### 应用服务与效能事实

CLI、未来 MCP 和 Web Renderer 必须复用同一 Application Service 与 CurrentView。Hufu 只记录自己观测到的
墙钟和调用事实；Token 只有在 Host 或 Provider 原生报告时才标记为 `measured`，否则明确标记为
`estimated` 或 `unavailable`。

新增 Host 接口或执行基础设施必须先证明不会降低授权、安全、结果质量和 Evidence 完整性，
并通过代表性试点证明能够减少操作者时间、零效果尝试、协调唤醒或新鲜 Token。

## 后果

### 正面影响

- Codex 可以使用低上下文的 Skill → CLI 路径，不需要常驻 MCP。
- Claude、Kimi 和未来 Host 可以复用同一应用合同，不复制业务逻辑。
- CLI、MCP 和 Web 输出能够由同一 CurrentView 重建。
- Host 身份、角色绑定和任务授权保持为不同概念。
- Runner 或 Engine 可以未来演进，而不改变任务正本枚举。

### 成本与约束

- Application Service 必须提供稳定的机器可读结果，不能只生成面向人的 CLI 文本。
- Host 无法报告 Token 时，Hufu 只能诚实显示 `unavailable`。
- 多 Host 兼容性需要逐个 Adapter 验证，不能仅凭命令格式相同宣称支持。
- MCP、Runner、Engine 和 Web 都必须分别通过范围及效能门禁。

## 考虑过的替代方案

### 为每个 Host 编写独立业务 Plugin

拒绝。该方案会复制角色、Provider 和 CurrentView 逻辑，形成多套难以一致验证的行为。

### MCP 优先并暴露完整内部模型

第一版拒绝。它会在尚未证明 CLI 纵切价值前增加协议、工具发现和上下文成本，且容易暴露过量 Ledger 数据。

### 永远只提供 CLI

暂不决定。CLI 足以验证第一条纵切，但未来 Host 若需要结构化调用和资源发现，可以在效能证据支持下增加 MCP。

### 把 LoopX 或其他执行引擎直接作为 Hufu 控制面

拒绝。可以采用窄合同和公开安全的实现片段，但不能导入外部 Registry、Goal/Todo、Scheduler、Heartbeat、
Quota 或任务所有权。复制或改编源码时必须遵守其许可证、保留来源并更新 NOTICE。

## 后续约束

- 第一条实现纵切必须从 Skill 可调用的 CLI 和共享 Application Service 开始。
- MCP、RunnerAdapter、EngineAdapter 或自动 Agent 启动必须由后续独立 Module Issue 授权。
- 任何 Host 集成都必须通过公开安全、上下文有界、确定性输出和 UsageObservation 检查。
- 连续三轮代表性试点没有可解释净收益时，暂停扩充 Host 或执行基础设施。
