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

## 4. 原设计波与当前实现边界

- **Decision**: 原设计波只落地 kit；#57 后续实现库级 Provider，#66 再以 RED→GREEN 收紧 production binding。两者都只使用 fake transport，不执行真实 HTTP 写。
- **Rationale**: 把“代码具备端口”与“真实项目已经授权执行”分开。
- **Alternatives considered**: 注入 fetch 即视为授权（拒绝）。

## 5. 版本与发布

- **Decision**: 保持 `0.1.0`。不 npm-publish。CHANGELOG 只在 Unreleased 记一条授权落地。
- **Rationale**: 指挥官禁止升版本。

## 6. Production execute grant

- **Decision**: `fetch` 只提供 transport。`execute` 额外要求 owner-local `ProductionExecuteGrantRef`，并核对当前 Ledger grant id + revision；prepared 记录该引用。
- **Rationale**: 防止测试缝或任意依赖注入静默升级成真实写权。

## 7. Exact refs 与 allowlist

- **Decision**: 五个稳定引用必须落在同一 Ledger decision/envelope/task/actor 链；读 allowlist 必须参与判断。字符串 origin 不授权 execute，exact allowance 精确到 target、kind、label 或 assignee。
- **Rationale**: origin 级允许无法防止错项目、错票、错动作或错负责人。

## 8. 六状态互斥

- **Decision**: 不硬编码产品标签名；owner-local profile 以六条 exact label allowance 注入。转换时 add 目标并 remove 当前其他受管标签，readback 同时核验二者。
- **Rationale**: GitLab add-only 会留下两个互斥状态。

## 9. 关闭证据

- **Decision**: boolean 废止为授权证据；关闭必须携带 `acceptance_evidence_refs` 与其中的 `acceptance_matrix_ref`，并在当前 decision 证据中真实存在。
- **Rationale**: 调用方自报 `true` 不是验收事实。

## 10. Prepared 恢复

- **Decision**: 恢复先 readback。目标已存在只做收尾；目标未实现时重新核验 exact source revision，变化即停车。
- **Rationale**: 既避免断线后重复写，也避免在外部状态已变化时继续旧计划。
