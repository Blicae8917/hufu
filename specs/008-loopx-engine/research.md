# Research: 008-loopx-engine

## 1. 上游身份与许可证

- **Decision**: 机制语义核对本保持 `58f545aee1ce00c57b7a4f21b13d78ee0367b3da`（相关发布 `0.4.7`，MIT）。2026-08-16 公开 HEAD `8c103dfecae0f4424ecb0b07bad7cbc5f0797d6d` / `v0.4.8` 为 Apache-2.0，相对核对本超前 47 个提交，**不是**本模块实现基线。本批**不复制、不改编、不 vendoring** 上游源码，只按 Hufu 合同重写 typed result / Receipt / readback / 有界恢复。`NOTICE.md` 仍只记录设计研究引用，不因本模块改为「已采用源码」。
- **Rationale**: Issue #9 要求开始前核对提交与许可证；ADR 0003 写明 `0.1.0` 不把完整控制面当 npm 依赖、复制源码须遵守当时许可证。HEAD 许可证已变，未复盘前改钉会把 Apache-2.0 源码责任提前引入。
- **Alternatives considered**: 改钉 HEAD 并复制 turn_result 解释器（许可证与控制面耦合，超出第一批）；把 loopx 列为 optionalDependency（仍是默认产品图上的上游包，违反 FR-003）。

## 2. 产品命令形状

- **Decision**: 不新增顶级子命令。扩展 `hufu decide`：在既有六个互斥文件标志之外增加 `--engine` / `--result` / `--receipt`。仍必填 `--actor`。选用、类型化结果、回执均为 JSON 文件。读回与耐久效果继续只走既有 `--effect`。`connect` 拒绝 `--task-authority` 为 `loopx` / `engine` / `engine-loopx`。
- **Rationale**: 规格 FR-016 允许在既有命令上增加选用与入站观测；单一 `decide` 保持命令表面积。效果增量已由 #6 交付，避免第二套读回正本。
- **Alternatives considered**: `hufu engine` 第五动词（规格未要求新产品命令）；把引擎塞进 `connect --engine`（会把执行机制绑进冷启动正本声明）；隐式默认启用（违反「显式选用」）。

## 3. 引擎身份

- **Decision**: 本模块唯一合法 `engine_id` 为 `loopx-mechanisms`。未知 id → `CONTRACT_INVALID`。`loopx`、`loopx-control-plane` 或夹带 Goal/Todo/Registry/调度字段 → `ENGINE_CONTROL_PLANE_REJECTED` 或 `ENGINE_AUTHORITY_REJECTED`。未绑定前 `--result`/`--receipt` → `ENGINE_NOT_BOUND`。相同选用幂等。
- **Rationale**: 名称刻意不是产品名 LoopX，避免把控制面当成已接入。Constitution I：引擎不得成为正本。
- **Alternatives considered**: 允许任意 engine_id（本模块只批准第一批机制）；连接时自动探测 `.loopx/` 目录（隐式控制面，禁止）。

## 4. 类型化结果类别

- **Decision**: `kind` 仅 `progress` | `failure` | `readback_required` | `stop` | `data_insufficient`。必须引用已有 `decision_id` 与当前适用 `envelope_id`，以及 Hufu 自有 `turn_ref`（字符串，不得等于上游 `goal_id` 工作项）。禁止载荷键：`goal_id`、`todo_id`、`registry`、`scheduler_hint`、`quota`、`heartbeat`、`next_cli_actions`。
- **Rationale**: 规格最小类别集合；上游 turn_result 夹具含 `scheduler_hint` / `loopx refresh-state --goal-id`，必须在边界测试中拒绝。
- **Alternatives considered**: 透传上游 `result_kind` 字符串（会把控制面词汇写进核心）；把 `turn_ref` 映射成 `work_item_id`（第二套生命周期）。

## 5. 回执与读回

- **Decision**: Receipt 只含核验 `ok` 与 `evidence_ref`，指向 `result_id` 或既有 `effect_id`。禁止授权/完成/裁决正文字段。建议恢复或再次前向动作（`kind=progress` 之外还想沿旧信封开工、或 `--effect` 声称 `applied`）必须先有 `readback_status=complete` 的效果增量——此约束继续由 #6 `--effect` 与本模块护栏共同执行。Receipt 本身不得写成 `observed_result=applied`。
- **Rationale**: 规格 FR-006/008/009；#6 FR-026 已禁止无读回冒充效果。
- **Alternatives considered**: Receipt 直接改 `first_durable_effect`（把核验当效果正本）；无读回允许 `progress` 自动重试（禁止）。

## 6. 有界恢复与护栏

- **Decision**: `guardrails.ts` 增加派生值 `engine_no_progress`：引擎已绑定，且存在当前信封，且 `first_durable_effect` 为 `confirmed_absent`，且最近一次类型化结果不是 `progress`（`failure` / `stop` / `readback_required` / `data_insufficient`，或连续无进展）。出现时 `handoff` 的 `next_action_text` 不得给出沿旧信封的新前向步骤，仍允许记录交接与 `--effect` 读回。不创建 timer、不跑调度器。
- **Rationale**: 规格 US4；与 `semantic_rebase_required` 分开，以免把「引擎无进展」误当成 ADR 0005 硬触发的实现活动增长条件。
- **Alternatives considered**: 复用 `semantic_rebase_required`（触发条件不同，会误伤未选引擎的 #6 夹具）；独立 daemon 做 no-progress backoff（禁止）。

## 7. CurrentView 兼容

- **Decision**: `view_schema_version` 保持 `1`。新增可选顶层槽：`engine`、`typed_result`、`receipt`。未绑定引擎时这些槽 `availability=data_insufficient`，`value=null`，既有 #6 夹具不断言这些槽则可继续；本模块测试必须断言未绑定对照与 #6 护栏集合一致。`task_authority` 不得变为引擎。
- **Rationale**: 与 M3/M4 加字段不升版本一致。
- **Alternatives considered**: 升 v2（迫使无引擎工作区改全部断言）。

## 8. 依赖与门禁锁

- **Decision**: 测试读取根 `package.json` 与 `packages/*/package.json`，断言 dependencies/devDependencies/optionalDependencies/peerDependencies 均无 `loopx`。`src/` 不得出现 `from "loopx"` 或 vendored 上游树。门禁零网络。
- **Rationale**: FR-003 / SC-009。
- **Alternatives considered**: 只在文档里写「不要安装」（不可执行）。
