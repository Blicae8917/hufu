# 合同: `ctx.hufu` 与工具

独立 CLI 合同（`validate` / `connect` / `doctor` / `status` / `handoff` / `decide`）仍然有效。本文件只写 DeepSeek 组合层如何调用同一领域函数。

## 工具名

| 工具 | 必填参数（语义） | 成功 |
| --- | --- | --- |
| `hufu.validate` | 任务信封对象或文件 | 与 CLI 相同的摘要字段 |
| `hufu.connect` | 与 CLI 相同的项目/正本/指挥官/授权 | `{ ok: true, result }` |
| `hufu.doctor` | 可选修复开关 | 健康报告 |
| `hufu.status` | 可选 refresh；local 正本下 refresh 仍为合同错误 | CurrentView |
| `hufu.handoff` | work-item、completed、remaining | 含 `decision_ref` |
| `hufu.decide` | actor + 恰好一种 kind + 载荷 | 与 CLI `decide` 相同 |

工具 MUST 调用领域函数，MUST NOT spawn `hufu` 子进程再解析 stdout。

失败时返回与 CLI 相同的 `{ ok: false, error: { code, message, schema_version: "1" } }`。退出码族仅 CLI 进程使用；工具路径按 `error.code` 分类。

## 禁止

- 注册无 `hufu.` 前缀的同名工具
- 创建、继续或投递 Host Session
- 注册后台 job / schedule
- 把 Session 日志当作工作区
