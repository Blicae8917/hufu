# Research: 014-codex-native-host

## 1. 核心不创建 Session

- **Decision**: Hufu 只发 action packet。Session 由正在运行的 Codex Consumer 经宿主原生工具创建。
- **Rationale**: 指挥官明确禁止 Hufu 成为 Session 工厂；也禁止 CLI 文本包装冒充等价能力。
- **Alternatives considered**: 独立 daemon 自行 `codex exec`（拒绝为静默回退）。

## 2. 能力三分

- **Decision**: Codex CLI exec/resume、app-server managed thread、Desktop 可见任务分别声明，并做 declared / observed / qualified 检查。
- **Rationale**: Claude / DSH / Codex 不等价。
- **Alternatives considered**: 一个「Host Runtime」笼统能力（拒绝）。

## 3. 本波不实现

- **Decision**: 只落地 kit 与通过的约束测试。
- **Rationale**: 指挥官禁止本波 Codex thread 调用。
- **Alternatives considered**: 本波写失败 Runtime 测试（会破坏 CI）。
