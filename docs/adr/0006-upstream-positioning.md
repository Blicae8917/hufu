# ADR 0006：Hufu 作为 LoopX 下游的严格项目协调 Provider

- 状态：已接受（维护者于 #26 裁决方案 (a)）
- 日期：2026-08-23
- 决策所有者：Hufu 维护者
- 依赖：ADR 0001、ADR 0003
- 修订：ADR 0003 中「LoopX 作为可选 EngineProvider / 分阶段评估完整控制面」的产品定位

## 背景

公开上游 LoopX 已自述为 provider-neutral 的长时程 Agent 控制面，并覆盖 Goal、Todo、Quota、
Scheduler、Heartbeat、Host 执行循环和多个 harness（含 DeepSeek Harness 与 Claude Code）。
Hufu 既有正本把 LoopX 记为「可选 EngineProvider 和机制来源」，并仍把完整控制面、会商、
loopback Web 与出站 Runtime 写成已接受方向。该描述与已核验的上游重合面不符。

#26 要求在 (a) 收敛为 LoopX 下游 / provider、(b) 保留独立定位、(c) 放弃 DSH 插件这一格
三条中裁决其一。维护者已于 2026-08-23 选择 **(a)**。本 ADR 只落入该裁决，不重开选项。

#39 已用 `hufu pilot --record` 留下首轮脱敏基线，结论为 `DATA_INSUFFICIENT`
（见 `docs/pilot-baseline.md`）。相对该基线没有同类对照墙钟或原生 Token，
因此本裁决的效能判断不能写成净收益。

## 决策

Hufu 是 LoopX 下游的严格项目协调 Provider，不是第二套长任务控制面。

1. **Hufu 继续拥有**：`TaskAuthority` 适配、canonical Decision 引用、Role/SessionBinding、
   逐槽三轴 CurrentView、Evidence、Receipt、Effect readback，以及企业项目 Renderer 合同。
2. **LoopX 拥有**：Goal、Todo、Quota、Scheduler、Heartbeat、长任务恢复和 Host 执行循环。
3. **Hufu 不重复实现**上述 LoopX 控制面。
4. **LoopX 不得**取代 GitHub / GitLab 原生 Issue 生命周期，也不得从 Journal、Receipt
   或执行结果反推或扩大授权。
5. **`task_authority` 枚举**、`data_insufficient` 与逐槽 `fact_class + availability + freshness`
   作为 Hufu 的严格性边界继续保留，并通过真实试点验证其用户价值。
6. 连续三轮代表性对比不能证明净收益时，停止扩充 Runtime、Web 或其他控制面。

已交付的 `loopx-mechanisms`（#9）仍然只是须显式选用的机制记录口，不是任务正本，
也不把本 ADR 解读成引入 LoopX 发行包或完整控制面。

### 废除原自行建设的 M10–M15

下列原计划不再采用，不得作为已接受方向复活：

- 通用 Goal / Todo / Scheduler / Heartbeat；
- PM Engine 与 Wave Engine；
- 完整 Web 控制面（含默认 `hufu serve` / loopback Web Console）。

关键决策会商 Runtime 与出站 RuntimeProvider 同样不再作为已接受方向。

### 后续仅可设计、尚未授权实现的能力

ADR 0006 落地后，后续能力 Module 只围绕：

1. 自建 GitLab AuthorityProvider；
2. Hufu↔LoopX 的 Authority / Decision / Evidence 桥；
3. 通过效能门禁后的企业项目 Renderer。

本 ADR 与 #26 评论都**不是**实现授权。上述三项必须另立已接受 Module Issue、Spec Kit
合同和失败测试后才能开工。不得因本文件存在而实现它们。

## 效能判断

相对 #39 首轮基线，本裁决的净收益记录为 `DATA_INSUFFICIENT`。
公开产物见 `docs/pilot-positioning.md`。原始账本不入库。

理由：定位选择依据的是上游控制面重合与严格性边界，不是一轮可比较的墙钟或 Token 对照。
#39 基线本身也没有对照对象。不得把本次判断写成净收益。

## 后果

### 正面影响

- 产品定位与已核验的上游事实对齐，停止与 LoopX 重复建设长任务控制面。
- Hufu 的差异化收束到任务正本枚举、缺失不写 `0`、以及逐槽三轴 CurrentView。
- 后续 Module 清单变短，避免把会商、Web、出站 Runtime 误当成已批准工作。

### 成本与约束

- 不得再以「可选 EngineProvider，完整控制面可分阶段评估」表述 LoopX。
- 不得把本 ADR 当作 GitLab 写能力、LoopX 桥或 Renderer 的开工令。
- 已交付的只读 GitLab 投影、`loopx-mechanisms` 与 `hufu serve` 拒绝合同保持不变。
- 缺少对照轮次时，效能结论只能是数据不足或权衡，不能冒充净收益。

## 考虑过的替代方案

### (b) 保留独立定位

维护者未采纳。该路径要求可证伪的差异化验收口径，且须替换「可选 EngineProvider
和机制来源」的旧表述。#39 基线尚未提供对照数据；本 ADR 不重开 (b)。

### (c) 放弃 DeepSeek 插件这一格

维护者未采纳。已交付的 `hufu-dsh` 保持为入站 Profile，不是任务正本。
本 ADR 不重开 (c)，也不把上游 Host 占位写成 Hufu 必须撤离。

### 继续把完整控制面、会商、Web、出站 Runtime 写成已接受方向

拒绝。这会让路线图与 (a) 冲突，并重复 LoopX 已覆盖的控制面。

## 后续约束

- 每个后续能力 Module 必须引用本 ADR，并证明自己属于上述三类之一。
- 采用 LoopX 机制或源码仍须独立 Module Issue、边界测试、效能假设、可逆关闭路径，
  并遵守该提交的许可证与 NOTICE。
- 更新 `docs/SPEC.md`、`docs/COMPATIBILITY.md`、ADR 0003 及与 (a) 冲突的 README / AGENTS
  表述；#5 仍是 GitHub 上的索引，不在本仓库另建第二份进度正本。
- `0.1.0` 版本前两位不变；本 ADR 不授权打 `v0.1.0` 标签。
