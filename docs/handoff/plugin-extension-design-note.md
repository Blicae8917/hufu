# 设计通盘考虑说明（供对侧设计评审）

- 状态：设计沟通稿，非正式合同
- 日期：2026-08-15
- 用途：随候选 ADR 0003（Cordis-first 插件架构）一起交对侧设计负责人通盘考虑

## 核心一段话

Hufu 项目的目标架构已确定为 Cordis-first 插件化方向（候选 ADR 0003，待 0.1.0 设计 PR 接受）：不变量与
核心合同保持稳定，所有可扩展机制一律预留为插件——纠偏学习、知识图谱、上游版本看门狗、MCP/Web/CLI 渲染、
LoopX 引擎、多 Host 接入等未来能力，均以"消费核心合同、通过类型化事件编排、可随插件卸载而撤销"的方式接入，
不进入核心、不绕过授权；原则是"机制皆插件、不变量不插件，现在预留插座，未来才插能力"。当前设计阶段不实现
这些能力，只把插座一次预留到位：核心合同（SSUV）、事件类型注册、schema 版本化与事实分类。详细背景与
预留清单见本文档下文（配套正本：`docs/adr/0003-cordis-first-plugin-architecture.md`、`docs/SPEC.md`、
`docs/ARCHITECTURE.md`、`docs/COMPATIBILITY.md`）。现请您从对侧系统的视角通盘审阅：这些预留是否完备、
是否与对侧现有机制（Session/权限/上下文成本、RoleBinding 与 authorization_scope 的映射、用户纠偏的捕获
与回传）冲突、是否需要修订对侧原有接口承诺。治理上，每一项未来能力仍须独立 Module Issue、Spec Kit 合同、
失败测试与效能试点门禁，连续三轮无净收益即暂停。

## 需通盘考虑的预留清单

| # | 未来能力 | 预留的插座 | 边界约束 |
| --- | --- | --- | --- |
| 1 | 纠偏学习（advisor-memory） | `CorrectionObservation` 事件 + Ledger 追加 | 只优化建议（next_action/ETA/阻塞），不产生或扩大授权 |
| 2 | 知识图谱（图工程） | 图谱作为 Ledger 之上的派生视图 | 必须能从 Ledger 确定性重建；推断显式标注，不做第二套正本 |
| 3 | 上游版本看门狗 | `drift.detected` 事件 | 只读检测、只提醒，不自动升级 |
| 4 | MCP / Web / CLI Renderer | CurrentView 单一合同 | 不解析另一 Consumer 的展示文本，不拥有独立状态 |
| 5 | LoopX Engine（可选） | EnginePlugin 服务定义 | 不成为 task_authority，不引入后台调度 |
| 6 | 多 Host 接入（RuntimePlugin） | Standalone Profile + 共享测试夹具 | 与 DeepSeek Profile 语义一致 |

## 请对侧重点评估的问题

1. 对侧 Host 在 Standalone Profile 内的 Session、权限与上下文成本，相比原"Skill → CLI"路径是改善还是退化。
2. Hufu 的 RoleBinding / authorization_scope 与对侧现有权限体系如何映射，才不产生第二套授权。
3. 用户纠偏在对侧 Host 中如何被捕获、记录并回传为 `CorrectionObservation`（事件来源与触发时机）。
4. 上述预留是否影响对侧原有接口承诺，需要哪些相应修订；对侧系统与这些"插座"是否存在命名或语义冲突。

## 治理前提

以上每一项未来能力都只是预留方向，不构成已接受工作。实际实现必须各自经过独立 Module Issue、
Spec Kit 合同、失败测试和效能试点门禁（连续三轮无净收益即暂停），并由人类维护者裁决是否进入版本。
