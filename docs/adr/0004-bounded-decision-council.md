# ADR 0004：有界关键决策会商

- 状态：历史候选记录；ADR 0006 之后不是已接受实现方向
- 日期：2026-08-15
- 决策所有者：Hufu 维护者
- 依赖：ADR 0001、ADR 0003
- `0.1.0` 影响：只预留插件边界，不实现会商 Runtime

## 背景

项目在架构、安全、隐私、重大成本、不可逆操作、权威材料冲突或重复执行失败时，单一 Agent 的建议
可能同时受到专业视角、模型偏差和当前上下文锚定的影响。简单增加 Agent 数量或让多个模型投票，
既不能证明事实，也可能显著增加 Token、墙钟、数据外发和协调成本。

Hufu 已经把任务正本、执行事实、角色和授权分离。关键决策的多角色研究与多模型复核也必须遵守这些
不变量，并且不得成为新的常驻控制面。

## 决策

Hufu 把该未来能力定义为可卸载的“关键决策会商”（`DecisionCouncil`）插件：

- **参谋会**使用多个互补研究视角独立分析同一问题；
- **专家研讨会**在多视角基础上增加至少两个可区分 Runtime 的复核；只有模型身份与独立性通过验证时，
  才能把结果标记为多模型交叉验证；
- 最终产物是证据、分歧、反例、未知项和路线建议，不是多数票结论；
- 最终裁决和任何执行授权仍由人类 `commander` 给出。

该能力不进入 Hufu 核心角色枚举，不属于 `task_authority`，也不在 `0.1.0` 实现范围内。

### 两条正交轴

会商分别绑定：

1. **研究视角**：由 `RoleCatalogProvider` 发现的专家角色、版本、摘要和本轮 lens；
2. **运行来源**：由 `ParticipantRuntimeProvider` 报告的 Host、CLI、模型、Session、权限和可观测能力。

磁盘存在角色卡不等于运行时可以派遣；两个 CLI 也不必然代表两个独立模型。每个席位必须记录
角色来源、digest、Runtime fingerprint、Provider 报告的模型身份，以及
`independence_status=verified|declared|unknown`。

多个角色但没有已验证模型差异时只能声明“多视角会商”；多个 Runtime 但模型独立性未知时只能声明
“多 Runtime 复核”；模型身份和独立性均满足合同后才能声明“已验证多模型复核”；多角色与已验证
多模型同时满足时才能声明“双轴会商”。两条轴都不满足时只是“单次建议”，不得宣称交叉验证。

原始角色卡始终是不可信输入。`RoleCatalogProvider` 只能通过字段白名单生成 `ResearchLens`：保留角色
标识、单一研究 lens、2–4 条问题相关约束、版本和 digest，丢弃工具、网络、写入、RoleBinding 和权限文字。
该 Lens 必须随 `CouncilPlan` 由用户确认，之后才能进入受信会商模板。

### 临时席位与核心角色

`CouncilSeat` 是一次会商中的临时研究席位，不是 RoleBinding。它不能成为或取代 `advisor`、
`project_lead`、`mission_lead`、`owner` 或 `auditor`，角色卡中的工具、网络、写入或权限声明不生效。

启用参谋协作的 Project 仍由唯一当值 `advisor` 提出会商、解释结果并向 `commander` 汇报。
会商可以建议 PM 或执行 Session 换届，但不能自行换届、关闭 WorkItem、修改 Issue 或启动业务动作。
`CouncilReport` 只能形成 `RouteRecommendation`。只有 `commander` 或既有授权明确指定的决策发布者
裁决后，内容才可以进入 ADR 0005 定义的 `DECISION_PACKET`；会商不得自动创建、换版或修改 Packet。

### 最小插件合同

未来功能合同至少包含：

1. `DecisionBrief`：Project、相关 WorkItem、决策问题、选项、目标与验收引用、事实引用及 freshness、
   非目标、数据分类和 `brief_digest`；
2. `CouncilPlan`：主持绑定、席位、拓扑、最低覆盖、预算、截止时间、工具策略和 `plan_digest`；
3. `CouncilSeat`：角色引用与 digest、单一 lens、Runtime 引用、模型身份、独立性状态和最小 Context；
4. `ParticipantSubmission`：立场、主张、简要理由、Evidence 引用、假设、反例、未知项、类型化状态、
   Runtime fingerprint 和 Usage；
5. `CouncilReport`：输入引用、证据支持的共识、实质分歧、最强反对意见、证据缺口、少数意见、
   建议路线和 `COMPLETE|PARTIAL|INCONCLUSIVE|CANCELLED` 状态。

Hufu 不要求或保存模型的隐藏思维过程。原始输出只在安全、审计和保留策略明确要求时保存；
默认保存完成审阅所需的结构化论点、Evidence 引用和回执。

### 一次会商的一次授权

