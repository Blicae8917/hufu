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

版本 `0.0.1` 提供：

- 最小 `TaskEnvelope` 合同；
- `native` 和 `external` 两类任务来源；
- 显式授权范围和终止条件；
- 零运行时依赖的验证命令；
- 不包含 scheduler、数据库、网络调用或外部副作用。

当前版本**尚未**提供 Web Console、持久 Run 引擎、Issue 跟踪器适配器、Agent Runner、
Receipt 存储或自动恢复。

`0.1.0` 正在进行中文产品与架构正本收敛。其发布门是一个本机可用的只读影子纵切：
零 Cordis 依赖的严格 TypeScript 核心、`connect`、`doctor`、`status`、`handoff` 四个有界命令、
`local` JSONL 正本与本仓库 GitHub 只读投影，以及能区分事实来源、可用性和时效的 CurrentView。

零拷贝决策传递、DeepSeek Harness 原生 Profile、GitLab 只读投影、LoopX Engine、关键决策会商、
loopback Web Console 和出站 Runtime 是已接受方向，由发布门之后的独立 Module 分别交付，
不阻塞 `0.1.0` 发布。合同细节见[产品规范](docs/SPEC.md)与[架构决策](docs/adr/)。
该范围尚未通过设计 Pull Request 接受，也不表示已经实现。

## 当前基线快速开始

以下命令只对应已经实现的 `0.0.1` Python 合同基线，不代表 `0.1.0` 目标技术栈已经完成。
要求：Python 3.11 或更高版本。运行时依赖：无。

```powershell
$env:PYTHONPATH = "$PWD\src"
py -3 -m hufu validate examples/task.json
py -3 -m unittest discover -s tests -v
py -3 scripts/check_version.py
```

在 POSIX shell 中：

```bash
PYTHONPATH=src python3 -m hufu validate examples/task.json
python3 -m unittest discover -s tests -v
python3 scripts/check_version.py
```

验证成功时会输出紧凑的 JSON 摘要。输入无效时退出码为 `2`，合同错误写入 stderr。

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

当前开发版本是尚未发布的 `0.1.0`；最近的历史发布基线是 `0.0.1`。
这是一个早期、合同优先的构建。公共 API 在 `1.0.0` 前可能发生变化。
当前仓库尚未实现 Cordis、DeepSeek Harness Plugin、Standalone Profile、LoopX Engine、关键决策会商、
零拷贝决策传递或远端 Provider，默认不启用任何远端集成。

## 参与贡献与安全

提交变更前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 报告。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)。
