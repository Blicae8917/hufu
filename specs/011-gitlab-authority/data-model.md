# Data Model: 011-gitlab-authority

本文件是设计模型，不新增账本事件类型，也不授权实现。007 的 `GitLabIssueProjection` 与 `gitlab:` ExternalRef 保持不变。

## GitLabAuthorityClass

| 字段 | 约束 |
| --- | --- |
| `adr` | 必须为 ADR 0006 |
| `issue` | `#49` |
| `class` | 必须为 `(1) 自建 GitLab AuthorityProvider` |
| `implementation_authorized` | 必须为 `false`（本 Kit 落地后仍为 false） |

禁止把本实体写成 LoopX 桥、Renderer、出站 Runtime 或 M10–M15。

## GitLabInstanceIdentity

操作者手填，不得探测。

| 字段 | 约束 |
| --- | --- |
| `instance_kind` | `saas_gitlab_com` 或 `self_hosted` |
| `instance_origin` | `self_hosted` 时必填；允许清单内可为 `http:` 或 `https:` 来源；主机为主机名或 IPv4，可选非默认端口；规范值必须保留 scheme + host + port；不得含项目路径或内嵌凭据。公开仓示例：`https://gitlab.example.com`（示例）、`http://192.0.2.10:41101`（示例，RFC 5737 TEST-NET-1）、`http://gitlab.example.com:41101`（示例） |
| `project_path` | 恰好两段 `group/project`；示例为 `example-group/example-project`（示例） |

校验：

- `instance_kind=self_hosted` 且 `instance_origin` 的 host 为 `gitlab.com` 或 `www.gitlab.com` → 失败关闭（SaaS 不得冒充自建，HTTP 与 HTTPS 皆拒）
- 允许清单比较按 scheme + host + port 精确匹配；`http://host:41101` 不等于 `https://host:41101`
- `instance_kind=saas_gitlab_com` → 继续只走 007，不得启用 Authority 写回
- 从 git remote、议题正文或环境主机名推断 → 失败关闭
- 嵌套组路径 → 失败关闭（与 007 相同，本票不发明猜测规则）

公开仓 MUST NOT 写入真实私有来源。模型叙述里的来源一律标明「示例」。

## ExternalRef（自建，设计）

007 合同保持：`^gitlab:([^/#]+)/([^/#]+)#([1-9][0-9]*)$`

自建 Authority 的工作项引用必须使用**不同**前缀，以免扩大 007：

```text
gitlab-instance:<example-host>/<group>/<project>#<iid>
```

示例（标明为示例）：`gitlab-instance:gitlab.example.com/example-group/example-project#456`

- host 必须等于已声明 `instance_origin` 的 host
- group/project 必须等于已连接 `project_path`
- iid 为正整数，禁止前导零
- 007 的 `gitlab:` 解析器 MUST 继续拒绝 `gitlab-instance:`
- 未来实现不得通过修改 007 解析器来「顺便」接受自建引用

## 现场投影绑定与缓存重绑（失败关闭）

现场读取（`listIssueProjections`）在把一条经典 Issue 收成 WorkItem 之前，必须同时成立：

- `web_url` 的 origin（scheme + host + port）等于已声明 `identity.instance_origin`，不得只比 hostname；HTTP IPv4:port 必须保留端口
- `web_url` 中 `/-/issues/<iid>` 之前的项目路径（`decodeURIComponent`，大小写敏感）等于 `identity.project_path`
- `iid` 为正整数，且与 URL 中的 iid 一致；若 payload 已有 `references.full`，也必须等于 `project_path#iid`

任一检查失败时**抛错**，不得把整页静默标为成功。选择抛错而不是丢弃单条，是为避免同一页混入其他项目的 Issue 后仍被当成完整、已绑定的投影。非 Issue / Merge Request 伪装项仍可丢弃。

实例投影缓存必须按当前连接身份重绑：`instance_kind === "self_hosted"`、精确 `instance_origin`、精确 `repository`（项目路径）。status / decide / handoff / projector / doctor 走同一辅助函数；不匹配则抛出 `gitlab instance cache does not match connected identity`，且不得回显秘密。缓存仍不得持久化 `body` / `description` / `token` / `credential`。

GitLab 若发送了非空 `x-next-page`，但其值不是严格大于当前页的整数，必须抛错，不得把该页当成完整列表。`Link` rel=next 若越源、内嵌凭据或路径不是已授权项目的 `/api/v4/projects/.../issues`，同样抛错。正常末页（无 next）仍为 `incomplete: false`。

冒到 CommandError、CLI stdout/stderr、doctor 与 status 的错误文本必须经过中心 redactor：剥离精确 token、`Bearer <anything>`、`PRIVATE-TOKEN` 头、`HUFU_GITLAB_INSTANCE_TOKEN=...` 与 `glpat-...` 子串。

## AuthorityCapability

| 值 | 何时合法 |
| --- | --- |
| `read_projection` | 自建正本声明成立后的**唯一默认**能力。仍不写回。 |
| `write_back` | 仅在维护者修订 Constitution 写回禁令、另有实现票与失败测试、且指挥官授权显式点名之后才可评估。本 Kit 下该值无效。 |

`write_back_enabled` 的唯一合法默认值是 `false`。

## WriteBackGate

| 字段 | 约束 |
| --- | --- |
| `constitution_amended` | 本 Kit 落地后仍为 `false` |
| `write_back_default` | `false` |
| `blocked_reason` | Constitution I 与「系统边界」：第一版 Adapter 只读，外部写回不在已接受范围 |

本实体不是授权。闸门关闭时，任何写回 grant 都失败关闭。

## AuthorizationGrant（引用，不新造授权来源）

自建正本声明必须引用既有 `AuthorizationGrant`，并在范围内点名：

- `instance_origin`（示例占位或未来实现中的操作者声明值，不得写入本公开仓的真实值）
- `project_path`
- `capability=read_projection`

缺少允许清单、过期、被 `supersedes` 的 grant，或试图授予 `write_back` 而闸门未开 → 失败关闭。

## 007ReadonlyBoundary

只读保留项（不进入本票实现，也不被本票改写）：

- 公开 `gitlab.com` 两段项目的经典 Issue 投影
- 无凭据、无 `Authorization`
- 端口只有 list
- 自建 / 私有实例在 007 路径上失败关闭
- 议题正文不可信
- 无后台刷新

## 禁止写入公开模型的数据

- 凭据或 token 字面量
- 私有 Endpoint、内网地址、家庭或机房主机名
- 客户项目真实路径
- 把缺失用量写成 `0`
