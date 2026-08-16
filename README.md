# Hufu（虎符）

Hufu 是一个 Cordis-first、供应商中立的 AI Agent 工作协调插件系统，不会创建第二套事实正本。
“虎符”这个名字来自中国古代用于证明命令确实获得授权的信物。

项目从一项刻意收窄的能力起步：验证持久任务信封，把目标、项目、授权范围、终止条件和来源绑定在一起。
外部任务系统仍然是其自身任务状态的权威来源。

## 为什么需要 Hufu

Agent 工作经常分散在 Issue 跟踪器、聊天会话、命令输出和交接记录中，导致四个基本问题难以回答：

- 精确目标是什么？
- Agent 被允许修改什么？
- 哪些证据能够证明结果？
- 运行失败后应该从哪里恢复？

Hufu 通过稳定合同和适配器回答这些问题，同时避免要求用户手工维护一套平行工作流。

本仓库的第一读者是维护者自身的交付工作流，文档正本默认使用简体中文；
出现真实的外部可安装插件用户后，才补充英文入口。

## 当前范围

当前开发版本 `0.1.0` **已经实现**：

- 零 Cordis 依赖的严格 TypeScript ESM 领域核心骨架；
- 与 `0.0.1` 对齐的最小 `TaskEnvelope` 合同（`native` / `external`）；
- `hufu validate`：合法信封输出键排序 JSON 摘要，非法输入退出码 `2`；
- 本机 `local` JSONL 账本，以及有界命令 `connect` / `doctor` / `status` / `handoff` / `decide`；
- 本公开仓 GitHub 只读投影（`status --refresh` 才联网，默认读缓存）；
- GitLab 只读投影（操作者声明的 `group/project`，同样仅显式刷新联网，不写回议题）；
- 由账本与投影缓存回放得到的三轴 CurrentView（来源类别、可用性、时效）；
- 零拷贝决策流：一份裁决只完整保存一次，下游只传引用、摘要与增量；`status` / `handoff` 不复制裁决正文；
- DeepSeek 原生插件包 `hufu-dsh`：隔离 Profile 可装可卸，六工具调用同一领域函数，与独立 CLI 对同一夹具折叠结构相等的 CurrentView；
- 一套当前有效的 pnpm / Node 门禁。

当前版本**尚未**提供关键决策会商、网页界面或出站 Runtime。
GitHub 正本仅接受本公开仓；GitLab 正本接受可解析的两段 `group/project`，且都不写回议题。

`0.1.0` 的发布门是一个本机可用的只读影子纵切：四个有界命令、`local` JSONL 正本与本仓库
GitHub 只读投影。零拷贝决策流与 DeepSeek 原生插件已由后续 Module（GitHub #6 / #7）在同一 `0.1.0`
系列交付，仍不阻塞发布门。LoopX Engine、关键决策会商、loopback Web Console
和出站 Runtime 仍是已接受方向，由独立 Module 分别交付。合同细节见[产品规范](docs/SPEC.md)与[架构决策](docs/adr/)。

## 当前基线快速开始

要求：Node.js `>=22.19.0`，pnpm（版本见根目录 `package.json` 的 `packageManager`）。
独立 CLI 运行时依赖：无。DeepSeek 插件包 `hufu-dsh` 依赖 `@deepseek-ai/cordis@4.0.1`。

```bash
pnpm install
pnpm test
node scripts/check-version.mjs
git diff --check
pnpm hufu validate examples/task.json
```

同一套门禁由 GitHub Actions 在 `main` 推送和 Pull Request 上自动运行。

验证成功时会输出紧凑的 JSON 摘要。输入无效时退出码为 `2`，合同错误写入 stderr。

在空的临时工作目录中试用本机账本（把 `<repo>` 换成 Hufu 仓库路径，不要把本机绝对路径写进仓库文档）：

