# Hufu（虎符）

Hufu 是一个 Cordis-first、供应商中立的 AI Agent 工作协调插件系统，不会创建第二套事实正本。
“虎符”这个名字来自中国古代用于证明命令确实获得授权的信物。

项目从一项刻意收窄的能力起步：验证持久任务信封，把目标、项目、授权范围、终止条件和来源绑定在一起。
外部任务系统仍然是其自身任务状态的权威来源。

## 为什么需要 Hufu

Agent 工作经常分散在 Issue 跟踪器、聊天会话、命令输出和交接记录中，导致四个基本问题难以回答：

- 精确目标是什么？
- Agent 被允许修改什么？
- 哪些证据能够证明结果？
- 运行失败后应该从哪里恢复？

Hufu 通过稳定合同和适配器回答这些问题，同时避免要求用户手工维护一套平行工作流。

## 当前范围

版本 `0.0.1` 提供：

- 最小 `TaskEnvelope` 合同；
- `native` 和 `external` 两类任务来源；
- 显式授权范围和终止条件；
- 零运行时依赖的验证命令；
- 不包含 scheduler、数据库、网络调用或外部副作用。

当前版本**尚未**提供 Web Console、持久 Run 引擎、Issue 跟踪器适配器、Agent Runner、
Receipt 存储或自动恢复。

`0.1.0` 正在进行中文产品与架构正本收敛。目标架构采用 Node.js、严格 TypeScript、ESM、pnpm
和 Cordis-first 插件合同：DeepSeek Harness 是原生 Profile；Standalone Profile 先让 Codex、Claude、
Kimi、Grok Build 等 Host 通过 Skill、Command 或 CLI 调用同一组 Hufu 服务，未来经独立授权的
RuntimeProvider 才能创建或继续 Host Session；LoopX 是可选 EngineProvider 和机制来源。
该范围尚未通过设计 Pull Request 接受，也不表示已经实现。

同一候选版本还把“零拷贝决策传递”纳入共享核心合同：一项裁决只保存一份初始
`DECISION_PACKET`，PM/集成负责人只附加 `EXECUTION_ENVELOPE`，执行 Leader 以非审批性的
`ROUTE_ACK` 确认路线；换届和后续执行只传引用与 Delta。实现活动增长却没有可确认 durable Effect，
或进入 `non_goals` 时，系统在下一次既有交互边界要求 semantic rebase。该能力尚未实现，
也不会复制 Issue 正文、自动扩权或引入后台监控。

未来的“关键决策会商”将把专家视角与模型运行器作为两条正交轴：参谋会侧重多角色独立研究，
专家研讨会再增加跨 Runtime 复核；只有模型身份与独立性都通过验证时，结果才标记为多模型交叉验证。
会商只在一次有界授权内生成证据、分歧、反例和建议，不以多数票代替事实，不产生执行授权，
也不修改任务正本；它不属于 `0.1.0` 实现范围。

## 当前基线快速开始

以下命令只对应已经实现的 `0.0.1` Python 合同基线，不代表 `0.1.0` 目标技术栈已经完成。
要求：Python 3.11 或更高版本。运行时依赖：无。

```powershell
$env:PYTHONPATH = "$PWD\src"
py -3 -m hufu validate examples/task.json
py -3 -m unittest discover -s tests -v
py -3 scripts/check_version.py
```

在 POSIX shell 中：

```bash
PYTHONPATH=src python3 -m hufu validate examples/task.json
python3 -m unittest discover -s tests -v
python3 scripts/check_version.py
```

验证成功时会输出紧凑的 JSON 摘要。输入无效时退出码为 `2`，合同错误写入 stderr。

## 设计规则

1. 一项事实只有一个权威所有者。
2. 适配器投影外部状态，不静默取代外部系统。
3. 授权是执行的输入，不能从 Journal 或 Receipt 推导。
4. 恢复路径在重试外部 Effect 前先读取目标状态。
5. 可选 Policy Pack 可以增加项目规则，但不能把项目特定行为硬编码进核心。
6. 新基础设施必须通过减少操作时间或执行风险来证明其成本合理。
7. Hufu 自身的代码与研发进度唯一使用 GitHub；产品运行时的每个 Project 则选择
   `github`、`gitlab` 或 `local` 之一作为任务正本。
8. 可替换能力使用 Cordis Service Definition、Provider、Consumer、Event 和可撤销 Effect；
   不通过修改 Host Agent Loop 实现产品行为。
9. DeepSeek Profile 与 Standalone Profile 复用同一领域合同；Host、Engine、Runtime 和 Renderer
   均不能改变任务正本或授权语义。
10. 临时专家席位和多模型意见只形成带来源的建议；人类 `commander` 仍是最终裁决与授权来源。
11. 一个 decision stream 只完整保存一次初始裁决；Envelope、ACK、Handoff 和 Renderer 只传稳定引用、
    digest 或 Delta。“零拷贝”是语义正本约束，不是字节层承诺。
12. 实现活动不能代替 durable Effect；缺少 readback 时报告 `unavailable` 或 `data_insufficient`，
    不把未观测到的效果写成 `0`。

参见[产品规范](docs/SPEC.md)、[架构说明](docs/ARCHITECTURE.md)、
[架构决策](docs/adr/)、[上游兼容性基线](docs/COMPATIBILITY.md)和[历史计划指针](tasks/plan.md)。

## 项目状态

当前开发版本是尚未发布的 `0.1.0`；最近的历史发布基线是 `0.0.1`。
这是一个早期、合同优先的构建。公共 API 在 `1.0.0` 前可能发生变化。
当前仓库尚未实现 Cordis、DeepSeek Harness Plugin、Standalone Profile、LoopX Engine、关键决策会商、
零拷贝决策传递或远端 Provider，默认不启用任何远端集成。

## 参与贡献与安全

提交变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 报告。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
