# LoopX RunOnce Consumer v1 合同（#68）

本合同是 `specs/012-loopx-bridge` 在 [#68](https://github.com/Blicae8917/hufu/issues/68)
下的运行增量。固定兼容基线为 LoopX `v0.5.2` / commit
`423035f402e2f1703f076c3cfe60c14c5803433f`；moving `main` 只作研究参考。

## 激活

桥默认关闭。只有 `BridgeActivationReceipt` 同时满足下列条件才可启用：

- release / commit 等于上述固定基线；
- `qualification=qualified`；
- `turn_plan`、`run_once`、`readback`、`durable_attempt_journal`、`independent_typed_result_validator` 均为 `true`；
- `adapter_id` 与 `validator_id` 不同；
- `capability_digest` 与规范化声明完全一致；
- `runtime_locator_ref` 指向 Provider 自有的显式 wrapper 配置。

`runtime_locator_ref` 是不透明引用，不是本机路径正文。实际 wrapper 路径只在部署侧
RunOncePort 配置中解析，不写入公开仓、桥快照或裁决正文。已有 `engine_id=loopx-mechanisms`
不构成激活回执。

Activation Receipt 只证明能力事实，不产生执行授权。调用方只能提供 opaque `authority_ref`；
独立 AuthorityResolver 必须从 Hufu current Ledger/status 读回现行 grant revision、原生 task ref、
Decision/Envelope 与 SessionBinding generation，并签发 fresh validation receipt。该回执再与实际注入的
RunOncePort、耐久 attempt store、独立 Validator / readback
共同满足，`execution_allowed` 才能为 `true`；缺少任一项必须为 `false`。

## Plan

`prepareOutboundTurn` 只绑定 opaque `authority_ref`、真实 `ExecutionEnvelopeRef` 与真实
`SessionBindingRef { binding_id, generation }`。不得把 RoleBinding、project_lead 或固定
`generation=1` 伪装成 SessionBinding。Turn 只能是一次 bounded `run-once`：
`max_invocations=1`，稳定 `turn_key` 对固定基线、Envelope 与 SessionBinding 计算。

没有 AuthorityResolver 的 fresh validation receipt、激活回执、耐久 attempt store，或缺少注入的 RunOncePort / 独立 Validator / readback 时仍可生成只读 Plan，但
`execution_allowed=false`；不得静默回退到 shell、Codex CLI、真实 Host 或默认执行。

执行前必须让同一 Resolver 再读 current Ledger/status。grant revision、Decision/Envelope、task、
SessionBinding generation 或 validation digest 任一变化，都使既有 Plan 失效，且必须在任何 runtime
readback、attempt prepare 或 execute 之前停车。裸 `AuthorityCrossing` 即使自报 `fresh` 也不得接受。

## Execute 与恢复

执行前必须先按 `turn_key` 做效果 readback，再读取耐久 attempt journal：

- 效果与 attempt 都是 `not_found`：先用 CAS 耐久写入唯一 `prepared` attempt receipt；只有本次新建成功才允许调用 RunOncePort 一次；
- `complete`：按重启恢复返回既有 `TypedResultRef` / `EffectRef` / Validator Receipt /
  Effect Receipt，不得重复执行；
- `prepared` / `unavailable`：失败关闭，禁止盲目重试。

一旦 `prepared` attempt 已耐久存在，即使 execute 超时且效果 readback 仍为 `not_found`，后续调用也只能继续 readback 或产生 typed stop，不能自动第二次调用 RunOncePort。

一次调用返回后，TypedResult 必须由与 Adapter 身份不同的独立 Validator 验真。只有
Validator Receipt、Effect readback 与最终 Receipt 全部绑定同一 `turn_key` / `result_id` /
`effect_id`，Consumer 才能返回 `next_allowed=true`。失败、超时或连接中断后必须再 readback；
读回不能证明 committed 时只能返回 `DATA_INSUFFICIENT`，不得继续下一 Turn。

## 非目标

- 不新增 `loopx` 依赖，不 vendor 上游源码；
- 不安装 LoopX、不调用真实 Host；测试只使用 public-safe fake port；
- 不实现 Hufu Scheduler、Heartbeat、Goal/Todo/Quota 或守护 while-loop；
- 不把 LoopX Journal、TypedResult 正文或 Receipt 正文写入 Hufu 任务正本；
- 不自行启动常驻循环。持续唤醒仍由 LoopX / Host / Supervisor 所有。
