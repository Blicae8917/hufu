# Feature Specification: 上游漂移核对门禁

**Feature Branch**: `010-upstream-drift`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "GitHub Module Issue #27（M9）：把 docs/COMPATIBILITY.md 记录的上游 commit 与真实上游状态的一致性变为自动门禁。解析上游 commit 表，对每个上游执行 git ls-remote，漂移时非零退出。计数不得在浅克隆上取得。网络不可达、仓库不可解析、表格无法解析、记录值不是有效 commit 均 fail closed，缺失不得写成 0。HUFU_DENY_NETWORK=1 跳过须标未核对。不自动改 COMPATIBILITY.md，不升已接受基线，不用 GitHub API 凭据。"

**Parent Issue**: [#27](https://github.com/Blicae8917/hufu/issues/27)

**Amendment**: [#41](https://github.com/Blicae8917/hufu/issues/41) 把单一「HEAD ≠ 记录即失败」拆成 `static` / `observe` / `release`。

**Parent Contract**: [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md)（#25 订正后的事实表是本脚本的解析输入与首个基准）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 普通 CI 只核静态完整性；HEAD 观测与发布完整性分模式 (Priority: P1)

维护者推送或开 PR 时，默认 `--mode=static` 只解析门禁核对表并核记录 SHA 形态，不查询实时上游 HEAD。定时或人工 `--mode=observe` 才对每个公开上游执行匿名 `git ls-remote`；HEAD 前进输出类型化 `drift`（退出 0），只表示需再观察，不自动推断不兼容。发布前 `--mode=release` 核不可变 tag 是否仍指向记录 SHA，或无 tag 时记录 commit 是否仍从已接受 ref 可达；单纯 HEAD 前进不阻塞发布。

**Why this priority**: 假观测「提交未变」已经进过强制读物，但把移动分支 HEAD 前进写成普通 PR 失败，会阻断与上游无关的交付（#41）。

**Independent Test**: 静态模式不调用 ls-remote 且 HEAD 前进不失败；observe 在 SHA 不等时退出 0 且 `incompatibility: false`；release 在 tag 移动或 commit 不可达时非零退出。

**Acceptance Scenarios**:

1. **Given** 门禁表有两个合法上游，**When** 以 `static`（默认）运行，**Then** 退出码 0，不查询实时 ref，不把距离写成 `0`。
2. **Given** 某一上游真实 SHA 与记录不同且 mode 为 `observe`，**When** 运行脚本，**Then** 退出码 0，`status` 为 `drift`，输出含上游名、记录值、真实值、观测时间；不得写成不兼容；漂移量不得为数字 `0`。
3. **Given** 脚本发现漂移，**When** 结束，**Then** 不得改写 `docs/COMPATIBILITY.md`，不得把已核对基线改成 HEAD。
4. **Given** 不可变 tag 的实时 SHA 与记录不同且 mode 为 `release`，**When** 运行，**Then** 非零退出，`status` 为 `tag_moved`。
5. **Given** 分支 HEAD 已前进但记录 commit 仍可达且 mode 为 `release`，**When** 运行，**Then** 退出码 0，`status` 为 `head_advanced`。

---

### User Story 2 - 失败必须关闭，缺失不得冒充未漂移 (Priority: P1)

表格无法解析或记录值不是 40 位 commit，在所有 mode 都必须 fail closed。`observe` / `release` 下网络不可达或仓库不可解析必须报告 `unavailable` 并非零退出。`static` 不因外部网络不可用失败。不得静默把缺失写成 `0`，不得把 `drift` 写成不兼容。

**Why this priority**: Issue 初版因浅克隆写错过数字。Constitution IV / VIII 禁止用 `0` 冒充未观测。

**Independent Test**: 四种失败夹具均非零退出，输出为 `unavailable` 或契约错误，正文不含把距离当成 `0` 的声称。

**Acceptance Scenarios**:

1. **Given** ls-remote 网络失败，**When** 运行，**Then** 报告 `unavailable`，非零退出。
2. **Given** 仓库无法解析或远程删除，**When** 运行，**Then** 报告 `unavailable`，非零退出。
3. **Given** 门禁表缺失、缺列或无法解析，**When** 运行，**Then** 报告契约错误，非零退出。
4. **Given** 记录 SHA 不是有效 40 位十六进制 commit，**When** 运行，**Then** 报告契约错误，非零退出。
5. **Given** 实现若要计算 commit 距离且当前仓库是浅克隆，**When** 运行，**Then** 距离槽为 `data_insufficient`，MUST NOT 为 `0`。本模块默认只比对 ref 身份，不克隆上游历史。

---

### User Story 3 - 离线开关标成未核对而不是通过 (Priority: P1)

`HUFU_DENY_NETWORK=1` 时，`observe` / `release` 跳过真实 ls-remote，必须显式标记「未核对」，不得标记为通过。`static` 不查询网络，仍做表完整性，不得打印「通过」或「未核对」。

**Why this priority**: 与 GitHub/GitLab 只读端口同一开关语义；跳过若算通过，观测/发布门禁会被关掉。

**Independent Test**: observe/release 在该环境下退出码非 0，输出含「未核对」，不含「通过」；static 退出码 0 且不含「通过」。

**Acceptance Scenarios**:

1. **Given** `HUFU_DENY_NETWORK=1` 且 mode 为 `observe` 或 `release`，**When** 运行脚本，**Then** 不发起 ls-remote，输出「未核对」，非零退出。
2. **Given** `HUFU_DENY_NETWORK=1` 且 mode 为 `static`，**When** 运行脚本，**Then** 不发起 ls-remote，表合法则退出码 0，不得打印「通过」或「未核对」。

### Edge Cases

- Cordis 行写的是 `vendor/cordis` 而不是 git 仓库，不得被当成可 ls-remote 的上游。
- 门禁核对表记录的是 HEAD 观测，不得把「已核对基线」当成必须等于 `master`/`main` 的条件（基线允许落后）。
- 普通 PR 的 `static` 模式不得因实时 HEAD 前进或外部网络不可用而失败。
- `pnpm test` 不得访问真实上游网络。

## Requirements *(mandatory)*

- **FR-001**: 新增 `scripts/check-upstream-drift.mjs`，解析 `docs/COMPATIBILITY.md` 门禁核对表。
- **FR-002**: 对表中每个上游执行匿名 `git ls-remote`，只用公开 HTTPS URL，不使用 GitHub API、Token 或凭据。
- **FR-003**: 退出语义按 mode 区分：`static` 只对契约错误非零退出；`observe` 将 `drift` 作为观测（退出 0），`unavailable` / 契约错误 / 未核对非零退出；`release` 对 `tag_moved`、`unreachable`、`unavailable`、契约错误、未核对非零退出，单纯 HEAD 前进不失败。
- **FR-004**: 输出必须包含上游名、记录值、真实值（若取得；`static` 为 `not_queried`）、漂移说明、观测时间；`drift` / `head_advanced` 必须声明 `incompatibility: false`。
- **FR-005**: 任何计数或距离缺失不得写成 `0`。
- **FR-006**: 接入 `.github/workflows/ci.yml`：普通 `push`/`pull_request` 只跑 `--mode=static`，与 `pnpm test`、`check-version.mjs`、`git diff --check` 并列；实时观测放独立 `schedule` / `workflow_dispatch` 入口。不得用 `continue-on-error` 代替模式拆分。
- **FR-007**: 不自动修改 `docs/COMPATIBILITY.md`，不自动升级已接受基线。
- **FR-008**: 不新增 Hufu 运行时常驻服务、Daemon 或产品级 scheduler。允许 GitHub Actions 的 `schedule` / `workflow_dispatch` 作为观测入口。

## Success Criteria *(mandatory)*

- **SC-001**: 在注入 ls-remote 的测试中，四种失败边界全部 fail closed。
- **SC-002**: CI 工作流包含该脚本且仍为 `contents: read`、无 secrets。
- **SC-003**: 本仓库 `pnpm test` 零真实上游网络。
