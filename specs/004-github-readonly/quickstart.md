# Quickstart: 本仓 GitHub 只读投影

要求：已安装 Node.js `>=22.19.0` 与 pnpm。不要在仓库根目录做连接。

## 门禁（无真实网络）

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

## 本机连接（不联网）

在空临时目录：

```bash
pnpm --dir <repo> hufu connect --project-id hufu --repository https://github.com/Blicae8917/hufu --task-authority github --commander human:alice --grant-scope "read-only projection and handoff"
pnpm --dir <repo> hufu doctor
pnpm --dir <repo> hufu status
```

此时 `status` 应成功、不上网、工作项为数据不足。

将 `HUFU_DENY_NETWORK=1` 写入环境可禁止真实 `fetch`（测试注入的 Port 不受影响）。
被拒绝或超时时映射 `OBSERVATION_UNAVAILABLE`，保留旧观测；只读 GET 超时固定为 10 秒（`FETCH_TIMEOUT_MS = 10_000`），不得依赖环境默认，也不得把缺失写成 `0`。

## 显式刷新

实现完成后：

```bash
pnpm --dir <repo> hufu status --refresh
```

门禁测试使用夹具，不依赖这一步。维护者若对真实 GitHub 执行刷新：失败时只说明观测不可用，不得把失败写成「零议题」。

## 交接

刷新（或夹具写入缓存）后：

```bash
pnpm --dir <repo> hufu handoff --work-item github:Blicae8917/hufu#4 --completed "spec drafted" --remaining "implement after accept"
```

不得关闭 GitHub 议题。
