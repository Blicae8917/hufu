# Feature Specification: 上游漂移核对门禁

**Feature Branch**: `010-upstream-drift`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "GitHub Module Issue #27（M9）：把 docs/COMPATIBILITY.md 记录的上游 commit 与真实上游状态的一致性变为自动门禁。解析上游 commit 表，对每个上游执行 git ls-remote，漂移时非零退出。计数不得在浅克隆上取得。网络不可达、仓库不可解析、表格无法解析、记录值不是有效 commit 均 fail closed，缺失不得写成 0。HUFU_DENY_NETWORK=1 跳过须标未核对。不自动改 COMPATIBILITY.md，不升已接受基线，不用 GitHub API 凭据。"

**Parent Issue**: [#27](https://github.com/Blicae8917/hufu/issues/27)

**Parent Contract**: [docs/COMPATIBILITY.md](../../docs/COMPATIBILITY.md)（#25 订正后的事实表是本脚本的解析输入与首个基准）

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CI 核对记录 SHA 与公开 ref 是否仍一致 (Priority: P1)

维护者推送或开 PR 时，门禁读取 `docs/COMPATIBILITY.md` 的门禁核对表，对每个公开上游执行匿名 `git ls-remote`，把记录 SHA 与真实 ref 比对。一致则通过；不一致则失败并打印上游名、记录值、真实值、漂移说明和观测时间。

**Why this priority**: 假观测「提交未变」已经进过强制读物。没有自动核对，下游每次交付都会再继承一次。

**Independent Test**: 夹具表记录值等于注入的 ls-remote 结果时退出码 0；不等时非零退出且输出含两侧 SHA。

**Acceptance Scenarios**:

1. **Given** 门禁表有两个合法上游且注入的 ls-remote 与记录 SHA 相同，**When** 运行脚本，**Then** 退出码 0，不把距离写成 `0`。
2. **Given** 某一上游真实 SHA 与记录不同，**When** 运行脚本，**Then** 非零退出，输出含上游名、记录值、真实值、观测时间；漂移量不得为数字 `0`。
3. **Given** 脚本发现漂移，**When** 结束，**Then** 不得改写 `docs/COMPATIBILITY.md`，不得把已核对基线改成 HEAD。

---

### User Story 2 - 失败必须关闭，缺失不得冒充未漂移 (Priority: P1)

网络不可达、仓库不可解析或已删除、表格无法解析或字段缺失、记录值不是 40 位 commit，都必须 fail closed。不得静默通过，不得把缺失写成 `0`，不得推断「未漂移」。

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

`HUFU_DENY_NETWORK=1` 时跳过真实 ls-remote，必须显式标记「未核对」，不得标记为通过。

**Why this priority**: 与 GitHub/GitLab 只读端口同一开关语义；跳过若算通过，门禁会被关掉。

**Independent Test**: 该环境下退出码非 0，输出含「未核对」，不含「通过」。

**Acceptance Scenarios**:

1. **Given** `HUFU_DENY_NETWORK=1`，**When** 运行脚本，**Then** 不发起 ls-remote，输出「未核对」，非零退出。

### Edge Cases

- Cordis 行写的是 `vendor/cordis` 而不是 git 仓库，不得被当成可 ls-remote 的上游。
- 只比对门禁核对表中的 HEAD 观测，不得把「已核对基线」当成必须等于 `master`/`main` 的条件（基线允许落后）。
- `pnpm test` 不得访问真实上游网络。

## Requirements *(mandatory)*

- **FR-001**: 新增 `scripts/check-upstream-drift.mjs`，解析 `docs/COMPATIBILITY.md` 门禁核对表。
- **FR-002**: 对表中每个上游执行匿名 `git ls-remote`，只用公开 HTTPS URL，不使用 GitHub API、Token 或凭据。
- **FR-003**: 漂移、不可用、契约错误、未核对均非零退出。
- **FR-004**: 输出必须包含上游名、记录值、真实值（若取得）、漂移说明、观测时间。
- **FR-005**: 任何计数或距离缺失不得写成 `0`。
- **FR-006**: 接入 `.github/workflows/ci.yml`，与 `pnpm test`、`check-version.mjs`、`git diff --check` 并列。
- **FR-007**: 不自动修改 `docs/COMPATIBILITY.md`，不自动升级已接受基线。
- **FR-008**: 不新增常驻服务、定时任务、Daemon 或后台执行。

## Success Criteria *(mandatory)*

- **SC-001**: 在注入 ls-remote 的测试中，四种失败边界全部 fail closed。
- **SC-002**: CI 工作流包含该脚本且仍为 `contents: read`、无 secrets。
- **SC-003**: 本仓库 `pnpm test` 零真实上游网络。
