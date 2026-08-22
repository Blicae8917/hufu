# Quickstart: GitLab 只读投影

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
pnpm --dir <repo> hufu connect --project-id demo --repository example-group/example-project --task-authority gitlab --commander human:alice --grant-scope "read-only projection and handoff"
pnpm --dir <repo> hufu doctor
pnpm --dir <repo> hufu status
```

此时 `status` 应成功、不上网、工作项为数据不足。

将 `HUFU_DENY_NETWORK=1` 写入环境可禁止真实 `fetch`（测试注入的 Port 不受影响）。
只读 GET 超时固定为 10 秒（`FETCH_TIMEOUT_MS = 10_000`）。

也接受 `https://gitlab.com/example-group/example-project` 作为 `--repository`。GitHub 网址或自建 Host 必须被拒绝。

## 显式刷新

实现完成后：

```bash
pnpm --dir <repo> hufu status --refresh
```

门禁测试使用夹具，不依赖这一步。维护者若对真实公开 `gitlab.com` 项目执行刷新：失败时只说明观测不可用，不得把失败写成「零议题」。不要配置 token。

## 交接与裁决

刷新（或夹具写入缓存）后：

```bash
pnpm --dir <repo> hufu handoff --work-item gitlab:example-group/example-project#456 --completed "spec drafted" --remaining "implement after accept"
```

`decide --packet` 的 `task_ref` 必须是同一缓存引用。不得关闭 GitLab 议题。
