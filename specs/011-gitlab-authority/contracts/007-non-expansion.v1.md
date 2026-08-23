# 007 不扩张合同 v1

本文件锁定：`011-gitlab-authority` **不得**静默扩大已交付的 #8 / `specs/007-gitlab-readonly`。

## 007 保持不变的事实

下列行为在本设计 PR 之后仍然有效，且本 PR 不编辑 007 的 `spec.md` 或 `contracts/`：

1. `connect --task-authority gitlab` 只接受可解析为两段、且指向 `gitlab.com` 形状的身份。
2. 自建 Host、私有实例、嵌套组、GitHub 网址 → `REPOSITORY_NOT_ALLOWED` 或等价失败关闭。007 路径继续拒绝示例自建来源，包括 `https://gitlab.example.com`（示例）与 `http://192.0.2.10:41101`（示例）。
3. HTTP 实现 Host 仅 `gitlab.com`，仅 GET，不发送 `Authorization`。
4. `GitLabPort` 只有 `listIssueProjections`；测试锁死无写方法。
5. ExternalRef 仍是 `gitlab:<group>/<project>#<iid>`。

## 本 Kit 如何避免扩权

| 风险 | 合同 |
| --- | --- |
| 把自建 Host 教给 `gitlab-ref.ts` | 禁止。未来若实现自建引用，必须使用独立 `gitlab-instance:` 解析，007 解析器继续拒绝该前缀 |
| 把 007 端口加上写方法 | 禁止。写回另闸，且被 Constitution 挡住 |
| 在 007 spec 里改「私有实例一律拒绝」 | 本 PR 不编辑 007。运行时拒绝保持 |
| 把 `gitlab.com` 客户项目默认可写 | 明确拒绝，见身份合同 |
| 把本 Kit 解释成 007 的补丁版本 | 编号是 `011`，父合同仍是只读投影 |

## 验收探针（设计，不是本 PR 的失败测试）

未来实现票可以用以下探针证明「没有扩大 007」，但这些失败测试不得在本设计 PR 落地：

- 现有 `tests/gitlab-ref.test.ts` / `tests/gitlab-adapter.test.ts` 继续绿
- 输入示例自建来源 `https://gitlab.example.com/example-group/example-project`（示例）时，007 解析路径仍失败关闭
- `gitlab-instance:` 不被 `parseGitLabExternalRef` 接受

## 归类

不扩张 007 不等于复活 M10–M15，也不等于出站 Runtime。本票只设计 ADR 0006 类 (1)。
