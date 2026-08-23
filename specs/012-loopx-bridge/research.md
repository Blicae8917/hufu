# Research: 012-loopx-bridge

## 1. Kit 编号与触达面

- **Decision**: 本票使用 `specs/012-loopx-bridge/`。主线最高已落地 kit 为 `010-upstream-drift`。`011-*` 预留给并行的 #49 GitLab AuthorityProvider；本票不占用 011，不复用 008，不复用已废除的 M10–M15 编号。不向 008 合同写入前向指针（既有 kit 无此惯例）。不修改 `docs/SPEC.md`、`AGENTS.md`、#5。
- **Rationale**: 用户假设与目录扫描一致；并行 #49 若落地 011，本票写入 011 会造成合同冲突。008 是已交付机制记录口，复用其编号会把桥误读成引擎升级。
- **Alternatives considered**: 复用 `008-loopx-engine` 增补桥章节（会静默升格 #9）；占用 `011-loopx-bridge`（与 #49 假设冲突）；在 008 `spec.md` 加一行指针（仓库无此惯例，且用户要求核实后跳过）。

## 2. ADR 0006 类别证明

- **Decision**: #50 / 本 kit 明确写成 ADR 0006 后续三类中的 **第 (2) 类：Hufu↔LoopX Authority / Decision / Evidence 桥**。不是 (1) 自建 GitLab AuthorityProvider，不是 (3) 企业 Renderer。#50 与 ADR 0006 仍是设计史；实现授权由 #58 / ADR 0007 下达，合同基线 LoopX v0.5.2，不 vendoring。
- **Rationale**: ADR 0006「后续约束」要求每个后续能力 Module 引用该 ADR 并证明属于三类之一。#50 正文已声明「这是 ADR 0006 允许的三类后续能力之一」。
- **Alternatives considered**: 把桥写成 008 的实现续篇（违反「不得升格 #9」）；把桥与 GitLab 写能力捆成一张票（跨越 (1) 与 (2)）。

## 3. 三端字段划分原则

- **Decision**: 过桥只允许稳定引用、不透明摘要与带来源的观测指针。授权正文、裁决正文、议题正文、Receipt / Journal / 执行结果一律留守或明确禁止当作授权。字段名复用 003 / 005 / 008，不另造第二套词汇。
- **Rationale**: Constitution I / ADR 0005 已要求下游只消费决策引用与摘要；ADR 0006 第 4 条禁止 LoopX 代管原生议题生命周期并从 Journal / Receipt / 执行结果反推授权。
- **Alternatives considered**: 过桥完整 `DECISION_PACKET`（零拷贝被破坏）；过桥 `AuthorizationGrant.scope_text`（把授权正文交给 LoopX 控制面）；允许 Receipt 过桥但标注「非授权」（仍容易被下游当成完成证明，故 Receipt 整体留守）。

## 4. 008 / #9 显式非升格

- **Decision**: `loopx-mechanisms` 继续只是须显式选用的机制记录口。选用 008 **不**启用本桥；本桥 **不**改变 008 CLI（`--engine` / `--result` / `--receipt`）。TypedResult / Receipt / 有界恢复仍不是任务正本。
- **Rationale**: ADR 0006 与 #50 都写明 #9 不是本桥。静默把引擎绑定解释成桥，会把执行机制口做成第二套正本。
- **Alternatives considered**: 在 `hufu decide --engine` 上增加桥标志（本票禁止改 CLI）；把 `engine_id=loopx-mechanisms` 当作 `task_authority`（Constitution I 禁止）。

## 5. 依赖与源码

- **Decision**: 本 PR 与未来实现默认都不引入 `loopx` 发行包、不复制上游源码。采用任何机制仍须独立 Module、边界测试、效能假设、可逆关闭，并按该提交更新许可证与 NOTICE。LoopX 核对本仍钉在 `docs/COMPATIBILITY.md` 的已接受基线；本 kit 不改钉。
- **Rationale**: #9 已证明可以按 Hufu 自有合同重写机制而不 vendoring。上游 HEAD 许可证已从 MIT 变为 Apache-2.0，未复盘前搬源码会提前引入许可证责任。
- **Alternatives considered**: 把 `loopx` 列为 optionalDependency（仍出现在产品依赖图上）；改钉 HEAD 并复制桥接层（超出本票，且不是实现授权）。

## 6. 测试策略

- **Decision**: 本 PR 只落地一条**会通过**的设计约束测试 `tests/012-loopx-bridge-spec.test.ts`。失败的 Adapter / 议题生命周期 / 依赖锁实现测试写在 `tasks.md` T001 起，留给未来实现 PR。
- **Rationale**: #50 与用户指令都禁止本票实现代码；把会失败的 Adapter 测试合入会破坏 CI。Constitution VII 的「先失败测试再写生产代码」适用于未来实现 PR，不适用于本设计 PR。
- **Alternatives considered**: 本 PR 先写失败的 `BridgePort` 测试（CI 变红，违反交付门禁）；完全不写测试（无法锁住「仅设计 / 不升格 008」）。

## 7. CHANGELOG

- **Decision**: 仅在 `[Unreleased]` 增加一条设计 kit 说明。不把本票写入 `[0.1.0]`，不升版本。
- **Rationale**: `0.1.0` 已由标签发布；设计合同属于未发布后续。`tests/release-010.test.ts` 锁定 `[0.1.0] - 2026-08-23` 行。
- **Alternatives considered**: 改写 `0.1.0` 新增列表（会把未实现桥写进已发布版本）；不记 CHANGELOG（评审者难以发现本设计落地）。

## 8. #68 固定 RunOnce 合同核验

- **Source fact**: LoopX v0.5.2 commit `423035f402e2f1703f076c3cfe60c14c5803433f`
  的公开执行结果使用 `mode=run_once`、`loopx_turn_execution_v0`；物质结果要求独立任务
  Validator，committed 判据包含 committed Receipt、通过/进展 Validation，以及 durable
  state write / quota spend。
- **Decision**: Hufu 不复制该 transaction、quota 或 scheduler；只在注入式 RunOncePort 后
  验证稳定 Turn / TypedResult / Effect / Receipt 引用链。一次调用后必须 readback，完整链前
  不允许 next。
- **Decision**: wrapper 位置由部署侧 Provider 明确配置，桥只持有
  `runtime_locator_ref`。这同时支持 Windows wrapper 与其他 Host，而不把本机路径写入公开仓。
- **Alternatives rejected**: 安装 `loopx` 作为 npm 依赖；vendor Python；从 Hufu 启动
  Scheduler / while-loop；把 Codex CLI headless thread 当 Desktop Session；只看 execute 返回
  而跳过 readback。
