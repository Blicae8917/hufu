# Quickstart: LoopX 第一批机制接入

要求：已安装 Node.js `>=22.19.0` 与 pnpm。不要在仓库根目录做连接。不要安装 LoopX 发行包。

## 门禁

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

门禁使用 `tests/fixtures/engine/` 与既有决策夹具，不打真实网络，不执行外部效果。

## 未选用对照

在空临时目录按 #6 快速开始连接、记下裁决、附加信封并空缺口确认。`status` 的 `task_authority` 仍为本机或投影正本；`engine` 槽为数据不足。不得出现 `engine_no_progress`。

## 显式选用（实现完成后）

```bash
pnpm --dir <repo> hufu decide --actor human:alice --engine engine.json
pnpm --dir <repo> hufu decide --actor human:alice --result result.json
pnpm --dir <repo> hufu status
```

`engine.json` 仅为 `{ "engine_id": "loopx-mechanisms" }`。`result.json` 必须引用当前信封，`kind` 为合同枚举之一，不得含 `goal_id`。

预期：

- `--engine` 返回 `engine_id=loopx-mechanisms`，`status.task_authority` 不变
- `--result` 返回 `result_id` 与 `kind`
- `status` 的 `engine` / `typed_result` 为观测槽，不含裁决正文
- 把 `--task-authority loopx` 用于 `connect` 必须失败

## 回执与读回

```bash
pnpm --dir <repo> hufu decide --actor human:alice --receipt receipt.json
```

回执只能声明 `ok` 与证据引用。耐久效果仍用 `decide --effect`，且无完整读回不得写成已发生。

## 无进展

当读回确认无耐久效果、且最后一条类型化结果不是 `progress` 时，`status` 的 `execution_guardrails` 含 `engine_no_progress`；`handoff` 不得给出沿旧信封的新前向步骤。
