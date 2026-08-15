# 共享事件信封 v1

物理行：UTF-8 JSON 对象，无外层数组。`digest_spec_version` = `"1"`：对 `payload` 做 RFC 8785 规范化后 SHA-256，`payload_digest` 形如 `sha256:<hex>`。

## 字段

见 [data-model.md](../data-model.md) 的 EventEnvelope 表。规范化输入 **只含 `payload`**，不含信封元数据，以免序号与摘要循环依赖。

## 追加算法（合同，非优化）

1. 独占创建 `write.lock`；失败则拒绝。
2. 读取已完成行，校验全序、摘要、因果；中间损坏则拒绝；尾部未完成则拒绝追加（须先 doctor 修复）。
3. 分配 `ledger_seq = last_seq + 1`（空账本为 1）。
4. 若 `idempotency_key` 已存在且摘要相同，释放锁并返回旧事件。
5. 若键相同摘要不同，释放锁并拒绝。
6. 序列化一行（规范化与落盘：落盘可用紧凑 JSON，但摘要必须按 RFC 8785）。行末写 LF。
7. 关闭并删除锁。

## 读时升级

`event_schema_version === 1`：恒等升级。更高版本：本模块视为未知必需版本，fail closed。原始行不得改写。

## 夹具义务

同一夹具目录内的事件列表，在 Windows 与 POSIX 上必须得到相同的 `payload_digest` 与相同的 CurrentView 结构（见 `current-view.v1.md`）。
