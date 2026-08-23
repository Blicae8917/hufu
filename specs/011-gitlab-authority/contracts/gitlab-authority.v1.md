# GitLab Authority v1（设计边界）

本文件回答：哪些能力仍只读，哪些才进入 Authority。落地本文件 **不是** Adapter 实现授权。

引用：[ADR 0006](../../../docs/adr/0006-upstream-positioning.md)、[#49](https://github.com/Blicae8917/hufu/issues/49)。本票是 ADR 0006 类 (1) 自建 GitLab AuthorityProvider。

## 仍只读（#8 / 007，本票不得改写）

| 能力 | 归属 |
| --- | --- |
| 公开 `gitlab.com` 两段 `group/project` 的经典 Issue 投影 | 007 |
| 无凭据、不发送认证头 | 007 |
| Host 仅 `gitlab.com`；自建 / 私有实例失败关闭 | 007 |
| 端口只有 list；禁止 create/update/close/comment/merge | 007 |
| 议题正文、评论不可信，不进指令或授权 | 007 |
| 默认 `status` 不联网；无后台刷新 | 007 |
| Merge Request / 史诗 / 嵌套组不作为工作项 | 007 |
| 本机账本不复制议题生命周期 | 007 |

## 进入 Authority（本 Kit 只设计）

「进入 Authority」指：自建实例可以被声明为该项目唯一的 `task_authority=gitlab`，使该实例的原生议题成为任务生命周期所有者。这 **仍默认不写回**。

| 能力 | 进入 Authority 的含义 | 默认 |
| --- | --- | --- |
| 声明自建实例为正本 | 操作者显式给出实例来源 + 两段路径，且授权允许清单包含该来源 | 未声明则失败关闭 |
| 自建工作项引用 | 使用 `gitlab-instance:`，不扩大 007 的 `gitlab:` | 007 解析器继续拒绝 |
| 认证读取 | 若未来实现需要，只引用宿主凭据机制 | 本票不实现；Hufu 不存凭据 |
| 写回 | 创建 / 修改 / 关闭 / 评论 / 合并 | **关闭**；Constitution 修订前无效 |

进入 Authority **不等于** 可写，也 **不等于** 把 SaaS `gitlab.com` 客户项目升级为可写正本。

## 明确不是本票

- 复活 M10–M15（Goal/Todo/Scheduler/Heartbeat、PM Engine、Wave Engine、完整 Web）
- 出站 Runtime、会商、`hufu serve`
- Hufu↔LoopX 桥（#50）、企业 Renderer
- 修订 Constitution，或把本 Kit 当作写回开工令
