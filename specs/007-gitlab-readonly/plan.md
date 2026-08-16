# Implementation Plan: GitLab 只读投影

**Branch**: `007-gitlab-readonly` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-gitlab-readonly/spec.md`

**Parent Issue**: [#8](https://github.com/Blicae8917/hufu/issues/8)

## Summary

在已交付的 `local` 账本、本仓 `github` 只读投影与零拷贝决策流之上，增加 `task_authority=gitlab` 只读投影。`connect` 接受操作者手填、可解析为两段 `group/project` 的 GitLab 身份（仍写本机冷启动，默认不联网）。`status` 默认读 `.hufu/cache/gitlab-projection.json`；只有 `--refresh` 且正本为 GitLab 时才用 Node 内置 `fetch` 对 `gitlab.com` 做 GET。投影不写入账本工作项生命周期。适配器无写方法。GitLab 解析与策略放在独立 Adapter 文件，不进入 `github-ref.ts`。零新增运行时依赖、零凭据、零 Cordis 新插件。版本保持 `0.1.0`。

## Technical Context

**Language/Version**: Node.js `>=22.19.0`、TypeScript 5.x 严格模式、ESM（与 M1–M5 相同）

**Primary Dependencies**: 继续仅 `typescript` 开发依赖；零运行时依赖；不引入 GitLab SDK / Cordis。HTTP 只读用 `globalThis.fetch`，测试注入 `GitLabPort`

**Storage**: 沿用 `.hufu/ledger/events.jsonl` 与 `write.lock`。新增可重建缓存 `.hufu/cache/gitlab-projection.json`（派生数据，不是正本）。不把议题状态转换追加为 `hufu/work_item.*`。GitHub 缓存文件与解析保持 004，互不混用

**Testing**: `tsc` + `node:test`；录制夹具 `tests/fixtures/gitlab/`（示例身份 `example-group/example-project`）；禁止门禁打真实网络。先失败测试（FR-018）

**Target Platform**: Windows 10+ 与 POSIX；前台 CLI；无守护进程

**Project Type**: 单包 CLI（根目录 `hufu`）；不新增 workspace 包

**Performance Goals**: 夹具刷新与视图折叠在 2 秒内；快速开始 10 分钟（刷新可用替身）

**Constraints**: 仅显式刷新联网；无凭据；无写回；无私有 Endpoint；版本 `0.1.0`；核心零框架；`local` / 本仓 `github` / 决策合同除 GitLab 正本边沿外不变

**Scale/Scope**: 一份已声明 `group/project` 的经典 GitLab Issue 只读投影 + 同一套 CurrentView；不交付写回 / 嵌套组 / 自建实例 / LoopX / 会商 / Web / 出站 Runtime

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 本模块结论 |
| --- | --- |
| I 单一任务正本与显式授权 | 通过。每个 Project 恰好一个正本；GitLab 拥有议题生命周期；投影只读；Handoff/decide/缓存不扩权；议题正文不进授权或裁决 |
| II 正交分离与插件优先 | 通过。GitLab 特定逻辑放在 Adapter 之后；领域核心仍零框架；CLI 仍是 Consumer；不改 Host Agent Loop |
| III 公开核心，研究外置 | 通过。夹具使用公开安全示例身份，不含凭据、本机路径、客户项目名或议题正文进指令 |
| IV 真实事件与证据 | 通过。投影带来源与 freshness；失败保留旧观测；缺失不写 `0`；不把 GitLab 状态流复制进账本 |
| V 唯一责任角色 | 通过。冷启动仍产生当值 `project_lead`；不把 GitLab assignee 当成 RoleBinding |
| VI 默认小型、可移植、可逆 | 通过。无新依赖、无 daemon、无 token 存储；网络仅命令边界 |
| VII Spec 驱动、测试优先 | 通过。完整 Spec Kit；进度以 #8 为准；先失败测试 |
| VIII 有界且经济 | 通过。无后台刷新；不采集效能试点 |
| 版本纪律 | 通过。保持 `0.1.0` |
| 无网络/凭据/后台 | 通过（有界例外）。Issue #8 与 SPEC 刷新策略已授权「仅显式刷新」的网络读取；仍禁止凭据、私有 Endpoint 与后台 |
| ADR 0001 | 通过。GitLab 保留议题所有权；投影含链接/观测时间/freshness；V1 无写方法 |
| ADR 0003 | 通过。不组装新的 Cordis 插件；走既有 Standalone 命令路径 |
| ADR 0005 | 通过。GitLab 正本下 `task_ref` 只引用缓存中的 GitLab 工作项；不复制议题正文 |

Phase 1 设计后复检：仍通过。`GitLabPort` 只有 list 语义；缓存是派生；写回测试锁死。兼容性文件无需为 GitLab REST 增加上游核对本表（本模块不声明对 GitLab 产品版本的浮动支持，夹具锁死响应形状）。`docs/COMPATIBILITY.md` 不因本模块改写 DeepSeek/Cordis/LoopX 边界。

## Project Structure

### Documentation (this feature)

```text
specs/007-gitlab-readonly/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── command-error.v1.md
│   ├── current-view.v1.md
│   └── gitlab-adapter.v1.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/hufu/
├── github-ref.ts        # 保持本仓 GitHub 专用；不得解析 gitlab: scheme
├── gitlab-ref.ts        # 解析 group/project 与 gitlab:group/project#n
├── gitlab-port.ts       # GitLabPort 接口（只读）
├── gitlab-http.ts       # fetch GET 实现；无写方法；Host 仅 gitlab.com
├── gitlab-cache.ts      # .hufu/cache/gitlab-projection.json
├── connect.ts           # 允许 gitlab（可解析两段路径）
├── status.ts            # --refresh 在 gitlab 正本成功
├── work-item.ts         # gitlab 正本下拒绝本机打开
├── projector.ts         # 合并账本 + 对应正本缓存
├── handoff.ts           # 按正本分发引用解析
└── decide.ts            # gitlab 正本下 task_ref 走 GitLab 缓存

tests/
├── gitlab-ref.test.ts
├── gitlab-adapter.test.ts
├── gitlab-connect.test.ts
├── gitlab-status.test.ts
├── gitlab-handoff.test.ts
├── gitlab-decide.test.ts
└── fixtures/gitlab/     # 录制的公开元数据夹具，示例身份，不含需保密字段
```

**Structure Decision**: 继续扁平 `src/hufu/`。GitLab 传输与解析放在独立 Adapter 文件，不进入 `contracts.ts` 信封，也不进入 `github-ref.ts`。GitHub 与 GitLab 缓存分文件。测试一律临时目录 + 注入 Port。

## Complexity Tracking

> 无违规。显式刷新联网已由 #8 / SPEC 授权，不是新开的后台服务。独立 `GitLabPort` 相对把 GitLab 塞进 GitHub 模块更符合 FR-020，不是额外控制面。
