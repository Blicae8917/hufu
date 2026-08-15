# 设计评审说明（0.1.0 候选设计正本 · 供对侧综合评估）

> **裁决状态（2026-08-15 设计收口）**：本文件已完成逐条裁决，采纳结论已落入正本，
> 本文件自此仅为历史记录，不得再被引用为依据。
>
> - Q1 → 已裁决：`0.1.0` 核心与 Standalone 零 Cordis；DeepSeek Profile 引入
>   `@deepseek-ai/cordis`（ADR 0003「Cordis 实现身份」）。
> - Q2 → 已裁决：单操作者/单安装边界，角色唯一性为回放检测（SPEC、ARCHITECTURE）。
> - Q3 → 已裁决：读时 upcast + fail closed；`0.0.1` 迁移仅为信封 Schema 映射（SPEC）。
> - Q4 → 已裁决：接受不对称；入站可观测性矩阵入 COMPATIBILITY。
> - S1 → 采纳：版本化夹具 + 规范化结构相等（ADR 0003、ARCHITECTURE 原正本已含）。
> - S2 → 采纳：外部文本为不可信引用数据（正本已含）；注入契约测试入后续 Module 验收。
> - S3 → 采纳：Ledger 工程语义收口段（ARCHITECTURE）。
> - S4 → 采纳：`external_ref` URI scheme（SPEC）。
> - S5 → 采纳：Projection 刷新策略（SPEC）。
> - S6 → 采纳：LoopX 机制目录定位与词汇映射（ADR 0003、ARCHITECTURE）。
> - S7 → 采纳：迁移措辞修正（SPEC）与 Host 分级观察（COMPATIBILITY）。

- 状态：设计评审沟通稿，非正式合同
- 日期：2026-08-15
- 用途：配合候选 ADR 0003 与 `0.1.0` 设计正本收敛，供对侧设计负责人综合评估。本文全部内容
  均为评审意见，不构成已接受工作；任何采纳项仍须按 Constitution VII 走独立 Module Issue、
  Spec Kit 合同、失败测试与效能门禁。
- 评审范围：`.specify/memory/constitution.md`、`README.md`、`docs/SPEC.md`、
  `docs/ARCHITECTURE.md`、ADR 0001–0003、`docs/COMPATIBILITY.md`、
  `docs/handoff/plugin-extension-design-note.md`、`0.0.1` 实现与测试。

## 一、总体判断

候选设计正本纪律性强、对外部事实核对诚实。三轴分离（任务正本 / 执行事实 / 呈现）与
"授权不可由 Journal、Receipt 或 Projection 推导"抓住了此类系统真正的失败模式，方向判断正确。
上游对齐声明经当日现场核对属实（见第二节）。前瞻性整体成立，主要改进空间集中在三点：
Cordis 依赖归属未定、双 Profile"语义一致"尚不可证伪、外部 Issue 内容的内容信任边界未进入正本。

## 二、上游对齐现场核对（2026-08-15）

以下来自当日对公开上游的重新核对，供对侧引用以免重复劳动：

- DeepSeek Harness README 与 `docs/architecture.md` 证实：everything-is-a-plugin、Cordis seam
  三角（Service Definition / Provider / Consumer）、Profile / Bundle / `cordis.patch.yml`
  分层组合、Effect 随插件卸载 unwind、append-only Session Log（"model-visible means logged"）、
  Developer Preview 破坏警告、经 GitHub Discussions 与 `dsh-plugin` topic 参与生态、不收外部 PR。
  与 ADR 0003 及 `docs/COMPATIBILITY.md` 的描述一致，未发现过时引用。
- LoopX README 证实其自我定位为 harness 之上的 provider-neutral control plane，明确宣称
  objective / gates / todos / evidence / quota / handoff 归其管理，并称
  "the board is a projection; LoopX state remains the source of truth"，且已提供
  DeepSeek Harness 连接器。这证实 S6 所述边界张力是真实存在的，不是理论风险。
- DeepSeek Harness 自带 `ctx.goals`（同 Session 目标管理）与 `ctx.jobs`（后台工作）。
  前者与 Hufu 跨 Session 的 WorkItem / objective 语义相邻（见 S6）；后者与 V1"不做后台"
  边界无冲突，但后续 Module 设计时需留意命名区分。

## 三、请对侧裁决的问题

- **Q1 Cordis 依赖归属**：`docs/COMPATIBILITY.md` 记录的 Cordis 基线是 DeepSeek Harness
  `vendor/cordis`（`@deepseek-ai/cordis` `4.0.1`）。Standalone Profile 自行组装 Cordis Context
  时，依赖的是 `@deepseek-ai/cordis`（随 dsh 发布节奏演进）、公共 Cordis 上游，还是自实现
  最小兼容层？这决定"Standalone Profile 作为 dsh 破坏性变更的对冲"在多大程度上成立——
  若 Context 机制本身跟随 dsh，对冲就只剩供应商中立合同层。三种选择均可接受，但需要在
  设计正本中显式选定并记录理由。
- **Q2 RoleBinding 唯一性的作用域**：`.hufu/` 是本机运行态且排除在版本控制之外。同一 Project
  在两台机器分别 connect 时，"每个已连接且活跃的 Project 恰有一个当值 `project_lead`"
  只是单安装不变量，跨机器不可强制（V1 明确排除多主机协调）。请裁决：此为预期内并接受，
  还是需要在 SPEC 中显式声明单操作者 / 单安装假设，避免该不变量被误读为分布式保证。
