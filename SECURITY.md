# 安全策略

## 支持的版本

项目尚未达到 `1.0.0`。安全修复目前只面向最新发布版本。

## 报告漏洞

不要在公开 Issue 中发布漏洞利用细节。优先使用仓库托管平台提供的私密安全报告功能；
若该功能不可用，请通过维护者公开指定的私密渠道联系维护者。

报告应包含受影响版本、复现步骤、影响以及建议的缓解措施。不得包含真实凭据或私有生产数据。

## 安全边界

当前发布版本只验证本地 JSON。它不会执行任务动作、连接远端 Provider、持久化凭据或启动后台 Worker。
未来的 Adapter 和 RuntimeProvider 必须把外部 Issue 文本、角色卡、任务附件、工具输出和模型响应
视为不可信数据。它们必须以带来源的引用数据进入最小上下文，不得拼接进系统指令、RoleBinding、
`authorization_scope` 或权限声明；相关 Module 必须包含 Prompt Injection 和越权失败测试。
角色卡只有经字段白名单生成、由用户随计划确认的 `ResearchLens` 可以进入受信模板；工具、网络、
写入、角色绑定和权限文字必须丢弃。

凭据继续由 Host、Provider 或操作系统的既有机制管理，不写入公开仓库、Project 配置、Ledger、
Evidence 或 Handoff。Hufu 的授权不能替代 CLI 登录、OAuth、沙箱、审批或操作系统权限。

未来的关键决策会商若调用多个 Host，必须为每次会商建立绑定计划摘要的一次性授权，明确允许的
Runtime、模型或身份、数据分类、只读范围、工具和网络策略、调用与费用上限、截止时间及保留策略。
计划、参与方或数据范围改变后必须重新授权。模型身份无法验证、Token 无法读取或某一分支失败时，
必须报告 `unknown`、`unavailable` 或类型化失败，不能静默换用其他模型，也不能把缺失值记为 `0`。

Hufu 不要求或保存模型的隐藏思维过程；只保存完成审阅所需的结构化主张、简要理由、证据引用、
反例、未知项和运行回执。会商输出是派生建议，不产生授权、外部写回或正式验收。

未来的 `DECISION_PACKET` 只能保存最小结构化裁决、来源 revision/digest 和 Fact/Evidence 引用，
不得复制外部 Issue 正文、附件或凭据。`EXECUTION_ENVELOPE` 与 `ROUTE_ACK` 必须校验 Packet digest，
且不得携带可覆盖目标、验收、停止线或授权正文的字段。

`ROUTE_ACK.added_scope` 的四类理由只是范围缺口分类，不是授权白名单。只要范围非空或无法重新解析
`authority_scope_ref`，执行就必须 fail closed，等待既有授权渠道更新。Effect 无法 readback 时不得重试、
宣称成功或记为零；semantic rebase 也不得删除 Evidence、自动回滚不可逆动作或修改外部任务状态。