```bash
pnpm --dir <repo> hufu connect --project-id demo --repository https://example.com/demo.git --task-authority local --commander human:alice --grant-scope "local ledger and handoff"
pnpm --dir <repo> hufu doctor
pnpm --dir <repo> hufu status
```

成功时标准输出是一个 JSON 对象。`connect` 会在该工作目录写下 `.hufu/ledger/events.jsonl`（已 gitignore）。
`validate` 仍可按上面的例子使用。

本机工作项打开后，可用 `hufu decide` 记下裁决、附加信封、提交路线确认或追加增量。载荷为 JSON 文件，
字段见 `specs/005-zero-copy-decision/`。`status` 与 `handoff` 只暴露 `decision_id` / 版本 / 摘要，
不复制目标或验收正文。`decide` 不联网。

### DeepSeek 原生插件（隔离 Profile）

不要改本机默认 `~/.dsh`。若已安装 `dsh`，使用隔离主目录：

```bash
export DSH_HOME=<empty-temp-home>
dsh plugin --profile hufu-fixture add <repo>/packages/hufu-dsh
```

无 `dsh` 时，以 `pnpm test` 中的隔离 Bundle 契约测试为准：真装真卸走同一契约的临时 Profile 与 `@deepseek-ai/cordis` mount/dispose，不把 `dsh` 二进制当门禁硬依赖。

卸载只撤销运行时 Effect，工作区 `.hufu/ledger` 仍在，独立 CLI `status` 仍能回放。

本公开仓 GitHub 正本（连接时不上网；查看默认读缓存）：

```bash
pnpm --dir <repo> hufu connect --project-id hufu --repository https://github.com/Blicae8917/hufu --task-authority github --commander human:alice --grant-scope "read-only projection and handoff"
pnpm --dir <repo> hufu status
pnpm --dir <repo> hufu status --refresh
```

GitLab 正本（连接时不上网；查看默认读缓存；门禁用夹具，不打真实 GitLab）：

```bash
pnpm --dir <repo> hufu connect --project-id demo --repository example-group/example-project --task-authority gitlab --commander human:alice --grant-scope "read-only projection and handoff"
pnpm --dir <repo> hufu status
```

## 历史 0.0.1

最初公开发布的 Python 基线已冻结为标签 `v0.0.1`。需要核对或复现当时验证时，检出该标签，
并**只使用该标签内文档**中的步骤：

```bash
git checkout v0.0.1
```

不要把标签内的 Python 命令当作当前主线门禁。

## 设计规则

项目不变量的唯一规范出处是 [Constitution](.specify/memory/constitution.md)，
跨领域决策见[架构决策记录](docs/adr/)。以下只是便于快速理解的非规范摘要：

- 一项事实只有一个权威所有者；外部任务系统保留其任务生命周期。
- 授权只来自人类 `commander` 的显式授予，不能从 Journal、Receipt 或历史运行反推。
- 一份裁决只完整保存一次，下游只传引用、digest 和增量。
- 缺失的观测显示 `unavailable`，不写成 `0`。
- 新基础设施必须证明净收益；连续三轮代表性试点无可解释净收益即停止扩充。

参见[产品规范](docs/SPEC.md)、[架构说明](docs/ARCHITECTURE.md)、
[架构决策](docs/adr/)、[上游兼容性基线](docs/COMPATIBILITY.md)和[历史计划指针](tasks/plan.md)。

## 项目状态

当前开发版本是尚未发布的 `0.1.0`；最近的历史发布基线是 `0.0.1`（标签 `v0.0.1`）。
这是一个早期、合同优先的构建。公共 API 在 `1.0.0` 前可能发生变化。
当前仓库已提供五个有界命令、本机账本、本公开仓 GitHub 只读投影、GitLab 只读投影、零拷贝决策流，以及 DeepSeek 原生插件路径；尚未实现
LoopX Engine、关键决策会商或远端 Provider，默认不启用写回或出站集成。

## 参与贡献与安全

提交变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 报告。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
