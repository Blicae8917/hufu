# Quickstart: 003-local-ledger-commands

用于验证本模块是否交付成功。不替代 `tasks.md` 中的实现步骤。必须在临时目录执行，避免污染仓库工作区。

## 前提

- Node.js `>=22.19.0`
- pnpm（版本以根目录 `package.json` 的 `packageManager` 为准）
- Windows 或 POSIX
- 本模块已实现并 `pnpm test` 可通过

## 仓库门禁（任意工作区）

```bash
pnpm install
pnpm test
node scripts/check-version.mjs
git diff --check
pnpm hufu validate examples/task.json
```

期望：版本仍为 `0.1.0`；`validate` 行为与 M1 相同。

## 本机纵切（临时目录）

在空目录中（PowerShell 可用 `cd $env:TEMP\hufu-m2` 一类路径）。不要用 `pnpm --dir` 代替项目根：它会改写 cwd。从其他目录调用时传 `--project-root <workdir>` 或设置 `HUFU_PROJECT_ROOT`。

```bash
node <repo>/dist/src/hufu/main.js connect --project-root <workdir> --project-id demo --repository https://example.com/demo.git --task-authority local --commander human:alice --grant-scope "local ledger and handoff"
node <repo>/dist/src/hufu/main.js doctor --project-root <workdir>
node <repo>/dist/src/hufu/main.js status --project-root <workdir>
```

期望：

- `connect` 退出码 0，stdout 含 `project_root`、`grant_id` 与 `project_lead_binding_id`；`project_root` 即 `<workdir>` 的已落实路径
- 再次执行 **完全相同** 的 `connect` 仍退出码 0，身份不变
- `doctor` 退出码 0，`healthy` 为 true
- `status` 退出码 0，`task_authority.value` 为 `local`，且能读到三轴字段；`work_items` 可为空但不得把缺失写成 `0`
- 目录下出现 `.hufu/ledger/events.jsonl`，无守护进程

然后用测试夹具或领域服务打开一个工作项 `wi-1` 后：

```bash
node <repo>/dist/src/hufu/main.js handoff --project-root <workdir> --work-item wi-1 --completed "spec kit artifacts" --remaining "implementation" --risks "none"
node <repo>/dist/src/hufu/main.js status --project-root <workdir>
```

期望：`handoff` 退出码 0，`next_action_text` 含 `wi-1`；`status` 能看到交接摘要。

## 失败样例

- `hufu connect --task-authority github ...` → 退出码 2，`TASK_AUTHORITY_UNSUPPORTED`
- 先手工创建 `.hufu/ledger/write.lock` 再 `connect` → 退出码 3，`LEDGER_WRITER_CONFLICT`
- 未连接时 `status` → 退出码 4
- `hufu status --refresh` → 退出码 2
- 未连接时 `handoff --work-item wi-1 --completed x --remaining y` → 退出码 4
- `--project-root` 指向不存在的目录 → 退出码 2，不创建 `.hufu/`

## 回放

对未改动的 `events.jsonl` 连续三次 `status`，stdout 中工作项、授权修订与项目负责人绑定必须相同。

## 文档

README 的当前范围必须改为：四命令与本机账本 **已在本模块交付**；GitHub 投影、Cordis、会商、网页仍标为尚未实现。CHANGELOG `[0.1.0]` 同步，且不把决策状态机写成已交付。
