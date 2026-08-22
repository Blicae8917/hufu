# 首轮效能试点基线

本文件是 #39 的公开产物：脱敏方法、`hufu pilot --record` 返回的聚合口径，以及现有九槽放不下的观测缺口。
原始账本、命令明细、信封标识和按工作项列出的派生计数留在抛掷工作目录，**不入库**。

## 方法

- 父合同：`specs/009-pilot-gate/`，记录形状见 `contracts/pilot.v1.md`。
- 操作定义：`docs/SPEC.md#效能试点协议`。
- 比较类别：`core-connect-decide-handoff`（已交付核心路径，未绑定 LoopX，不是 `loopx-bound-decide`）。
- 任务正本：`local`。账本写在抛掷工作目录的 `.hufu/ledger`（已 gitignore），不是 Hufu 源码树。
- 已交付命令顺序：`connect` → `decide --packet` → `decide --envelope`（`EXECUTION_ENVELOPE`）→ `decide --ack`（`ROUTE_ACK`，空 `added_scope`）→ `handoff` → `status` → `pilot --record`。
- 本机工作项打开走已导出的 `openWorkItem`，不是第五个产品命令。纯 CLI 不能从空目录走完全程，但记录入口本身可用；这不是发明新度量的理由。
- 记录者角色：commander（兼当值 project_lead）。
- 本轮是**第 1 轮基线**，不是三轮对比中的第 1 轮。后续计数按 **1 轮基线 + 3 轮对比**，不得把本轮判为「三轮未达标」。
- `NET_BENEFIT` 留给有对比对象的后续轮次。本轮没有同类对照，也没有 Host / Provider 原生墙钟或 Token，因此不能证明减少。

## 本轮结论

本轮结论为 `DATA_INSUFFICIENT`。

`quality_preserved` 四项（授权 / 安全 / 结果质量 / 证据完整性）均声明为保持。该声明不把本轮升格为净收益。

## 聚合口径

下列对象来自 `hufu pilot --record` 成功 stdout 的 `aggregate` 字段，不含工作项用量明细：

```json
{
  "comparison_class": "core-connect-decide-handoff",
  "conclusion_counts": {
    "DATA_INSUFFICIENT": 1
  },
  "method_ref": "docs/SPEC.md#效能试点协议",
  "metric_names": [
    "planning_wall_clock",
    "execution_wall_clock",
    "total_wall_clock",
    "human_coordination_time",
    "zero_effect_attempts",
    "coordination_wakeups",
    "rework",
    "setup_cost",
    "native_usage"
  ]
}
```

`status` 投影的 `expansion_gate`：

```json
{
  "comparison_class": "core-connect-decide-handoff",
  "net_benefit_rounds": 0,
  "round_count": 1,
  "serve_allowed": false,
  "status": "closed",
  "web_implemented": false
}
```

`round_count` 为 1 只表示该类已有一轮记录，不得解读为三轮门禁已完成，也不得写成缺失观测。

## 取值纪律（本轮）

未扩充 `METRIC_SLOT_NAMES`。九个槽都有取值类别；缺失不得写成 `0`。

| 槽 | 本轮口径 |
| --- | --- |
| `planning_wall_clock` | `data_insufficient`。已交付 CLI 不原生报告编排墙钟。 |
| `execution_wall_clock` | `unavailable`。本轮无 Host / 模型推理时间可观测，不得摊派估算。 |
| `total_wall_clock` | `unavailable`。执行墙钟不可用时不得拼出总值。 |
| `human_coordination_time` | `data_insufficient`。无可靠人工接点计时窗口。 |
| `zero_effect_attempts` | 由账本事件派生；公开仓不列按工作项计数。未提供可靠窗口时合同要求 `data_insufficient`。 |
| `coordination_wakeups` | 由账本事件派生；公开仓不列按工作项计数。 |
| `rework` | 由账本事件派生；公开仓不列按工作项计数。本轮未提交 `decision_delta`。 |
| `setup_cost` | `data_insufficient`。无对照设置成本。 |
| `native_usage` | `unavailable`。无 Host 或 Provider 原生 Token 报告，不得标 `measured`。 |

`session` 与 `run` 在 `status` 中为 `unavailable` 且 `value=null`，同样不得写成 `0`。

## 已知槽位缺口

下列事实在现有九槽中无处安放。本轮只记录缺口，不塞进语义不符的槽，也不扩充枚举。它们是后续 #26 差异化口径的输入，不是本票的实现授权。

| 想观测 | 现状 |
| --- | --- |
| 普通修复升级 PM 的次数 | 无对应槽。`coordination_wakeups` 统计的是推进同一工作项的显式介入事件，不是「本可在执行层完成却升级到项目负责人」的次数。 |
| 重复 Session / 重复投递 / 丢回调 计数 | 无对应槽。`zero_effect_attempts` 只覆盖「一次尝试结束时没有新的耐久效果、新证据或新决策增量」，不能表达重复投递或丢失回调。 |
| 人工接点**次数** | `human_coordination_time` 是时间，不是次数。 |

## 明确不做

- 不扩充 `METRIC_SLOT_NAMES` 或 `PILOT_CONCLUSIONS`。
- 不修改 `pilot.ts` / `pilot-schema.ts` 的判定逻辑。
- 不因本轮结果开启 `hufu serve`、网页或其他新 Module。
- 不在本文件或本仓提交原始试点数据、本机路径、凭据或家庭/机房细节。
- 不对 #26 作出裁决；关闭 #26 时仍须另一次带对比的 `pilot --record` 才能谈净收益。
