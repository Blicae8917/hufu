# Quickstart: 效能试点记录与门禁

本模块验证的是试点记录和扩充门禁，不是网页。

## 1. 准备授权工作项

与现有决策流相同：`init` → `connect --grant` → `handoff`。没有 handoff 的工作项不能记录试点。

## 2. 准备脱敏记录

记录文件只含稳定 id、封闭结论、度量槽和带来源的基线。不要写入本机绝对路径、内部项目名、凭据或 Session 原文。缺失墙钟或用量必须标 `unavailable` / `data_insufficient`，值为 `null`。

## 3. 记录试点

```bash
hufu --repo <repo> --project <project> --ledger <ledger> \
  pilot --actor commander-1 --record tests/fixtures/pilot/net-benefit.json
```

成功后 Journal 增加 `hufu/pilot.recorded`。重复同一 `pilot_id` 且 payload 相同应幂等成功。

## 4. 查看门禁

```bash
hufu --repo <repo> --project <project> --ledger <ledger> status
```

投影含 `pilot` 与 `expansion_gate`。不足三轮同类净收益时门禁为 `closed`。`web_implemented` 与 `serve_allowed` 恒为 `false`。

## 5. 网页请求必须失败

```bash
hufu --repo <repo> --project <project> --ledger <ledger> serve
```

本模块必须失败关闭，不监听端口。三轮净收益后也是如此。把网页写成 `task_authority` 同样失败。
