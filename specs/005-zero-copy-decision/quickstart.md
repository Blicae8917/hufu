# Quickstart: 零拷贝决策流

要求：已安装 Node.js `>=22.19.0` 与 pnpm。不要在仓库根目录做连接。

## 门禁

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

门禁使用 `tests/fixtures/decision/`，不打真实网络，不执行外部效果。

## 本机最短路径（实现完成后）

在空临时目录。把 `<repo>` 换成 Hufu 仓库路径。

```bash
pnpm --dir <repo> hufu connect --project-id demo --repository https://example.com/demo.git --task-authority local --commander human:alice --grant-scope "local ledger and handoff"
```

测试与领域服务打开本机工作项后，写入 `packet.json`（字段见 data-model；`authority_scope_ref` 使用 `connect` 返回的 `grant_id` 与 `grant_revision`；`authoritative_state.task_ref` 为该工作项 id）。然后：

```bash
pnpm --dir <repo> hufu decide --actor human:alice --packet packet.json
pnpm --dir <repo> hufu decide --actor human:alice --envelope envelope.json
pnpm --dir <repo> hufu decide --actor human:alice --ack ack.json
pnpm --dir <repo> hufu status
pnpm --dir <repo> hufu handoff --work-item <id> --completed "decision recorded" --remaining "execute within grant"
```

预期：

- `decide --packet` 返回 `version=1` 与 `content_digest`
- `status` 的 `decision` 槽只有 id/版本/摘要；`execution_guardrails` 在空缺口确认后不含 `ack_required`
- `handoff` 的 `next_action_text` 含工作项与 `decision_id`，不含裁决目标/验收正文

## GitHub 正本

先按 M3 连接本仓并（测试里）写入投影缓存，再 `--packet`。`decide` 不得联网。`task_ref` 必须是缓存中的 `github:Blicae8917/hufu#n`。

## 范围缺口

`ack.json` 里 `added_scope` 非空且原因合法时，命令仍成功；`status` 出现 `scope_change_required`；授权修订不变。
