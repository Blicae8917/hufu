# 合同: 双入口 CurrentView 对等

## 夹具

`tests/fixtures/dsh/events.jsonl`（名称可在实现时微调）MUST 含：

- 本机连接与授权
- 至少一个本机工作项
- 一条交接
- 一份 `decision.packet_recorded`（可无信封）

不得含议题正文、凭据、本机绝对路径。

## 比较

1. Standalone：`readLedger` + `projectCurrentView`
2. DeepSeek：同一 `events.jsonl` 经 `ctx.hufu.status`（或等价服务）得到的 `result`
3. 对规范化对象做结构相等（键排序 JSON）
4. 各入口连续 3 次，入口内自洽，入口间相等

`view_schema_version` MUST 为 `1`。

`session` / `run` 在无 Host 原生观测时 MUST NOT 为 `available`，`value` MUST NOT 为 `0`。

决策槽只含 `decision_id` / `version` / `content_digest`。stdout/结果 MUST NOT 含 Packet 的 `business_outcome` 正文（夹具里可有该字段，但视图不得复制）。
