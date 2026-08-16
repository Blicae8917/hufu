# Research: M8 效能试点与条件式本机网页

## Decision 1: 独立 `hufu pilot` 命令，不塞进 `decide`

**Decision**: 新增 `hufu pilot --actor <id> --record <file>`。门禁查询继续走 `hufu status`。不把试点记录做成 `hufu decide` 的新标志。

**Rationale**: `decide` 已经承载裁决包、执行信封、引擎绑定、类型化结果和回执。试点是事后比较，不是新的裁决正文。混入 `decide` 会把效能观测写进决策流，违反零拷贝和“Journal 不是授权”的边界。

**Alternatives considered**:

- 扩展 `hufu decide --pilot`：否决。试点不是 DecisionPacket。
- 只改文档、不做命令：否决。规格要求可重复的记录与门禁。
- 新增出站/会商命令：否决。超出 Issue #10 范围。

## Decision 2: `hufu serve` 是保留拒绝命令

**Decision**: 本模块把 `hufu serve` 登记为已知子命令，并一律失败关闭。即使三轮同类比较都是可解释净收益，也不监听端口、不启动网页。网页实现必须另一次明确批准。

**Rationale**: 规格的默认交付是试点记录，不是网页。FR-016 禁止在未批准时增加网页服务；登记 `serve` 为已知拒绝不是启动服务，而是把关闭路径写成稳定错误码。若 `serve` 仍是未知子命令，失败原因会被理解成 CLI 未实现，而不是网页未获批准。

**Alternatives considered**:

- 三轮净收益后自动启动本机网页：否决。规格写明本模块不得实现网页。
- 继续让 `serve` 保持未知命令：否决。无法表达门禁合同。
- 实现只读静态页但不监听远程：否决。任何网页实现都超出本模块。

## Decision 3: 结论枚举与质量声明

**Decision**: 记录结论只能是 `NET_BENEFIT`、`NO_NET_BENEFIT`、`TRADEOFF`、`DATA_INSUFFICIENT`、`FAIL`。`NET_BENEFIT` 必须附带 `quality_preserved`：授权边界、安全边界、结果质量和证据完整性均为真。用单一用量或步骤数宣称成功则 `PILOT_INVALID`。

**Rationale**: Constitution 禁止把缺失观测写成 `0`，也禁止用局部用量代替净收益。质量声明把“更快但越权”排除在净收益之外。

**Alternatives considered**:

- 用布尔 `success`：否决。无法表达权衡和数据不足。
- 允许 `NET_BENEFIT` 不声明质量：否决。规格 FR-007。

## Decision 4: 度量槽可用性三态

**Decision**: 每个度量槽为 `{ availability, value, origin }`。`availability` 为 `available`、`unavailable` 或 `data_insufficient`。非 `available` 时 `value` 必须是 `null`，不得为 `0`。`origin` 仅为 `measured`、`estimated` 或 `unavailable`。估算不得标成实测。只有 Host 或 Provider 原生报告的用量才能标 `measured`。

**Rationale**: 直接落实 Constitution 的观测规则，并让 CurrentView 和脱敏聚合可以区分“没有发生”与“没有测到”。

**Alternatives considered**:

- 缺失时写 `0`：否决。
- 把估算和实测混在同一数字里：否决。

## Decision 5: 协调类度量从既有事件派生

**Decision**:

- 协调唤醒：同一 `work_item_id` 上，操作者驱动的命令边界事件与 `hufu/handoff.recorded` 的计数。
- 返工：引用同一工作项的 `hufu/decision.decision_delta` 计数。
- 零效果尝试：一次观测窗口结束时，没有新的 durable applied 效果、新 Evidence 或新决策增量。合成夹具必须能构造该窗口。窗口缺失时标 `data_insufficient`，不得当 `0`。

墙钟、人工协调时间和原生用量由操作者在记录中提供槽位，Hufu 校验形状与隐私，不在本模块访问 Host 专有日志。

**Rationale**: 规格要求能从 Hufu 事件派生的协调类指标必须派生。墙钟和原生用量不是 Hufu Journal 的权威字段，不能伪造为实测。

**Alternatives considered**:

- 全部由操作者手填：否决。无法证明与事件一致。
- 扫描 Host Session Log 取用量：否决。Host 日志不是跨 Session 正本，且本模块无网络/Host 适配器扩展。

## Decision 6: 扩充门禁三态，网页仍不启动

**Decision**: `expansion_gate.status` 为：

- `closed`：不足三轮同类比较，或任一轮不是可解释净收益。
- `evaluation_allowed`：连续三轮同类比较均为可解释净收益；只允许评估网页提案，不启动网页。
- `paused`：连续三轮同类比较均为 `NO_NET_BENEFIT`；暂停对应新增能力，不否定已交付核心合同。

`hufu serve`、远程访问和新控制面在三种状态下都拒绝实现。`connect --task-authority web|ui|dashboard` 继续或明确失败为 `TASK_AUTHORITY_UNSUPPORTED`。

**Rationale**: 规格把“打开评估”和“实现网页”分开。本模块只做前者的记录，并强制后者失败关闭。

## Decision 7: 隐私与公开仓边界

**Decision**: 记录、Journal 投影和测试夹具拒绝 Unix/Windows 绝对路径、内部项目名、凭据、Session 明细和按工作项用量明细。脱敏聚合只输出比较类别、结论计数、度量名称和方法引用。测试断言 `.gitignore` 不增加 `pilots/`、`research-data/` 之类研究目录。

**Rationale**: Constitution 禁止公开仓存放外部源码镜像、长篇研究和本机路径。Issue #10 允许私有环境保留真实试点，但那些数据不进入本仓库。

## Decision 8: CurrentView 槽位与事件

**Decision**: `view_schema_version` 保持 `1`。新增 `pilot` 与 `expansion_gate` 槽。未记录试点时两个槽均为 `data_insufficient` 且 `value=null`。事件名为 `hufu/pilot.recorded`，幂等键 `hufu/pilot.recorded:<pilot_id>`。

**Rationale**: 与 LoopX 模块的槽位模式一致，避免为试点单独升 schema 版本。幂等键不含系统时间戳，避免重复记录因 `Date.now()` 冲突。
