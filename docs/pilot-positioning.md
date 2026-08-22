# 上游定位裁决的效能记录

本文件是 #26 / ADR 0006 的公开产物：相对 [首轮基线](pilot-baseline.md) 记录本次定位的净收益判断。
原始账本、命令明细、信封标识和按工作项列出的派生计数留在抛掷工作目录，**不入库**。

## 方法

- 父合同：`specs/009-pilot-gate/`，记录形状见 `contracts/pilot.v1.md`。
- 操作定义：`docs/SPEC.md#效能试点协议`。
- 比较类别：`upstream-positioning`。这是定位裁决本身的记录类，不是再跑一轮
  `core-connect-decide-handoff`。#39 基线仍按 **1 轮基线 + 3 轮对比** 计数。
- 对照来源：`docs/pilot-baseline.md`（#39，结论 `DATA_INSUFFICIENT`）。
- 任务正本：`local`。账本写在抛掷工作目录的 `.hufu/ledger`（已 gitignore），不是 Hufu 源码树。
- 已交付命令顺序：`connect` → `decide --packet` → `decide --envelope` → `decide --ack` →
  `handoff` → `pilot --record`。工作项打开走已导出的 `openWorkItem`，不是第五个产品命令。
- 记录者角色：commander。
- 定位选择依据的是上游控制面重合与严格性边界，不是一轮可比较的墙钟或 Token 对照。
  因此不得把本次判断写成净收益。

## 本轮结论

本轮结论为 `DATA_INSUFFICIENT`。

`quality_preserved` 四项（授权 / 安全 / 结果质量 / 证据完整性）均声明为保持。该声明不把本轮升格为净收益。

#39 基线没有对照对象；本轮同样没有 Host / Provider 原生墙钟或 Token。ADR 0006 选择方案 (a)
并不依赖本轮证明减少。

## 聚合口径

下列对象来自 `hufu pilot --record` 成功 stdout 的 `aggregate` 字段，不含工作项用量明细：

```json
{
  "comparison_class": "upstream-positioning",
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
  "comparison_class": "upstream-positioning",
  "net_benefit_rounds": 0,
  "round_count": 1,
  "serve_allowed": false,
  "status": "closed",
  "web_implemented": false
}
```

`round_count` 为 1 只表示该类已有一轮记录，不得解读为三轮门禁已完成，也不得写成缺失观测。
#39 的 `core-connect-decide-handoff` 门禁仍为关闭。

## 取值纪律（本轮）

未扩充 `METRIC_SLOT_NAMES`。九个槽都有取值类别；缺失不得写成 `0`。

| 槽 | 本轮口径 |
| --- | --- |
| `planning_wall_clock` | `data_insufficient`。定位裁决没有可比较的编排墙钟窗口。 |
| `execution_wall_clock` | `unavailable`。本轮无 Host / 模型推理时间可观测，不得摊派估算。 |
| `total_wall_clock` | `unavailable`。执行墙钟不可用时不得拼出总值。 |
| `human_coordination_time` | `data_insufficient`。无可靠人工接点计时窗口。 |
| `zero_effect_attempts` | 由账本事件派生；公开仓不列按工作项计数。未提供可靠窗口时合同要求 `data_insufficient`。 |
| `coordination_wakeups` | 由账本事件派生；公开仓不列按工作项计数。 |
| `rework` | 由账本事件派生；公开仓不列按工作项计数。本轮未提交 `decision_delta`。 |
| `setup_cost` | `data_insufficient`。无对照设置成本。 |
| `native_usage` | `unavailable`。无 Host 或 Provider 原生 Token 报告，不得标 `measured`。 |

## 明确不做

- 不把本轮写成净收益。
- 不扩充 `METRIC_SLOT_NAMES` 或 `PILOT_CONCLUSIONS`。
- 不修改 `pilot.ts` / `pilot-schema.ts` 的判定逻辑。
- 不因本轮结果开启 `hufu serve`、网页、GitLab AuthorityProvider、Hufu↔LoopX 桥或 Renderer。
- 不在本文件或本仓提交原始试点数据、本机路径、凭据或家庭/机房细节。
