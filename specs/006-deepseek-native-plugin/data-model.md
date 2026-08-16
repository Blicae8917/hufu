# Data Model: 006-deepseek-native-plugin

本模块不新增任务正本或决策事件类型。M2–M4 的 Ledger 事件、CurrentView 槽与决策实体仍然有效。这里只描述组合层对象。

## Plugin Bundle

| 字段 | 约束 |
| --- | --- |
| npm `name` | `hufu-dsh` |
| `dsh.bundle.patch` | 相对包根的路径，本模块固定 `./cordis.patch.yml` |
| 依赖 `hufu` | workspace 指向根包 |
| 依赖 `@deepseek-ai/cordis` | 精确到已记录版本（Plan：`4.0.1`） |
| 根包依赖图 | 不得出现 `@deepseek-ai/cordis` 或 `hufu-dsh` |

缺少 `dsh.bundle` 的包不得进入 Profile `bundles`。被显式列入但 patch 无法加载 → 失败关闭。

## Isolated Profile

测试与快速开始使用隔离根目录，等价于 `$DSH_HOME`：

| 字段 | 约束 |
| --- | --- |
| `home` | 临时目录，不得写 `~/.dsh` |
| `profile_name` | 固定测试名 `hufu-fixture`（产品文档可举例，测试不得用维护者日常 `web`） |
| `profile_dir` | `<home>/profiles/<profile_name>` |
| `bundles` | 有序列表；Hufu 装入后必须含 `hufu-dsh` |
| `workspace_root` | 另一临时工作区，内含 `.hufu/ledger` |

## Hufu Service（`ctx.hufu`）

| 方法 | 对应领域入口 | 备注 |
| --- | --- | --- |
| `validate` | `validateTask` | 只读 |
| `connect` | `connectWorkspace` | 写入账本 |
| `doctor` | `doctorWorkspace` | 默认可修复截断尾仅当显式请求 |
| `status` | `statusWorkspace` | 默认不 refresh |
| `handoff` | `recordHandoff` | |
| `decide` | `decideWorkspace` | kind 与 CLI 相同 |

工作区路径由工具/服务参数传入，默认当前绑定工作区，不得静默使用 Host 家目录。

## Revocable Effect

| 效果 | 卸载后 |
| --- | --- |
| `hufu.*` 工具注册 | 工具列表不含这些名字 |
| `ctx.hufu` 服务 | 不可解析或不可调用 |
| 领域事件监听器（若有） | 不再触发 |
| `.hufu/ledger/events.jsonl` | **保留** |

卸载不是事件类型，不往账本追加「已卸载」。

## CurrentView 对等键

比较时至少包括：

- `view_schema_version`（仍为 `1`）
- `task_authority`、`project`、`authorization_grant`（含 `revision`）
- `work_item_set` / `work_items` 的身份与 objective，不含议题 body
- `decision`、`execution_envelope`、`route_ack`、`first_durable_effect`、`execution_guardrails`
- `session` / `run`：无 Host 观测时 `availability` 为 `unavailable` 或 `data_insufficient`，`value` 为 `null` 且不得为 `0`

## Compatibility Baseline（测试内声明）

| 键 | 值 |
| --- | --- |
| `cordis_implementation` | `@deepseek-ai/cordis` |
| `cordis_version` | 与 `packages/hufu-dsh/package.json` 一致 |
| `harness_commit` | 写入 `docs/COMPATIBILITY.md` 的已核对提交 |
| `upstream_cordis_supported` | `false` |
