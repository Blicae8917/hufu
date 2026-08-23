# ADR 0007：受控 GitLab Effect、LoopX 桥实现与 Codex NativeHost

- 状态：已接受（指挥官于 2026-08-23 授权）
- 日期：2026-08-23
- 决策所有者：Hufu 指挥官 / 维护者
- 依赖：ADR 0001、ADR 0003、ADR 0005、ADR 0006
- 修订：ADR 0006「后续仅可设计、尚未授权实现」对下列 (a)(b)(c) 的效力

## 背景

ADR 0006 把 Hufu 收束为 LoopX 下游的严格项目协调 Provider，并写明三类后续能力当时
**只可设计、尚未授权实现**。#49 / #53 已交付自建 GitLab 认证只读 AuthorityProvider；
#50 / `specs/012-loopx-bridge/` 已落地桥的设计合同。指挥官于 2026-08-23 授权进入实现阶段，
但仍禁止复活已废止控制面，也禁止本波交付写回 / 桥 / Host 运行时代码。

本 ADR 只记录该授权与边界，不重开 ADR 0006 的定位选项，也不改写 0006 历史正文。

## 决策

指挥官授权下列四项。对应实现票为 #57、#58、#59、#60。本波只开票、修宪章、记本 ADR、
扩展 / 新开 Spec Kit 与设计约束测试。版本保持 `0.1.0`。不 npm-publish。

### (a) 受控 GitLab Effect

允许经独立 `GitLabTaskMutationProvider`（不得把写方法加到只读 `GitLabPort`）执行五种
`mutation_kind`：`append_comment`、`transition_managed_status_label`、`set_assignee`、
`close_issue`、`reopen_issue`。路径必须是 `preview` / `execute` / `readback`。每个动作绑定
`effect_id`、`task_ref`、`decision_ref`、`execution_envelope_ref`、`authority_scope_ref`、
`expected_source_revision`、`mutation_kind`、`canonical_payload_digest`、`actor_binding`、
`idempotency_key`。

只读 allowlist 不授权明文 HTTP 写。自建 HTTP 写回还须操作者本机
`transport_security_exception_ref`；例外正文不得入库。通用 GitLab 透传、编辑正文、删除、
MR / 分支 / 发布仍禁止。本 ADR **不**授权对真实生产项目执行 `execute`；真实项目第一次写
停在 preview / 只读预检，直到另一次部署确认。

### (b) 实现 #50 桥

授权实现 #50 的后继票 #58，对照 LoopX **v0.5.2** 合同
（https://github.com/huangruiteng/loopx/releases/tag/v0.5.2 ，
release commit `423035f402e2f1703f076c3cfe60c14c5803433f`），不 vendoring LoopX 源码，
不增加 `loopx` 运行时依赖。最新 LoopX `main` 仅供研究。复用 `specs/012-loopx-bridge/`，
不得另起与 012 矛盾的第二套 kit。过桥只允许稳定引用：`AuthoritySnapshotRef`、`DecisionRef`、
`ExecutionEnvelopeRef`、`EvidenceRef`、`EffectRef`、`ReceiptRef`、不透明 `SessionBindingRef`、
`TypedResultRef`。不得过桥议题正文、grant 正文、Packet 正文副本、LoopX 控制面状态、Host
transcript、凭据，也不得从 Journal / Receipt / TypedResult 推断授权。Hufu 不复制 LoopX
控制面。GitLab 仍是唯一议题权威。#50 保持为设计史，不关闭。

### (c) Codex NativeHost RuntimeProvider + SessionBinding

授权 #59：Hufu 核心不创建 Session。运行中的 Codex Consumer 调用宿主原生工具；Hufu 只下发
action packet 并记录结果。最小接口为 `capabilities` / `start` / `resume` / `send` /
`observe` / `wait` / `interrupt` / `release` / `readback`。独立 CLI / daemon 在宿主原生
工具缺失时失败关闭，禁止静默回退。Claude / DeepSeek Harness / Codex 不是等价运行时。

### (d) 公开安全端到端试点

授权 #60 作为验收票：公开夹具为一个父议题 + 四个子议题，不含真实项目名或地址。本波只写
Issue 与 `specs/015-e2e-pilot/` 大纲。夹具测试可等到 #57–#59 有代码。真实环境试点仍未授权
对生产执行写。

## 明确仍未授权

- 企业 Renderer
- 已废止的 M10–M15、通用 Goal / Todo / Scheduler / Heartbeat、PM Engine、Wave Engine
- `hufu serve`、会商 Runtime、完整 Web 控制面
- 把 LoopX 写入 `task_authority`
- 对真实生产项目执行 GitLab `execute` 或关闭真实项目议题
- 本波内的 mutation HTTP POST/PUT、LoopX 客户端、Codex thread 调用

## 与 ADR 0006 的关系

本 ADR **取代** ADR 0006「尚未授权实现」对上述 (a)(b)(c) 的效力。0006 的产品定位、
M10–M15 废止、LoopX 不是 `task_authority`、以及 Renderer 仍未授权，全部保持。
0006 历史章节不改写；仅在其「后续约束」增加指向本文件的指针。

## 后果

### 正面影响

- 实现票与宪章 / kit 对齐，避免把 #50 设计史误当成开工令或把它关闭。
- 写回被收束到五种 kind 与 preview / execute / readback，而不是通用 GitLab SDK。

### 成本与约束

- 本波合入不等于 Adapter 已交付，也不等于生产写回已自动化。
- 后续实现必须先失败测试再写生产代码，结束时只报告 `IMPLEMENTATION_COMPLETE` 或类型化
  `NO_GO`，不得把「CI 绿」写成生产已自动化。
- 版本保持 `0.1.0`。

## 考虑过的替代方案

### 把写方法加到只读 GitLabPort

拒绝。只读投影与受控写回必须保持独立端口。

### 以 LoopX HEAD 或 vendored 源码为桥基线

拒绝。合同基线是 v0.5.2；HEAD 仅供研究。

### 本波同时交付运行时

拒绝。指挥官本波只授权开票、修宪章、记 ADR 与 kit / 约束测试。
