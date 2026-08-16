# 变更日志

本文件记录项目中所有值得关注的变更。

## [0.1.0] - 未发布

### 新增

- 中文产品规范、架构说明、Constitution、ADR 0001–0005 与上游兼容性基线的候选设计正本。
- 零 Cordis 依赖的严格 TypeScript ESM 领域核心骨架，以及与 `0.0.1` 对齐的 `hufu validate`。
- 本机 `local` JSONL 账本与有界命令 `connect` / `doctor` / `status` / `handoff` / `decide`，
  以及由回放得到的三轴 CurrentView。
- 本公开仓 GitHub 只读投影：显式 `status --refresh` 才联网，失败保留旧观测，不写回议题。
- 零拷贝决策流：一份 `DECISION_PACKET` 只完整保存一次；信封、路线确认、三类增量与交接只传引用；
  非空 `added_scope` 得到 `scope_change_required` 且不扩权；语义重基护栏只在既有命令边界同步求值。
- DeepSeek 原生插件包 `hufu-dsh`：隔离 Profile 真装真卸；六工具调用领域函数；与独立 CLI 对同一事件夹具
  折叠结构相等的 CurrentView；缺失墙钟/Token/Session/Run 不得写成 `0`；契约测试声明 `@deepseek-ai/cordis`。
- GitLab 只读投影：显式 `status --refresh` 才联网，失败保留旧观测，不写回议题，不绑定真实客户项目。
- GitHub Actions 在 `main` 推送和 Pull Request 上运行 `pnpm test`、
  `node scripts/check-version.mjs` 与 `git diff --check`。

### 变更

- 发行包名由 `hufu-console` 改为 `hufu`。
- 当前工作基线由 Python 迁到 Node.js / pnpm；主线门禁改为 `pnpm test`、
  `node scripts/check-version.mjs` 与 `git diff --check`。
- `0.0.1` Python 实现从主线移除，历史由标签 `v0.0.1` 保留。
- `0.1.0` 发布门在设计上收敛为只读影子纵切（四个有界命令、`local` 与本仓库 GitHub
  只读投影、三轴 CurrentView）。四个发布门命令、本机账本与本仓 GitHub 只读投影已交付；
  零拷贝决策流已由后续 Module #6 在同一版本系列交付；DeepSeek 原生插件路径已由 Module #7 交付；
  GitLab 只读投影已由 Module #8 交付。会商仍由后续 Module 交付。

## [0.0.1] - 2026-08-13

- 建立最初的本地开源项目骨架：最小 `TaskEnvelope` 合同、本地验证 CLI
  和无运行时依赖的测试。
