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
- 一套当前有效的 pnpm / Node 门禁。

当前版本**尚未**提供 `connect`、`doctor`、`status`、`handoff`、本机账本、CurrentView、
GitHub / GitLab 投影、Cordis 插件运行时、关键决策会商、网页界面或出站 Runtime。
对这些产品命令的调用会明确失败，并且不会创建 `.hufu/`。

`0.1.0` 的发布门仍是一个本机可用的只读影子纵切：四个有界命令、`local` JSONL 正本与本仓库
GitHub 只读投影，以及能区分事实来源、可用性和时效的 CurrentView。该发布门由后续 Module 交付，
不表示本仓库已经实现。零拷贝决策传递、DeepSeek Harness 原生 Profile、GitLab 只读投影、
LoopX Engine、关键决策会商、loopback Web Console 和出站 Runtime 同样是已接受方向，
由发布门之后的独立 Module 分别交付。合同细节见[产品规范](docs/SPEC.md)与[架构决策](docs/adr/)。

## 当前基线快速开始

要求：Node.js `>=22.19.0`，pnpm（版本见根目录 `package.json` 的 `packageManager`）。
运行时依赖：无。

```bash
pnpm install
pnpm test
node scripts/check-version.mjs
git diff --check
pnpm hufu validate examples/task.json
```

验证成功时会输出紧凑的 JSON 摘要。输入无效时退出码为 `2`，合同错误写入 stderr。

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
当前仓库尚未实现 Cordis、DeepSeek Harness Plugin、四个产品协调命令、本机账本、
LoopX Engine、关键决策会商、零拷贝决策传递或远端 Provider，默认不启用任何远端集成。

## 参与贡献与安全

提交变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 报告。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
