# CommandError v1（011 设计增补，未实现）

沿用 003/007 稳定码与退出码族 `0/2/3/4`。本模块不新造「写回成功」或「写回已批准」码。

| code | 退出码 | 本设计下的含义 |
| --- | --- | --- |
| `REPOSITORY_NOT_ALLOWED` | 2 | 自建 Host 走 007 路径；SaaS 冒充自建；`gitlab.com` 被当作可写正本 |
| `EXTERNAL_REF_INVALID` | 2 | 用 `gitlab:` 冒充自建引用，或用 `gitlab-instance:` 走 007 解析器 |
| `CONTRACT_INVALID` | 2 | 缺少允许清单；请求写回而默认关闭 / Constitution 闸门未开；凭据进入连接记录 |
| `DATA_INSUFFICIENT` | 4 | 未来自建投影缓存中没有该引用（未实现） |
| `OBSERVATION_UNAVAILABLE` | 4 | 未来认证读取不可用时不得写成 `0`（未实现） |

刷新或写回失败都不得发明「已写回」码——默认没有写回路径。
