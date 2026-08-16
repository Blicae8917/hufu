# Data Model: M8 效能试点

## PilotRecordInput

操作者提交的 JSON 文件，经 schema 校验后才能入账。

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `schema_version` | `1` | 必需 |
| `pilot_id` | 字符串 | 非空；用作幂等键后缀 |
| `work_item_id` | 字符串 | 必须引用已有 handoff 的工作项 |
| `comparison_class` | 字符串 | 非空；三轮门禁用同类比较 |
| `conclusion` | 枚举 | `NET_BENEFIT` \| `NO_NET_BENEFIT` \| `TRADEOFF` \| `DATA_INSUFFICIENT` \| `FAIL` |
| `quality_preserved` | 对象 | `conclusion=NET_BENEFIT` 时必需，四项均为 `true` |
| `metrics` | 对象 | 见度量槽；不得用单一用量宣称成功 |
| `baseline` | 对象 | 必须带来源与观测时间；不得含绝对路径、内部项目名、凭据 |
| `notes_ref` | 字符串 | 可选；只能是稳定引用，不能贴原始 Session |

`baseline` 白名单字段：

- `source`：观测来源声明，例如 `operator-observation`
- `observed_at`：操作者提供的观测时间，属于记录内容，不是系统写入的 `Date.now()`
- `method_ref`：稳定方法引用，例如 `docs/SPEC.md#operational-definitions`

`quality_preserved` 字段：

- `authorization_preserved`
- `safety_preserved`
- `result_quality_preserved`
- `evidence_integrity_preserved`

## MetricSlot

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `availability` | 枚举 | `available` \| `unavailable` \| `data_insufficient` |
| `value` | `number \| null` | 非 `available` 时必须 `null`，不得为 `0` |
| `origin` | 枚举 | `measured` \| `estimated` \| `unavailable` |
| `unit` | 字符串 | 可选；墙钟用 `ms` 或 `s`，计数用 `count` |

必需槽名：

- `planning_wall_clock`
- `execution_wall_clock`
- `total_wall_clock`
- `human_coordination_time`
- `zero_effect_attempts`
- `coordination_wakeups`
- `rework`
- `setup_cost`
- `native_usage`

`native_usage.origin=measured` 仅当记录声明该值来自 Host 或 Provider 原生报告。本模块测试夹具可以把合成值标成 `measured` 以证明字段形状，但不得把估算改标为实测。

## DerivedMetrics

Hufu 在记录时从 Journal 派生，并写回事件 payload。若派生结果与输入冲突，以派为准，冲突标 `DATA_INSUFFICIENT` 或 `PILOT_INVALID`（当输入把缺失写成 `0` 时）。

| 槽 | 派生规则 |
| --- | --- |
| `coordination_wakeups` | 统计该 `work_item_id` 上操作者驱动的命令边界事件，加上 `hufu/handoff.recorded`。命令边界包括 `hufu/decision.packet_recorded`、`hufu/decision.envelope_recorded`、`hufu/engine.bound`、`hufu/engine.typed_result`、`hufu/engine.receipt`，且事件通过 `work_item_id` 或所属 `decision_id` 关联到该工作项。 |
| `rework` | 统计引用该工作项所属 decision stream 的 `hufu/decision.decision_delta`。 |
| `zero_effect_attempts` | 若记录提供 `observation_window`（起止事件 id 或序号），窗口结束时没有新的 applied 效果、`hufu/evidence.fact_delta` 或 `hufu/decision.decision_delta` 则计 1 次零效果。未提供可靠窗口则为 `data_insufficient`。 |

## ExpansionGate

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `status` | 枚举 | `closed` \| `evaluation_allowed` \| `paused` |
| `comparison_class` | 字符串或 `null` | 当前评估的类别 |
| `round_count` | 整数 | 已记录的同类轮数；缺失时不得用该数字暗示完成 |
| `net_benefit_rounds` | 整数 | 仅统计 `conclusion=NET_BENEFIT` 且质量声明完整的轮次 |
| `web_implemented` | `false` | 本模块恒为 `false` |
| `serve_allowed` | `false` | 本模块恒为 `false` |

规则：

- 同类记录不足三轮，或任一轮不是可解释净收益 → `closed`
- 连续三轮同类均为可解释净收益 → `evaluation_allowed`，仍不启动网页
- 连续三轮同类均为 `NO_NET_BENEFIT` → `paused`
- `TRADEOFF`、`DATA_INSUFFICIENT`、`FAIL` 不能打开 `evaluation_allowed`

## Event: `hufu/pilot.recorded`

- 幂等键：`hufu/pilot.recorded:<pilot_id>`
- payload：`pilot_id`、`work_item_id`、`comparison_class`、`conclusion`、`quality_preserved`、`metrics`、`derived_metrics`、`baseline` 白名单字段、`gate`

禁止：

- 把 `Date.now()` 写入 payload
- 复制 Issue 正文、Session 原文或角色卡
- 写入绝对路径、凭据或内部项目名

## SanitizedAggregate

可进入 stdout、CurrentView 和公开材料的聚合，只含：

- `comparison_class`
- 结论计数字典（各 `conclusion` 出现次数）
- 度量名称列表
- `method_ref`

禁止：内部项目名、绝对路径、Session 标识、凭据、按工作项列出的用量明细、Issue 正文。

## CurrentView slots

未记录试点时：

```json
{
  "pilot": { "availability": "data_insufficient", "value": null },
  "expansion_gate": { "availability": "data_insufficient", "value": null }
}
```

记录后：

- `pilot.value` 为最近一条有效试点的稳定摘要
- `expansion_gate.value` 为 `ExpansionGate`
- 任何缺失槽不得输出 `0`

## Validation rules

1. 工作项没有 `hufu/handoff.recorded` → `DATA_INSUFFICIENT`
2. 结论非法、用单一用量宣称成功、`NET_BENEFIT` 缺质量声明 → `PILOT_INVALID`
3. 基线或度量字符串匹配绝对路径、内部项目名或凭据形态 → `PILOT_INVALID`
4. `hufu serve` 或把网页当 `task_authority` → `EXPANSION_GATE_CLOSED` 或 `TASK_AUTHORITY_UNSUPPORTED`
5. 公开仓脱敏聚合不得包含工作项用量明细