用户的“一次授权”只能授权一个冻结的 `CouncilPlan`，不能成为调用任意 CLI 的永久通行证。
授权绑定 `plan_digest`，至少限制：

- 允许的 Runtime、模型或身份和调用次数；
- 可外发的数据分类、事实引用和工作目录范围；
- 文件、网络、工具与副作用策略，默认只读；
- 最大墙钟、Token 或费用、有效期和保留策略；
- 是否允许一次针对争议主张的质询。

计划、参与方、数据范围、工具或预算改变后必须重新授权。有效能力始终是 Hufu 会商授权与 Host 登录、
账号策略、Runtime 能力、操作系统、沙箱和审批边界的交集。Hufu 不代替登录、OAuth 或 Host 审批。

### 有界运行拓扑

默认选择 3–5 个互补席位，不执行完整的“角色数 × 模型数”笛卡尔积。第一轮各席位使用相同冻结问题包
和已确认的最小 `ResearchLens`，彼此看不到其他答案。只有实质分歧值得解决且预算允许时，
才进行最多一轮质询；
第二轮只传递争议主张、Evidence 引用和反例，不重复全部上下文。

初始自动化之前先验证手工影子路径：Hufu 生成有界问题包，用户在目标 Host 启动 Session，
再导入结构化 Submission。证明净收益后，才分别实现 Host 原生召集；多 CLI 自动扇出最后评估。

### 类型化失败与停止线

会商必须在 barrier 中对账每个席位。超时、限流、身份未知、畸形输出、取消、预算耗尽、授权到期、
数据策略冲突和覆盖不足不得静默忽略或自动换模型。

- 最低覆盖不足时报告 `PARTIAL`；
- 分歧无法用 Evidence 解决时报告 `INCONCLUSIVE`；
- Effect 结果未知时先 readback，不自动重复可能计费的调用；
- 综合器失败时仍返回结构化 Submission 和分歧矩阵；
- 新一轮没有增加 Evidence、消除分歧或改变建议时立即停止。

### 效能门禁

该能力与同类单参谋基线比较决策收敛墙钟、人工协调时间、有效独立发现、结论缺陷、后续返工或路线反转、
零效果尝试和可取得的实测 Token。角色数、模型数、生成文本量或表面一致率都不是成功指标。

连续三轮代表性试点没有可解释净收益时，暂停会商自动化及 Runtime 扩张；已经证明有效的手工信息包或
核心合同可以保留。具体阈值属于未来功能 Spec，不写入 Constitution。

## 后果

### 正面影响

- 专业视角差异和模型实现差异可以分别观察，不混成一个“Agent 类型”。
- 独立首轮、显式少数意见和反例降低从众与锚定风险。
- 同一产品故事可以从手工信息包平滑演进到 Host 原生、多 CLI 会商。
- 每次会商都具有权限、数据、成本、失败和来源回执。

### 成本与约束

- 不同 Host 需要各自的能力矩阵和合同测试，不能用 shell 包装宣称等价支持。
- 多 Agent 不等于真实专家，多 CLI 不等于独立模型；独立性可能只能报告 `unknown`。
- 会商可能比单 Agent 更慢、更贵，因此只能用于能改变关键决策的少数场景。
- 外部 Provider 增加数据外发、凭据、费用、Prompt Injection 和保留策略风险。

## 考虑过的替代方案

### 所有关键问题都固定调用全部角色和全部模型

拒绝。该方案产生笛卡尔积成本，增加数据外发面，也把“更多回答”误当成“更多证据”。

### 用多数票直接决定路线

拒绝。相关模型可以一致犯错；证据质量、反例和权威来源优先于票数。

### 由 Skill 直接保存状态并调用所有 CLI

只允许作为一次性实验，不作为产品架构。正式能力必须让 Skill 成为 Consumer，授权、计划、失败和
Evidence 由 `DecisionCouncilService` 及可替换 Provider 管理。

### 立即在 `0.1.0` 实现自动多 CLI 扇出

拒绝。当前优先级是共享核心合同、Local/Session/Handoff/CurrentView 纵切和只读 Projection；
会商先验证手工影子路径，避免在价值未证实时扩大控制面。

## 后续约束

- 自动调用任何外部 Runtime 前，必须建立独立 Module Issue、Spec Kit 合同和失败测试。
- `docs/COMPATIBILITY.md` 必须记录每个 Host 的 fresh/resume、结构化输出、取消、权限、Token、
  模型身份和 Session 可观测能力；未知项显式报告。
- `SECURITY.md` 的数据分类、Prompt Injection、凭据外置和按次授权要求必须进入实现验收。
- 会商 DomainEvent 使用 `hufu/council/*` 命名空间，不伪装成 Host SessionEvent。
- 插件卸载只撤销运行时 Effect；持久事实只能追加取消、撤回或取代事件。
