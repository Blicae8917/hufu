# CLI 合同: `hufu`

## 调用

```text
hufu validate <task_file>
```

- `<task_file>` 为 UTF-8 JSON 文件路径。
- 成功：退出码 `0`，stdout 仅一行 JSON（`ValidateSummary`，键排序），无网络、无写盘。
- 失败：退出码 `2`，stderr 为 `invalid task contract: <reason>`，stdout 为空。

## 未知或不支持的命令

```text
hufu connect ...
hufu doctor ...
hufu status ...
hufu handoff ...
hufu <anything-else>
```

必须非 0 退出。不得创建 `.hufu/`、账本、缓存或外部调用。不得打印表示这些产品命令已执行成功的摘要。

## 与 0.0.1 的兼容

`validate` 的合法/非法判定与 `examples/task.json`、既有 Python 测试用例保持同一合同：`schema_version=0.1`、`source` 为 `native` 或 `external`。本模块不接受 `local`/`github`/`gitlab` 作为 `source`。
