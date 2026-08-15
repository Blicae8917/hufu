# 声明与设计参考

Hufu 是原创作品，初始实现未包含第三方源代码。

项目架构参考了下列项目公开记录的设计模式：

- [LoopX](https://github.com/huangruiteng/loopx)，MIT License，研究基线为提交
  `152cbe404a7507a754e5c0f566a3c3c379d7a8ca`：持久 Goal、Evidence、因果 Journal、
  类型化 Receipt，以及 Agent、Capability、Provider 与 Kernel 职责分离。
- [OpenAI Symphony](https://github.com/openai/symphony)，Apache License 2.0，研究基线为提交
  `8001b52e3062495a16e520e4ceaf8f9de868c4d0`：Issue 驱动的隔离 Workspace 和可观察 Run 生命周期。
- [Agent2Agent Protocol](https://github.com/a2aproject/A2A)，Apache License 2.0，研究基线为提交
  `7e74147c02543cb9df0b25c1f1d021c9fd789c34`：可互操作的 Agent Task、Message 和 Artifact。
- [AG-UI](https://github.com/ag-ui-protocol/ag-ui)，MIT License，研究基线为提交
  `31265ecc0cd485bc9f96266527d30f7344ef76e1`：基于 Event 的 Agent 与用户界面通信。
- [DBOS Transact for Python](https://github.com/dbos-inc/dbos-transact-py)，MIT License，研究基线为提交
  `bfb1d785a60909da2c213cc626b3471601edc292`：持久 Workflow 身份和恢复模式。

对这些项目的引用只表示设计研究，其名称和许可证不代表认可或背书。
