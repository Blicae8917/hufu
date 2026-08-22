# Research: 004-github-readonly

## 1. 网络与依赖

- **Decision**: 使用 Node 22 内置 `fetch` 对 GitHub REST 做 `GET`。不引入 Octokit 或其他 HTTP 库。生产代码经 `GitHubPort` 接口；测试注入夹具 Port。`pnpm test` 禁止真实网络。
- **Rationale**: Constitution VI 要求新依赖证明净收益；本模块只读若干公开 Issue 字段，SDK 过重。Issue #4 已授权命令边界上的网络读取。
- **Alternatives considered**: `@octokit/rest`（新运行时依赖与更大表面）；`child_process` 调 `gh`（把本机登录态变成隐式凭据，禁止）；在 M2 就预留空 `--refresh`（会伪造已刷新）。

## 2. 本仓身份与凭据

- **Decision**: 代表性仓库固定为 `Blicae8917/hufu`（owner/repo 大小写不敏感）。`connect --repository` 手填，解析 HTTPS/SSH 常见形式；解析失败或不是本仓 → `CONTRACT_INVALID` 或 `TASK_AUTHORITY_UNSUPPORTED`。不读 git remote。不存储 token，不发送 `Authorization` 头。
- **Rationale**: 任务单是「本仓」投影并用本项目验证；零凭据避免把秘密写进仓库或运行态。
- **Alternatives considered**: 支持任意公开仓（超出发布门与验证范围）；从 `git remote` 推断（M2 已拒绝）；使用 `GITHUB_TOKEN`（未授权凭据）。

## 3. 投影存放位置

- **Decision**: 成功刷新写入 `.hufu/cache/github-projection.json`（JSON 对象，含 `observed_at`、`source_revision` 或等价、工作项数组）。不把议题 open/close 追加为 `hufu/work_item.*`。刷新失败不删除该文件。
- **Rationale**: SPEC 规定缓存位于 `.hufu/cache/`，属可重建派生；ADR 0001 禁止把外部状态转换镜像成第二套账本生命周期。
- **Alternatives considered**: 每条议题写账本事件（第二套生命周期）；把缓存放进 ledger JSONL（污染全序与幂等）。

## 4. 刷新参数与 local 兼容

- **Decision**: `hufu status --refresh` 仅当当前正本为 `github` 时成功。`local` 下 `--refresh`/`--pull`/`--online` 仍退出码 2。`connect`/`doctor`/`handoff` 不接受刷新联网。
- **Rationale**: SPEC 刷新策略；M2 FR-014 由本模块对 GitHub 正本解除，对 local 保持。
- **Alternatives considered**: 所有正本都允许 `--refresh` 空成功；为刷新单开第五命令。

## 5. 议题集合与引用

- **Decision**: 刷新 GET 本仓 Issues 列表，丢弃带 `pull_request` 的项。`external_ref` 必须能生成为 `github:Blicae8917/hufu#<n>`（owner 规范化为本仓大小写不敏感匹配后的规范 owner/repo）。列表不完整（截断）时集合槽 `data_insufficient` 或 freshness 非 `fresh`。不把 `body` 写入 CurrentView/handoff/next_action。
- **Rationale**: Issue 要求 scheme 与「正文不可信」；PR 不是本模块任务族。
- **Alternatives considered**: GraphQL（更复杂）；包含 PR（会把审查单当任务正本）；映射自由文本 `external_ref`（禁止猜测）。

## 6. 失败与时效

- **Decision**: 网络错误、非 2xx、无 JSON、配额耗尽、以及超过固定 `FETCH_TIMEOUT_MS = 10_000`（10 秒）的挂起连接 → 刷新命令失败（退出码 4，`OBSERVATION_UNAVAILABLE`），保留旧缓存；随后无刷新的 `status` 仍可成功，工作项时效为 `stale` 或 `unavailable`（无缓存则为数据不足）。`observed_at` 早于 `stale_after_hours`（默认 24）→ `stale`。GitHub 未给的数字字段不得写 `0`。超时不得依赖环境默认或无限等待。`HUFU_DENY_NETWORK=1` 禁止真实 `fetch`（注入 Port 除外）。
- **Rationale**: SPEC 失败保留旧观测；Constitution IV。
- **Alternatives considered**: 失败清空缓存（会像「没有议题」）；失败仍报 `fresh`（伪造时效）。

## 7. 只读证明

- **Decision**: `GitHubPort` 仅 `listIssueProjections()`。HTTP 实现只允许 `GET`。测试包装 fetch：任何非 GET 或写路径（`/comments`、PATCH、PUT、POST、DELETE）失败测试。`work-item` 在 `github` 正本下拒绝打开本机工作项。
- **Rationale**: 发布门「适配器测试证明没有写回」。
- **Alternatives considered**: 运行后再扫日志（不可靠）；依赖 GitHub 权限只读（本模块无 token，仍需代码层锁死）。
