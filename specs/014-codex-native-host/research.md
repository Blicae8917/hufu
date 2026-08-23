# Research: 014-codex-native-host

## 1. 核心不创建 Session

- **Decision**: Hufu 只发 action packet。Session 由正在运行的 Codex Consumer 经宿主原生工具创建。
- **Rationale**: 指挥官明确禁止 Hufu 成为 Session 工厂；也禁止 CLI 文本包装冒充等价能力。
- **Alternatives considered**: 独立 daemon 自行 `codex exec`（拒绝为静默回退）。

## 2. 能力三分

- **Decision**: Codex CLI exec/resume、app-server managed thread、Desktop 可见任务分别声明，并做 declared / observed / qualified 检查。
- **Rationale**: Claude / DSH / Codex 不等价。
- **Alternatives considered**: 一个「Host Runtime」笼统能力（拒绝）。

## 3. #59 packet-only 基线

- **Decision**: #59 只落地 packet-only Provider与约束测试。
- **Rationale**: 当时尚未授权Host Consumer施工。
- **Alternatives considered**: 由独立 CLI直接调用Codex工具（拒绝）。

## 4. #67 两阶段耐久 Consumer

- **Decision**: Hufu在Host调用前追加脱敏prepared packet，Host调用后追加receipt/readback；进程重启
  只能恢复尚无completion receipt的prepared；已有receipt必须拒绝再次生成Host调用。start prepare
  还必须重新核验qualified Host capability与当前Ledger中的grant/envelope/RoleBinding/work-item/project。
- **Rationale**: Codex创建/投递是外部Effect；单纯内存binding会在崩溃后产生双Session或假投递。
- **Alternatives considered**: Consumer内部直接调用真实Codex工具（拒绝，CI不可复现且混淆Host能力）；
  保存prompt或raw transcript以便重放（拒绝，复制不可信正文）。

## 5. pending、handoff与interrupt

- **Decision**: `clientThreadId`只形成pending binding，且不能传给要求`threadId`的Host工具。start
  packet生成唯一correlation title；Consumer通过`list_threads`解析稳定`threadId + hostId`，之后才
  用`read_thread`观察并转ready。
  逻辑换届只追加Hufu事实，不调用物理`handoff_thread`。当前没有合格的原生interrupt时返回
  `unavailable`。release必须先经过Host readback。
- **Rationale**: 这些能力不等价，不能用名称相近的Host动作冒充事实。
- **Alternatives considered**: 把逻辑换届映射到物理handoff（拒绝）；用内存`queued=true`表示活跃
  Turn消息已排队（拒绝，当前选择明确拒绝）。
