# Research: 005-zero-copy-decision

## 1. 产品命令形状

- **Decision**: 增加**一个**产品命令 `hufu decide`。用互斥文件标志选择记录种类：`--packet` / `--envelope` / `--ack` / `--fact` / `--revise` / `--effect`。必填 `--actor <principal_id>`。载荷为 JSON 文件（字段多，不塞进 CLI 标志）。`connect` / `doctor` / `status` / `handoff` / `validate` 的既有成功与失败合同保持。
- **Rationale**: 规格要求四类写入操作，但不要求六个顶级子命令。单一命令降低「未知命令」表面积，文件载荷与 `validate` 一致。
- **Alternatives considered**: 六个顶级命令（`envelope`/`ack`/…，命令表膨胀）；把正文塞进 `handoff`（违反零拷贝）；通用 `hufu record --kind`（与现有动词风格不一致）。

## 2. 事件类型与幂等键

- **Decision**: 新事件类型：
  - `hufu/decision.packet_recorded`
  - `hufu/decision.envelope_attached`
  - `hufu/decision.route_acked`
  - `hufu/decision.fact_delta`
  - `hufu/decision.decision_delta`
  - `hufu/decision.effect_delta`
  沿用 `hufu/role_binding.established` 绑定 `owner` / `mission_lead`。幂等键由身份确定性派生（见 data-model）。`event_schema_version` 仍为 `1`。
- **Rationale**: 与现有 `hufu/<domain>.<verb>` 命名一致；角色不另发明事件类型。
- **Alternatives considered**: 每种 Delta 再分子类型（过度）；把 Packet 当可重写文档（违反 ADR 0005）。

## 3. 摘要范围

- **Decision**: `content_digest` 对 Packet 语义字段做 RFC 8785 + SHA-256，**不含** `content_digest` 自身、也不含事件信封字段。三项 ACK 成分摘要分别对 `business_outcome`、`authoritative_state`、`acceptance_metric` 单独计算。换版后的新 `content_digest` 对物化后的完整语义字段计算。格式仍为 `sha256:<hex>`。
- **Rationale**: 与 M2 `payload_digest` 同一规范，避免两套摘要算法。
- **Alternatives considered**: 对整份事件信封摘要（会把序号卷进内容）；对物理 JSON 字节摘要（键序不稳定）。

## 4. 角色与行动者

- **Decision**: `--actor` 必须等于已有身份：Packet / `DECISION_DELTA` → 指挥官（本模块不另做「指定发布者」字段，授权未点名即只有指挥官）。信封 → 当值 `project_lead`（单工作项）或当值 `mission_lead`（多工作项）。ACK / `EFFECT_DELTA` → 信封指定的 `owner` 或 `mission_lead`。`FACT_DELTA` → 当值 `project_lead` 或该裁决相关工作项的当值 `owner`。附加单工作项信封时可在同一追加中写入恰好一个 `owner` 绑定（`principal_id` 来自信封载荷）。多工作项信封同时写入 `mission_lead` 绑定（`scope_kind=mission`，`scope_id=envelope_id`）。
- **Rationale**: 规格 FR-005/008/024；单人维护者可让同一 `human:alice` 持有多个绑定，但仍走信封与确认。
- **Alternatives considered**: 省略 `--actor` 默认指挥官（会跳过角色校验）；把 GitHub assignee 当 owner（M3 已禁止）。

## 5. 活跃决策流基数

- **Decision**: 工作项身份取 `authoritative_state.task_ref` 与信封 `work_item_ids`。若某工作项已出现在另一 `decision_id` 的**当前**信封（或尚无信封时的 Packet `task_ref`）中，再为它记录新的活跃 Packet/信封 → `DECISION_CONFLICT`。同一 `decision_id` 换版不算第二条流。
- **Rationale**: ADR 0005 必答题 1；失败关闭比静默合并两条路线更安全。
- **Alternatives considered**: 允许多条并发流（执行护栏无法决定跟哪条）；用任务正本状态代替活跃流（会侵占生命周期）。

## 6. 护栏求值位置

- **Decision**: `guardrails.ts` 为纯函数，输入为已回放的决策快照 + 可选 `now`。仅由 `projectCurrentView`、`handoff` 的下一步生成、以及 `decide` 追加前的前置检查调用。不创建 timer。`status` 默认仍不联网。
- **Rationale**: Constitution：semantic drift 只在既有交互边界求值。
- **Alternatives considered**: 独立 `hufu recheck` 命令（多余入口）；后台轮询（禁止）。

## 7. CurrentView 兼容

- **Decision**: `view_schema_version` 保持 `1`。新增可选顶层槽：`decision`、`execution_envelope`、`route_ack`、`first_durable_effect`、`execution_guardrails`。无裁决时这些槽 `availability=data_insufficient`，`value=null`。既有槽语义不变。`handoff` 成功 `result` 增加 `decision_ref`（无裁决则为 `null`），`next_action_text` 不得含 Packet 正文字段。
- **Rationale**: 与 M3 给 GitHub 加字段但不升视图版本的做法一致，避免无裁决工作区无故失败。
- **Alternatives considered**: 升到 v2（会迫使所有旧断言改版本号，收益只是「有新槽」）。

## 8. GitHub 正本

- **Decision**: `github` 下 `task_ref` 必须是当前投影缓存中的 `external_ref`。`decide` 不调用 `GitHubPort`。无缓存 → `DATA_INSUFFICIENT`。权威状态只存引用与观测摘要，不存议题 `body`。
- **Rationale**: FR-022；M3 只读合同。
- **Alternatives considered**: `decide` 隐式 `--refresh`（新增网络入口，超出授权）。

## 9. 效果与实现活动

- **Decision**: `EFFECT_DELTA` 与实现活动证据都是入站 JSON。本模块不扫描 git、不执行命令、不重试外部效果。读回状态枚举：`complete` / `unavailable` / `data_insufficient`。观测结果枚举由读回约束：无 complete 读回不得为 `applied` 或 `confirmed_absent`。
- **Rationale**: 规格 Assumptions；无 RuntimeProvider。
- **Alternatives considered**: 调 git log 测实现增长（新副作用、本机路径风险）；把缺失读回写成 0（禁止）。
