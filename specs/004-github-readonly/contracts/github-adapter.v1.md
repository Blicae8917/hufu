# GitHub Adapter v1（只读）

## 端口

```text
GitHubPort.listIssueProjections(): Promise<ProjectionListResult>
```

`ProjectionListResult`：`items`、`observed_at`、`incomplete`、可选 `source_revision`。

禁止出现的方法名与行为：`createIssue`、`updateIssue`、`closeIssue`、`comment`、`merge`、`write*`。

## HTTP 约束（若使用 fetch 实现）

- 仅 `GET`
- 不发送 `Authorization`
- 目标仅本公开仓 Issues 列表（及实现所必需的只读查询参数）
- 非 2xx、超时、无 JSON → 抛出/返回观测不可用，由命令映射退出码 4
- 响应体中的 `body` 字段不得传入 CurrentView 构造器

## 测试锁

夹具至少覆盖：

1. 成功列表 → 合法 `external_ref` 与 URL
2. 含 `pull_request` 的项被丢弃
3. 含 `body` 的项不把正文带进视图
4. fetch 记录方法与 URL：零非 GET
5. 第二次 list 失败 → 旧缓存仍在