- **Q3 Ledger schema 演进策略**：Local 正本的 append-only Ledger 须永久回放。Schema 变更时
  采用 per-event 版本 + upcaster，还是只接受当前版本、fail closed？该决策影响 Q4 之外的
  所有回放语义，建议在设计期定论而非留给实现。另请确认：`0.0.1` 无任何持久态，
  "从 `0.0.1` 合同迁移"仅是信封文档的 schema 映射，不涉及存量数据迁移。
- **Q4 Standalone Profile 各 Host 可观测面**：Codex、Claude、Kimi、Grok 的可观测能力差异
  极大（部分仅有 hooks，部分无公开扩展面）。执行事实轴在某些 Host 上可能长期大量
  `unavailable`，CurrentView 在 Standalone 下将结构性偏瘦。请裁决是否接受该不对称，
  以及是否产出一张 per-host observability matrix 作为设计产物，明确每个 RuntimePlugin
  实际能观测什么（Session 起止、Tool 调用、Token、墙钟）。

## 四、设计建议（按优先级）

- **S1 使"语义一致"可证伪**。V1 成功标准中"DeepSeek Profile 与 Standalone Profile 对同一
  事件夹具生成语义一致的 CurrentView"目前缺少判定规则，无法判通过与否。建议设计期定义：
  CurrentView 为带 schema 版本的版本化合同；共享事件夹具库入仓；约定规范化形式
  （canonical JSON：键排序、空白、数字表示）后字节级比对，或定义显式等价规则
  （枚举允许 Profile 间差异的字段，如观测时间戳）。
- **S2 增补内容信任边界**。Hufu 的核心动作是生成可粘贴进 Agent Workspace 的有界指令，
  而素材包含 GitHub / GitLab Issue 投影——外部不可信输入。这是典型的 prompt injection
  通道，SPEC 与安全边界目前未覆盖。建议：Projection 与 Evidence 中的外部文本一律定义为
  不可信数据；生成指令时标注来源、结构性隔离引用、不参与授权语义；在 SPEC"使用模式与
  Host 边界"或 ARCHITECTURE"本地运行态与安全边界"增补相应条款。
- **S3 设计期定稿 Ledger 工程语义**。Local 正本的 Ledger 是 task_authority，以下各点属
  正确性问题而非实现便利：事件身份方案（ULID / 内容哈希）与 Schema Version 粒度；
  同毫秒或时钟回拨时的排序 tiebreaker（如 Ledger 内序号）以保证确定性回放；并发追加的
  单写者纪律或文件锁（CLI 与 serve 可能并发）；撕裂写入策略——建议中间畸形 fail closed、
  末尾截断（崩溃所致）可恢复，否则一次崩溃会使整个本地正本不可用。
- **S4 约定 `external_ref` URI scheme**。`0.0.1` 中该字段为自由文本（如 `"tracker:7"`）。
  不定 scheme，"原始链接"投影与 `external` → `github` / `gitlab` 迁移都无法确定性构造。
  建议形如 `github:owner/repo#123`、`gitlab:group/project#456`。
- **S5 显式化 Projection 刷新策略**。`hufu status` 是否触发网络拉取、缓存位置与 `stale`
  判定阈值、离线行为。freshness / fact_status 词汇已具备，缺一条策略；同时避免每次
  status 都产生网络往返，与"无后台服务"约束保持一致。
- **S6 细化 LoopX 采用边界**。LoopX 上游语义本身即主张成为正本（见第二节），建议把
  "不是 task_authority"写细一档：默认排除概念清单（Goal / Todo / Registry 作为权威、
  Scheduler / Quota 控制面）与仅作机制采用清单（typed result、Receipt、`effect_id` /
  readback、no-progress backoff、benchmark）分列。另：dsh 自带 `ctx.goals` 为同 Session
  目标管理，与 Hufu 跨 Session WorkItem / objective 语义相邻，第一张 Runtime Module
  需给出显式映射，呼应《设计通盘考虑说明》第 4 问的命名 / 语义冲突排查。
- **S7 SPEC 措辞小修**。`0.0.1` 无持久态，"从 `0.0.1` 合同迁移"宜写明为信封文档的 schema
  映射而非数据迁移；Grok 的公开可扩展面目前最不明确，建议 Host 支持分级标注
  （已验证 / 计划），避免 SPEC 读来如同已承诺。

## 五、前瞻性评估

已确立的前瞻性（建议保持，勿在实现期稀释）：效能门禁与"连续三轮代表性试点无可解释净收益
即暂停扩充"的自我制动；UsageObservation 的 `measured` / `estimated` / `unavailable` 诚实
分级；钉死上游 commit 并记录 drift 状态的兼容性台账；只读影子模式先行、外部写回显式推迟的
交付排序；"机制皆插件、不变量不插件"的插座预留清单与 dsh 实际扩展点一一对应；以双 Profile
对冲 Developer Preview 破坏性变更。

主要不确定性：其一，Q1——对冲层自身可能依赖被对冲对象的发布节奏；其二，DeepSeek Profile
依赖的 out-of-tree 插件安装 / 加载路径尚未验证（SPEC 已诚实标注由第一张实现 Module 的 Plan
确定），建议保持"第一骨架 Module 优先验证该假设"的顺位，在此之前不把分发方式写成承诺。

## 六、治理前提

本文与《设计通盘考虑说明》同属设计沟通稿。每条建议的采纳均须独立 Module Issue、Spec Kit
功能合同、失败测试与可审阅证据；涉及 Constitution 不变量的措辞变化，先修订 Constitution
再实现。本文不构成对任何实现工作的授权。
