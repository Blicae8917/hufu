# Implementation Plan: M8 效能试点与条件式本机网页

**Branch**: `009-pilot-gate` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/009-pilot-gate/spec.md`  
**GitHub Issue**: [#10](https://github.com/Blicae8917/hufu/issues/10)

## Summary

本模块把 Issue #10 的效能试点做成可记录、可派生、可门禁的有界合同。默认交付是试点记录与扩充门禁，不是网页。操作者通过 `hufu pilot --actor <id> --record <file>` 提交脱敏记录；Hufu 从既有事件派生协调唤醒、零效果尝试和返工，把缺失度量标成不可用或数据不足而不是 `0`。`hufu status` 投影 `pilot` 与 `expansion_gate`。`hufu serve` 在本模块成为已知拒绝命令，即使三轮同类可解释净收益也不监听端口、不引入网页实现。公开仓只保留口径、脱敏聚合和合成夹具。版本保持 `0.1.0`。本模块不阻塞 `0.1.0` 发布。

## Technical Context

**Language/Version**: TypeScript 5.9 / Node.js `>=22.19.0`  
**Primary Dependencies**: 现有运行时（commander、zod、neverthrow）。不新增网页框架、HTTP 服务器、daemon 或遥测依赖。  
**Storage**: 既有 JSONL Journal + SHA-256 digest。试点记录作为 durable 事件写入，不新建研究目录或独立数据库。  
**Testing**: node:test + tsx；零网络。合成夹具覆盖三轮同类净收益、非净收益、缺失度量、隐私拒绝与 `serve` 失败关闭。  
**Target Platform**: Windows 10+ 与 POSIX 前台 CLI；本机绝对路径、内部项目名和凭据不得进入公开仓或 Journal。  
**Project Type**: 单包 CLI + 领域库（`src/hufu/` 扁平结构）。  
**Performance Goals**: 门禁评估只扫描当前工作项相关事件；合成夹具在现有测试预算内完成。  
**Constraints**: Constitution；ADR 0001–0005；`docs/SPEC.md` 操作定义；Issue #10。不得把 Journal 当授权。不得把网页写成 `task_authority`。不得把估算用量标成实测。  
**Scale/Scope**: 单工作项试点记录、三轮同类比较门禁、CurrentView 两个新槽、保留命令 `serve`。不实现网页、远程访问或新控制面。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。试点记录、Journal、门禁和网页都不是授权。`task_authority` 不变；`web`/`ui`/`dashboard` 失败关闭。 |
| II 正交分离与插件优先 | 通过。试点是执行事实轴上的观测记录；`hufu pilot` 是 Consumer；不新增 Cordis 插件，不改 Host Agent Loop。 |
| III 公开核心，研究外置 | 通过。公开仓只留口径与脱敏聚合；拒绝本机路径、内部项目名和凭据；不建立 gitignored 研究目录。 |
| IV 真实事件与证据 | 通过。只追加 `hufu/pilot.recorded`；缺失度量不得写成 `0`；估算不得标实测。 |
| V 唯一责任角色 | 通过。仅 commander / 当值 project_lead 可记录；临时意见不产生门禁授权。 |
| VI 默认小型、可移植、可逆 | 通过。无新运行时依赖、无 daemon、无监听端口。关闭网页=保持 `serve` 失败。 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #10 为准；先失败测试。 |
| VIII 有界且经济 | 通过。本模块就是效能试点与扩充门禁；连续三轮无净收益暂停对应新增能力，不否定核心合同。 |
| 版本纪律 | 通过。保持 `0.1.0`。本模块不阻塞发布。 |
| 无网络/凭据/后台 | 通过。门禁用合成夹具；不新增网络入口或遥测。 |
| ADR 0001 | 通过。网页/Renderer 不得拥有任务状态。 |
| ADR 0003 | 通过。不引入网页框架；核心零框架。 |
| ADR 0005 | 通过。试点不重写裁决正文，只引用既有工作与事件。 |

Phase 1 设计后复检：仍通过。`hufu pilot` 是规格允许的有界记录命令。把 `hufu serve` 登记为已知拒绝，是为了把“网页未获批准”写成稳定错误码，而不是实现网页服务；`view_schema_version` 保持 `1`。

## Complexity Tracking

> 无违规。新增 `hufu pilot` 不是出站、会商或守护进程。保留 `hufu serve` 为已知拒绝，避免未知子命令掩盖门禁合同。不把试点塞进 `hufu decide`：decide 仍是裁决/引擎边界，试点是事后比较。

## Project Structure

### Documentation (this feature)

```text
specs/009-pilot-gate/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── command-error.v1.md
│   ├── current-view.v1.md
│   └── pilot.v1.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── cli.ts                 # 增加 `pilot`；把 `serve` 登记为已知拒绝
├── connect.ts             # 拒绝 web/ui/dashboard 作为 task_authority
├── envelope.ts            # 增加 `hufu/pilot.recorded`
├── errors.ts              # PILOT_INVALID、EXPANSION_GATE_CLOSED
├── projector.ts           # CurrentView 增加 pilot / expansion_gate
├── pilot-schema.ts        # 结论、度量槽、门禁与隐私校验
└── pilot.ts               # 记录、派生度量、评估扩充门禁

tests/
├── fixtures/pilot/        # 合成脱敏夹具；不含本机路径或内部项目名
├── pilot-record.test.ts
├── pilot-metrics.test.ts
├── pilot-gate.test.ts
└── pilot-privacy.test.ts
```

**Structure Decision**: 继续使用仓库根目录的扁平 `src/hufu/`。试点是独立记录命令，不进入 `decide.ts`，也不引入网页包。

## Implementation Phases

1. Setup：合成夹具、隐私拒绝样本、三轮同类比较样本。
2. Foundational：结论枚举、度量槽、事件名、错误码、CurrentView 槽位契约。
3. User Story 1：`hufu pilot --record` 写入封闭结论。
4. User Story 2：从事件派生协调类度量；缺失不为 `0`。
5. User Story 3：三轮门禁与 `hufu serve` 失败关闭。
6. User Story 4：公开仓隐私边界与脱敏聚合。
7. Polish：文档、版本门禁、`pnpm test`。

## Architecture notes

- `hufu/pilot.recorded` 的幂等键为 `hufu/pilot.recorded:<pilot_id>`。payload 只含稳定引用、结论、比较类别和度量槽声明，不含会破坏幂等的系统时间戳。
- 扩充门禁状态：`closed`、`evaluation_allowed`、`paused`。`evaluation_allowed` 只表示可以评估网页提案，不启动监听。
- `hufu serve` 在三种门禁状态下都返回 `EXPANSION_GATE_CLOSED` 或“网页须另批”的等价失败，本模块不实现 HTTP。
- 真实试点数据留在私有环境；公开仓测试只使用合成夹具。
