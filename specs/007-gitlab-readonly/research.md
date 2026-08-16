# Research: 007-gitlab-readonly

## 1. 网络与依赖

- **Decision**: 使用 Node 22 内置 `fetch` 对 GitLab REST 做 `GET`。不引入 GitLab SDK 或其他 HTTP 库。生产代码经 `GitLabPort` 接口；测试注入夹具 Port。`pnpm test` 禁止真实网络。默认 HTTP 实现只允许 `https://gitlab.com`。
- **Rationale**: Constitution VI 要求新依赖证明净收益；本模块只读若干公开 Issue 字段。Issue #8 已授权命令边界上的网络读取。禁止私有 Endpoint。
- **Alternatives considered**: `@gitbeaker/rest`（新运行时依赖）；`child_process` 调 `glab`（把本机登录态变成隐式凭据，禁止）；复用 `GitHubPort` 形状但共用同一文件（会把 GitLab 绑进 GitHub 专用规则，违反 FR-020）。

## 2. 项目身份与凭据

- **Decision**: 不绑定某一个真实 GitLab 项目。`connect --repository` 手填，必须解析为恰好两段 `group/project`。可接受 `group/project` 以及指向 `gitlab.com` 的常见 HTTPS/SSH 形式。解析后按输入字面保留路径大小写，比较时大小写敏感。嵌套组、GitHub 网址、`github:` 引用、自建 Host → `CONTRACT_INVALID` 或 `REPOSITORY_NOT_ALLOWED`。不读 git remote。不存储 token，不发送 `Authorization` 头。门禁夹具使用 `example-group/example-project`。
- **Rationale**: Issue #8 未指定真实项目；Constitution III 禁止客户项目名与私有 Endpoint。两段路径对齐已发布 `gitlab:<group>/<project>#<issue>` scheme。
- **Alternatives considered**: 支持嵌套组（scheme 无法无歧义判定，规格已拒绝猜测）；从 `git remote` 推断（M2 已拒绝）；使用 `GITLAB_TOKEN`（未授权凭据）；绑定本仓 GitHub 身份作为 GitLab 项目（错误宿主）。

## 3. 投影存放位置

- **Decision**: 成功刷新写入 `.hufu/cache/gitlab-projection.json`。GitHub 继续使用 `.hufu/cache/github-projection.json`。不把议题 open/close 追加为 `hufu/work_item.*`。刷新失败不删除该文件。读取时 `task_authority` 必须为 `gitlab`，条目必须能通过 `gitlab-ref` 解析。
- **Rationale**: SPEC 规定缓存位于 `.hufu/cache/`；按正本隔离避免 scheme 混用。ADR 0001 禁止把外部状态转换镜像成第二套账本生命周期。
- **Alternatives considered**: 与 GitHub 共用一个缓存文件（混用 scheme）；每条议题写账本事件（第二套生命周期）；把 GitLab 解析加进 `parseExternalRef`（FR-020 禁止）。

## 4. 刷新参数与既有正本兼容

- **Decision**: `hufu status --refresh` 在当前正本为 `gitlab` 或 `github` 时按各自 Adapter 成功。`local` 下 `--refresh`/`--pull`/`--online` 仍退出码 2。`connect`/`doctor`/`handoff`/`decide` 不接受刷新联网。本仓 GitHub 刷新合同保持 004。
- **Rationale**: SPEC 刷新策略；004 已对 GitHub 解除 M2 FR-014；本模块对 GitLab 做同样解除，对 local 保持。
- **Alternatives considered**: 所有正本都允许 `--refresh` 空成功；为刷新单开第五命令。

## 5. 议题集合与引用

- **Decision**: 刷新 GET `https://gitlab.com/api/v4/projects/<urlencoded group/project>/issues?state=all&per_page=100`。议题号使用项目内 `iid`。`external_ref` 必须生成为 `gitlab:<group>/<project>#<iid>`，且 group/project 等于已连接身份。丢弃 Merge Request（若列表项带 MR 专用字段或非 Issue 的 `type`）。列表不完整（截断或存在 next page）时集合槽 `data_insufficient` 或 freshness 非 `fresh`。不把 `description` / 评论写入 CurrentView / handoff / decide / next_action。
- **Rationale**: Issue 要求 scheme 与「正文不可信」；MR 不是本模块任务族；经典 Issue 是代表性集合。
- **Alternatives considered**: GraphQL（更复杂）；包含 MR（会把审查单当任务正本）；使用全局 `id` 而非 `iid`（与 `#456` 的项目内编号约定不符）；映射自由文本 `external_ref`（禁止猜测）。

## 6. 失败与时效

- **Decision**: 网络错误、非 2xx、无 JSON、配额耗尽 → 刷新命令失败（退出码 4，`OBSERVATION_UNAVAILABLE`），保留旧缓存；随后无刷新的 `status` 仍可成功，工作项时效为 `stale` 或 `unavailable`（无缓存则为数据不足）。`observed_at` 早于 `stale_after_hours`（默认 24）→ `stale`。GitLab 未给的数字字段不得写 `0`。
- **Rationale**: SPEC 失败保留旧观测；Constitution IV。
- **Alternatives considered**: 失败清空缓存（会像「没有议题」）；失败仍报 `fresh`（伪造时效）。

## 7. 只读证明与决策引用

- **Decision**: `GitLabPort` 仅 `listIssueProjections(project)`。HTTP 实现只允许 `GET`，不发送 `Authorization`。测试包装 fetch：任何非 GET 或写路径（POST/PATCH/PUT/DELETE、`/notes`、merge）失败测试。`work-item` 在 `gitlab` 正本下拒绝打开本机工作项。`handoff` 与 `decide --packet` 按当前 `task_authority` 分发到 `gitlab-ref` 或 `github-ref`；GitLab 正本下 `task_ref` 必须已在 GitLab 缓存且 scheme 不得为 `github:`。
- **Rationale**: 发布门之后模块仍要求适配器测试证明没有写回；ADR 0005 要求只传引用。
- **Alternatives considered**: 运行后再扫日志（不可靠）；依赖 GitLab 权限只读（本模块无 token，仍需代码层锁死）；让 `parseExternalRef` 同时接受两种 scheme（会把 GitLab 绑进 GitHub 本仓规则）。
