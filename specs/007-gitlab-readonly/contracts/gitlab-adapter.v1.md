# GitLab Adapter v1（只读）

## 端口

```text
GitLabPort.listIssueProjections(project: GroupProject): Promise<ProjectionListResult>
```

`GroupProject`：恰好两段的 `group/project`。

`ProjectionListResult`：`items`、`observed_at`、`incomplete`、可选 `source_revision`。

禁止出现的方法名与行为：`createIssue`、`updateIssue`、`closeIssue`、`comment`、`merge`、`write*`、`createMergeRequest`。

## HTTP 约束（若使用 fetch 实现）

- 仅 `GET`
- 不发送 `Authorization`
- Host 仅 `gitlab.com`
- 目标为已连接项目的 Issues 列表：`/api/v4/projects/<urlencoded group/project>/issues`（及实现所必需的只读查询参数，如 `state=all`、`per_page`）
- 议题号使用 `iid`；原始链接使用 `web_url`
- 非 2xx、超时、无 JSON → 抛出/返回观测不可用，由命令映射退出码 4
- 响应体中的 `description` 字段不得传入 CurrentView 构造器或缓存对象
- 不得把自定义 Host 或 token 写入连接记录

## 测试锁

夹具至少覆盖：

1. 成功列表 → 合法 `gitlab:example-group/example-project#n` 与 URL
2. Merge Request / 非 Issue `type` 的项被丢弃
3. 含 `description` 的项不把正文带进视图或缓存
4. fetch 记录方法与 URL：零非 GET；零 `Authorization`；Host 为 `gitlab.com`
5. 第二次 list 失败 → 旧缓存仍在
6. `github:` 引用与嵌套组路径被拒绝
