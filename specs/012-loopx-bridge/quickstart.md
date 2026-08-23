# Quickstart: Hufu↔LoopX Authority / Decision / Evidence 桥（仅设计）

要求：已安装 Node.js `>=22.19.0` 与 pnpm。不要安装 LoopX 发行包。不要在本票内调用尚不存在的桥 Adapter。

## 本票验收（设计）

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

预期：

- `tests/012-loopx-bridge-spec.test.ts` 通过
- `package.json` 版本仍为 `0.1.0`
- 任何 `package.json` 依赖字段不含 `loopx`
- CLI 与 `src/` 运行时未被本票改写

## 十分钟核对三端

打开下列合同，确认可过桥字段与本侧留守字段：

1. [contracts/authority.v1.md](./contracts/authority.v1.md) — `task_authority` 声明、`task_ref`、`AuthoritySnapshotRef`、不透明 `authority_scope_ref`
2. [contracts/decision.v1.md](./contracts/decision.v1.md) — 仅 `DecisionRef`（`decision_id` / `version` / `content_digest`）
3. [contracts/evidence.v1.md](./contracts/evidence.v1.md) — `evidence_ref`、绑定指针、三轴、`observed_at`
4. [contracts/stay-on-side.v1.md](./contracts/stay-on-side.v1.md) — grant 正文、Packet 正文、Receipt / Journal / 执行结果留守；LoopX 不得取代原生 Issue 生命周期，也不得从 Journal、Receipt 或执行结果反推或扩大授权
5. [contracts/008-non-promotion.v1.md](./contracts/008-non-promotion.v1.md) — `loopx-mechanisms` 仍只是须显式选用的机制记录口

本 kit 引用 ADR 0006 与 #50，并证明自己是第 (2) 类桥。Status 为 design + implementation-authorized（#58 / ADR 0007）；本波仍不交付 Adapter。

## 明确不要做的验证

- 不要运行尚不存在的 `hufu bridge` 或新 CLI 标志
- 不要把 `decide --engine` 解释为本桥已启用
- 不要为了对拍而安装 `loopx` 或复制上游源码
- 不要把本目录当成 Adapter 开工令

## 未来实现 PR（#58）

#58 已获 ADR 0007 授权。实现 PR 必须按 `tasks.md` **第一条**编写会失败的 Adapter 测试。本波到设计约束测试通过即结束。

## #68 RunOnce Consumer 定向验收

```bash
pnpm exec tsc
node --test dist/tests/loopx-run-once.test.js dist/tests/loopx-bridge.test.js
```

预期：默认 bridge disabled；qualified `BridgeActivationReceipt` 后 Plan 绑定真实
`ExecutionEnvelopeRef` / `SessionBindingRef`；public-safe fake port 最多执行一次；独立 Validator、
readback 与 Receipt 完整前 `next_allowed` 不成立；失败、超时、重复 Turn 和重启均不盲重试。

部署侧可把显式 wrapper 路径绑定到 `runtime_locator_ref`，但本仓测试不调用真实 wrapper、
不安装 LoopX，也不自行启动常驻循环。
