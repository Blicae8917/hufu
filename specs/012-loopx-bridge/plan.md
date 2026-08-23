# Implementation Plan: Hufu↔LoopX Authority / Decision / Evidence 桥

**Branch**: `012-loopx-bridge` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-loopx-bridge/spec.md`

**Parent Issue**: [#50](https://github.com/Blicae8917/hufu/issues/50)

**Git branch for this PR**: `cursor/loopx-bridge-spec-2263`

## Summary

按 ADR 0006 第 (2) 类与 ADR 0007，扩展已落地的 Hufu↔LoopX Authority / Decision / Evidence 桥合同：补齐 `SessionBindingRef` / `ExecutionEnvelopeRef` / `EffectRef` / `ReceiptRef` / `TypedResultRef`，并将 Status 标为 implementation-authorized（#58）。本波 **MUST NOT 实现桥 Adapter**，不改 CLI、不改 `src/` 运行时、不引入 `loopx` 依赖、不复制上游源码、不升版本。通过的设计约束测试锁住上述句子；失败的 Adapter 测试只留在 `tasks.md` 给 #58 实现 PR。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与已交付基线相同）。本 PR 不新增编译单元。

**Primary Dependencies**: 零新增运行时依赖；`package.json` / workspace 不得出现 `loopx`。不 vendoring 上游源码。

**Storage**: 本 PR 不新增账本事件类型。未来实现若追加桥观测，只能引用既有授权 / 决策 / 证据身份，不得另建任务生命周期。

**Testing**: `tsc` + `node:test`。本 PR 只增加 `tests/012-loopx-bridge-spec.test.ts`（通过的设计约束测试）。失败的 Adapter / 生命周期 / 依赖实现测试见 `tasks.md` T001 起，不得在本 PR 落地。

**Target Platform**: 文档与门禁在 Windows 与 POSIX 上同样可读可跑；无守护进程。

**Project Type**: 单包 CLI 仓库上的设计 kit；不新增 workspace 包。

**Performance Goals**: 设计约束测试在既有 `pnpm test` 时间内完成；维护者 10 分钟内能从 kit 指出三端划分（SC-001）。

**Constraints**: implementation-authorized by #58；本波无 Adapter；无 CLI 变更；无网络；无凭据；无议题写回；无 LoopX 默认依赖；版本 `0.1.0`；不复活 M10–M15；不升格 008。

**Scale/Scope**: 一份三端字段合同。不交付传输通道、不交付完整 LoopX 控制面、不交付 GitLab AuthorityProvider、不交付企业 Renderer。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。桥不进 `task_authority`；Journal / Receipt / 执行结果不扩权；`authority_scope_ref` 只引用既有 grant |
| II 正交分离与插件优先 | 通过。未来 Adapter 若开工须在 Provider 边界之后；本 PR 不改 Host Agent Loop，也不把 LoopX 写成正本 |
| III 公开核心，研究外置 | 通过。不复制上游源码；不写客户项目、本机路径或私有 Endpoint |
| IV 真实事件与证据 | 通过。过桥只允许带来源的指针与三轴；缺失不得写 `0` |
| V 唯一责任角色 | 通过。RoleBinding / SessionBinding 作为授权本体留守 Hufu；临时专家席位仍不是绑定 |
| VI 默认小型、可移植、可逆 | 通过。本 PR 只增加设计产物与一条通过测试；可逆关闭=不实现 Adapter |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #50 为准；本 PR 先锁设计约束，实现失败测试留给未来 PR |
| VIII 有界且经济 | 通过。不采集效能试点；不新增控制面 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过。本 PR 不新增网络入口 |
| ADR 0001 | 通过。桥只谈任务正本指针、决策引用与证据指针，不合并三轴 |
| ADR 0003（经 0006 修订） | 通过。不把 LoopX 写成可分阶段搬入的完整控制面；不引入发行包 |
| ADR 0005 | 通过。决策过桥只传 `DecisionRef`，不重写 Packet |
| ADR 0006 | 通过。本票证明为第 (2) 类桥 |
| ADR 0007 | 通过。#58 授权实现；本波不改 `src/` 运行时 |

Phase 1 设计后复检：仍通过。合同文件不构成 Adapter、CLI 标志或第五套任务系统。`view_schema_version` 保持 `1`。兼容性核对本不因本 kit 改钉。

## Project Structure

### Documentation (this feature)

```text
specs/012-loopx-bridge/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── authority.v1.md
│   ├── decision.v1.md
│   ├── evidence.v1.md
│   ├── stay-on-side.v1.md
│   └── 008-non-promotion.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
# 本 PR 不修改 src/。下列路径只供未来实现 PR 参考，不是本票授权。

