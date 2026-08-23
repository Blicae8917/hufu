# Research: 013-gitlab-mutation

## 1. 独立写端口

- **Decision**: 不把写方法加到只读 `GitLabPort`。新增 `GitLabTaskMutationProvider`。
- **Rationale**: #8 / #53 只读合同已验收；混在同一端口会静默扩权。
- **Alternatives considered**: 给只读端口加可选 write 标志（拒绝）。

## 2. 五种 kind

- **Decision**: 第一版仅 `append_comment`、`transition_managed_status_label`、`set_assignee`、`close_issue`、`reopen_issue`。
- **Rationale**: 指挥官授权清单。删除、改正文、透传、MR 仍禁止。
- **Alternatives considered**: 通用 GitLab SDK 包装（拒绝）。

## 3. HTTP 写例外

- **Decision**: 只读 allowlist 不授权 HTTP 写。须本机 `transport_security_exception_ref`。例外正文不入库。公开示例为 `https://gitlab.example.com`、`http://192.0.2.10:41101`、`http://gitlab.example.com:41101`。
- **Rationale**: Constitution III 与指挥官传输安全约束。
- **Alternatives considered**: 复用只读 HTTP 允许清单（拒绝）。

## 4. 本波不实现

- **Decision**: 本波只落地 kit 与通过的约束测试。失败 Adapter 测试留给 #57 实现 PR。
- **Rationale**: 指挥官本波禁止 mutation HTTP POST/PUT。Constitution VII 的先红后绿适用于后续实现 PR。
- **Alternatives considered**: 本波先红 Adapter 测试（会破坏 CI）。

## 5. 版本与发布

- **Decision**: 保持 `0.1.0`。不 npm-publish。CHANGELOG 只在 Unreleased 记一条授权落地。
- **Rationale**: 指挥官禁止升版本。
