# 008 / #9 显式非升格合同 v1

本文件锁死：已交付的 `specs/008-loopx-engine` / GitHub #9 **不是**本桥，也 **不得**被本票升格为任务正本。本文件不把 008 升格；桥的实现授权见 #58 / ADR 0007，本波仍不交付 Adapter。

引用 ADR 0006、[#50](https://github.com/Blicae8917/hufu/issues/50)、[#9](https://github.com/Blicae8917/hufu/issues/9)。

## 008 仍然是什么

`engine_id=loopx-mechanisms` 是须**显式选用**的机制记录口。它只记录类型化结果、核验回执，并复用 #6 的效果读回与有界恢复。它：

- 不是 `task_authority`
- 不是 Hufu↔LoopX Authority / Decision / Evidence 桥
- 不是 LoopX 发行包或完整控制面
- 不把 Goal / Todo / Registry / Scheduler / Heartbeat 映射为 Hufu 正本

默认路径在未选用时与 #6 完全一致。本 kit 不改变 008 的 CLI（`--engine` / `--result` / `--receipt`），也不编辑 008 合同正文。

## 本桥是什么

本 kit 是 ADR 0006 第 (2) 类桥合同，现由 #58 / ADR 0007 标为 implementation-authorized。它回答哪些 Authority / Decision / Evidence 字段可以过桥。它：

- 不因 008 已交付而自动启用
- 不把 `hufu/engine.bound` 解释成桥启用令
- 不把 TypedResult / Receipt 当成 DecisionRef 或 AuthorizationGrant

选用 008 与启用本桥是两件独立的事。#58 实现 PR 仍须显式启用桥，不得因引擎绑定而旁路。

## 禁止的升格读法

下列读法不合格：

1. 「已经有 `loopx-mechanisms`，所以 LoopX 现在是任务正本」
2. 「`decide --engine` 等于启用 Authority / Decision / Evidence 桥」
3. 「TypedResult `kind=progress` 可以关闭 GitHub / GitLab Issue」
4. 「Receipt `ok=true` 可以扩大 `AuthorizationGrant`」
5. 「本 kit 授权把 008 EnginePort 改成桥 Adapter」
6. 「把 `loopx` 发行包加进依赖，以便 008 升级为本桥」

对应未来错误码：`BRIDGE_008_PROMOTION_REJECTED`。

## 与三类后续能力

| 类 | Module | 本 kit |
| --- | --- | --- |
| (1) | 自建 GitLab AuthorityProvider（#49） | 不做 |
| (2) | Hufu↔LoopX Authority / Decision / Evidence 桥（#50 设计史 / #58 实现） | implementation-authorized；本波无 Adapter |
| (3) | 企业 Renderer | 不做 |

008 / #9 不在这三类里；它是已交付的机制记录口，保持原合同。

## 依赖锁（设计期即生效）

根目录与 `packages/*` 的 `package.json` 不得把 `loopx` 列入任何依赖字段。本 kit 与未来实现都不得 `import` 名为 `loopx` 的包，不得加入上游源码树。采用任何机制仍须许可证与 NOTICE。
