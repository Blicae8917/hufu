# Notices and design influences

Hufu is original work. No third-party source code is included in the initial implementation.

The architecture was informed by publicly documented patterns from these projects:

- [LoopX](https://github.com/huangruiteng/loopx), MIT License, inspected at commit `152cbe404a7507a754e5c0f566a3c3c379d7a8ca`: durable goals, evidence, causal journals, typed receipts, and separation of agents, capabilities, providers, and kernel responsibilities.
- [OpenAI Symphony](https://github.com/openai/symphony), Apache License 2.0, inspected at commit `8001b52e3062495a16e520e4ceaf8f9de868c4d0`: issue-driven isolated workspaces and observable run lifecycles.
- [Agent2Agent Protocol](https://github.com/a2aproject/A2A), Apache License 2.0, inspected at commit `7e74147c02543cb9df0b25c1f1d021c9fd789c34`: interoperable agent tasks, messages, and artifacts.
- [AG-UI](https://github.com/ag-ui-protocol/ag-ui), MIT License, inspected at commit `31265ecc0cd485bc9f96266527d30f7344ef76e1`: event-based agent/user-interface communication.
- [DBOS Transact for Python](https://github.com/dbos-inc/dbos-transact-py), MIT License, inspected at commit `bfb1d785a60909da2c213cc626b3471601edc292`: durable workflow identity and recovery patterns.

References to these projects indicate design study only. Their names and licenses do not imply endorsement.