src/hufu/
├── loopx-bridge.ts        # 未来：校验过桥载荷、拒绝本侧留守字段
├── loopx-bridge-schema.ts # 未来：三端白名单与禁止键
└── errors.ts              # 未来：BRIDGE_* 稳定错误码

tests/
├── 012-loopx-bridge-spec.test.ts          # 本 PR：通过的设计约束测试
├── 012-loopx-bridge-adapter.test.ts       # 未来实现 PR 的第一条失败测试
├── 012-loopx-bridge-lifecycle.test.ts     # 未来：禁止原生议题写回
└── 012-loopx-bridge-deps.test.ts          # 未来：实现后仍不得依赖 loopx
```

**Structure Decision**: 本 PR 只写入 `specs/012-loopx-bridge/`、`tests/012-loopx-bridge-spec.test.ts` 与至多一条 Unreleased CHANGELOG。不新增 `packages/loopx`，不编辑 `specs/008-loopx-engine/` 合同（仓库没有子 kit 前向指针惯例），不编辑可能并行的 `specs/011-*` 树。

## Complexity Tracking

> 无违规。本 PR 不增加运行时表面积。把失败 Adapter 测试留在 `tasks.md` 而不是本 PR，是为了遵守「本票不是实现授权」且保持 CI 绿色。

## #68 实现增量（2026-08-23）

Issue #68 在既有三端引用桥之上增加一个窄 RunOnce Consumer。兼容基线固定为 LoopX
`v0.5.2` / `423035f402e2f1703f076c3cfe60c14c5803433f`。新增编译单元仅为
`src/hufu/loopx-run-once.ts`；无新增依赖、网络、真实 Host、CLI、持久事件类型或后台进程。

公开接口顺序为：

```text
BridgeActivationReceipt
  + opaque authority_ref
  -> independent AuthorityResolver(current Hufu Ledger/status)
  -> Plan(ExecutionEnvelopeRef, SessionBindingRef)
  -> pre-readback
  -> durable attempt CAS(prepared)
  -> one bounded RunOncePort.execute
  -> independent TypedResult Validator
  -> effect readback + Validator Receipt + final Receipt
  -> next_allowed
```

显式 wrapper 路径属于部署侧 Provider 配置；Hufu 只绑定 `runtime_locator_ref`。Constitution
复检通过：GitLab / GitHub 仍是任务正本；LoopX 控制面不复制；无 Scheduler/while-loop；
缺失读回使用 `DATA_INSUFFICIENT`；失败/超时与重启不盲重试。

Activation Receipt 不再影响领域 Plan 的 `execution_allowed`；只有独立 AuthorityResolver 从 Hufu
current Ledger/status 签发 fresh receipt，且 Consumer 核验 current grant/Decision/Envelope/task/
SessionBinding 与实际注入 Port、耐久 attempt store、独立 Validator/readback 一致后才能置 `true`。
执行前再 resolve 一次；裸 AuthorityCrossing 不再进入 Consumer options。
首次调用前的 `prepared` attempt 是耐久停止线：效果未知时后续只 readback，不二次 execute。
