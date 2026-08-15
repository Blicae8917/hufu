# Quickstart: 002-ts-core-baseline

用于验证本模块是否交付成功。不替代 `tasks.md` 中的实现步骤。

## 前提

- Node.js `>=22.19.0`
- pnpm（版本以根目录 `package.json` 的 `packageManager` 为准）
- Windows 或 POSIX

## 当前主线（本模块合并后）

```bash
pnpm install
pnpm test
node scripts/check-version.mjs
git diff --check
pnpm hufu validate examples/task.json
```

期望：

- 测试全部通过
- 版本检查打印 `0.1.0`
- `validate` 退出码 0，stdout 含 `"valid": true` 与样例 `task_id`
- `pnpm hufu connect`、`doctor`、`status`、`handoff` 均为非 0 退出，且工作区不出现 `.hufu/`

非法样例（缺 `objective` 的 JSON 文件）必须退出码 2，stderr 含 `objective`。

README 快速开始、AGENTS 与 Constitution 中的门禁命令必须与上面三行门禁一致，且不得再要求 Python。

## 历史标签

```bash
git checkout v0.0.1
```

按该标签内 README 运行当时的 Python 验证。期望：测试通过，信封校验成功。然后回到本模块分支继续工作。

若 `v0.0.1` 不存在，本模块尚未满足 FR-003，不得合并。
