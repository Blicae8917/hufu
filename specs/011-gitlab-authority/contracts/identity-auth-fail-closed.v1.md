# 身份、授权、失败关闭与默认不写回 v1

本文件是设计合同。示例来源 `https://gitlab.example.com`、`http://192.0.2.10:41101`（RFC 5737 TEST-NET-1）、`http://gitlab.example.com:41101` 与项目 `example-group/example-project` 均为**示例**，不是真实部署。

## 身份

自建实例要被理解为 `task_authority=gitlab` 的任务正本（不只是 007 影子），必须由操作者**同时**显式给出：

1. `instance_kind=self_hosted`
2. `instance_origin`：允许清单内的 `http:` 或 `https:` 来源，主机为主机名或 IPv4，可选非默认端口；规范值保留 scheme + host + port。公开仓示例：`https://gitlab.example.com`（示例）、`http://192.0.2.10:41101`（示例）、`http://gitlab.example.com:41101`（示例）
3. `project_path`：恰好两段。公开仓示例：`example-group/example-project`（示例）

禁止：

- 从 git remote、环境主机或议题正文推断
- 把 `gitlab.com` / `www.gitlab.com` 写成 `self_hosted`（HTTP 与 HTTPS 皆拒）
- 在来源中内嵌凭据，或把项目路径写进 origin
- 在公开仓写入真实私有来源、内部路径或家庭 / 机房主机名
- 把凭据写入连接记录、账本、缓存或本仓库

## 授权

有效权限仍是交集：指挥官明示授权 ∩ `AuthorizationGrant` 范围 ∩ RoleBinding ∩ 宿主 / 操作系统策略。

自建正本声明要求 grant 点名：

- 实例来源
- 项目路径
- 能力：默认且本 Kit 唯一有效值为 `read_projection`

Journal、Receipt、Projection、路线确认或模型意见不得扩大该交集。

## 失败关闭

下列任一成立即拒绝声明或拒绝动作，不得半套运行态：

| 条件 | 设计错误码（未来实现沿用既有族，不新造写回成功码） |
| --- | --- |
| 来源不在允许清单，或缺少指挥官授权 | `CONTRACT_INVALID` 或既有授权冲突码 |
| `gitlab.com` / `www.gitlab.com` 被当作自建或可写正本（HTTP 或 HTTPS） | `REPOSITORY_NOT_ALLOWED` |
| 自建 Host 出现在 007 只读路径（含 HTTP IPv4:port 示例） | `REPOSITORY_NOT_ALLOWED`（保持 007） |
| 嵌套组、GitHub 身份、未知 scheme、内嵌凭据、origin 带项目路径 | `REPOSITORY_NOT_ALLOWED` 或 `EXTERNAL_REF_INVALID` 或 `CONTRACT_INVALID` |
| 请求离开已声明 origin（含 http→https 不同 origin，或跳到 gitlab.com） | `REPOSITORY_NOT_ALLOWED` 或 `OBSERVATION_UNAVAILABLE` |
| 凭据字面量进入连接记录 | `CONTRACT_INVALID`（失败关闭，并禁止写入） |
| 请求写回而闸门未开或默认为关 | `CONTRACT_INVALID`（不得新造「写回成功」） |

缺失观测不得写成 `0`。

## 默认不写回

- `write_back_enabled` 唯一合法默认值：`false`
- 即使正本声明成立，create/update/close/comment/merge 仍不存在
- Constitution I 与「系统边界」写明第一版 Adapter 只读、外部写回不在已接受范围。本 Kit **不修订** 该条
- 维护者批准 Constitution 修订之前，任何写回 grant 无效

## 不是实现授权

本文件描述判定规则。落地本文件不得被解读为可以开始写 Adapter 或改 CLI。
