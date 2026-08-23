# Quickstart: 自建 GitLab AuthorityProvider（设计验收）

本页验收的是设计合同，不是 Adapter。不要在仓库根目录做 `hufu connect` 来「试用自建实例」——当前 CLI 仍按 007 拒绝自建 Host，这是已交付行为，本 Kit 不改变它。

## 门禁（无真实网络，无 Adapter）

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

期望：`tests/011-gitlab-authority-spec.test.ts` 通过；版本仍为 `0.1.0`。

## 10 分钟对照

1. 打开 `spec.md` 首页：应同时看到 ADR 0006、#49、类 (1)、以及「不是实现授权」。
2. 打开 `contracts/gitlab-authority.v1.md`：应能把「仍只读」与「进入 Authority」分开，且写回默认关闭。
3. 打开 `contracts/identity-auth-fail-closed.v1.md`：用示例 `https://gitlab.example.com`（示例）+ `example-group/example-project`（示例）走「允许声明」；把 `gitlab.com` 当作可写正本必须被拒绝。
4. 打开 `contracts/007-non-expansion.v1.md`：007 合同路径未被本票改写；`gitlab-instance:` 不得被 007 的 `gitlab:` 解析器接受。
5. 确认 `tasks.md` 的**第一条未来实现任务**是会失败的适配器测试，且那些测试文件尚未落地。

## 明确不要做的步骤

- 不要为了本 Kit 去改 `src/hufu/gitlab-ref.ts` 或 CLI。
- 不要配置 token，不要填写真实自建 URL。
- 不要把本页理解成已经可以写回议题。
- 不要关闭 #49 或编辑 #5。
