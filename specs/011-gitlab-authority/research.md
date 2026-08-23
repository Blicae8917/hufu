# Research: 011-gitlab-authority

## 1. Kit 编号与父合同

- **Decision**: 使用 `specs/011-gitlab-authority/`。主线最高已占用编号为 `010-upstream-drift`；`011` 在 main 与开放 PR 上均不存在。不复用 `007`，不占用已废止的 M10–M15 编号。
- **Rationale**: 顺序编号与 #49 假设一致；007 是已交付只读投影，复用会把设计票读成改写已接受合同。
- **Alternatives considered**: 复用 007（禁止，会默默扩权）；使用 M11 等废止编号（ADR 0006 已废止，禁止）。

## 2. 本票只设计，不授权实现

- **Decision**: 本 PR 只落地 Spec Kit、设计合同与一条**通过**的设计约束测试。不改 `src/`、不改 CLI、不写 Adapter、不提升版本。未来实现票的**第一条任务**必须是会失败的适配器测试；那些失败测试不得进入本 PR，以免门禁变红。
- **Rationale**: #49 与 ADR 0006 都写明「不是实现授权」。Constitution VII 要求实现先失败测试，但失败的 Adapter 测试会破坏当前 CI。
- **Alternatives considered**: 在本 PR 落地失败的 Adapter 测试（会红）；把 Kit 落地当成开工令（违反 ADR 0006）。

## 3. 与 #8 / 007 的边界（不得默默扩权）

- **Decision**: 007 继续独占：公开 `gitlab.com`、两段 `group/project`、无凭据、无 `Authorization`、Host 仅 `gitlab.com`、自建 / 私有实例失败关闭、端口只有 list。本 Kit 新增合同文件描述 Authority，不改 007 的 `contracts/`。007 `spec.md` 无子 Kit 前向指针惯例，本 PR 不编辑 007。
- **Rationale**: #49 要求证明本票不扩大只读投影。仓库里 004→007 是用新 Kit 解除限制，而不是在父 spec 里加一行指针。
- **Alternatives considered**: 在 007 spec 加前向指针（非既有惯例，跳过）；直接改 007 合同以接受自建 Host（默默扩权，禁止）。

## 4. 「正本」与「影子」

- **Decision**: `task_authority=gitlab` 仍表示 GitLab 原生议题拥有生命周期，Hufu 只投影。#8 是公开 `gitlab.com` 上的只读影子。本票的 Authority 是：操作者显式声明的**自建实例**成为该项目唯一任务正本的来源，而不是另一正本旁边的旁路。默认能力仍是 `read_projection`。写回另闸。
- **Rationale**: Constitution I 已把 GitHub/GitLab 定为只读 Projection。#49 要回答的是「自建实例何时能当正本」，不是「Hufu 开始拥有议题」。
- **Alternatives considered**: 把 Authority 定义成立刻可写（被 Constitution 写回禁令挡住）；发明第四个 `task_authority` 枚举值（无必要，且会改产品正本，超出本票）。

## 5. 身份、授权、失败关闭、默认不写回

- **Decision**:
  - 身份：`instance_kind=self_hosted` + 操作者手填 `instance_origin` + 两段 `group/project`。禁止从 git remote 猜测。`gitlab.com` / `www.gitlab.com` 不得伪造成自建，无论 `http:` 还是 `https:`。
  - 允许清单内的自建来源可以是 `http:` 或 `https:`；主机可以是主机名或 IPv4，并可带非默认端口。规范来源必须保留 scheme + host + port，比较按三者精确匹配（`http://host:41101` 不等于 `https://host:41101`）。来源不得含项目路径，不得内嵌凭据。
  - 公开仓示例（均标明为示例）：保留 `https://gitlab.example.com`；增加 `http://192.0.2.10:41101`（RFC 5737 TEST-NET-1 文档地址）与 `http://gitlab.example.com:41101`。项目路径仍为 `example-group/example-project`。禁止写入真实客户 / 内部地址。
  - 引用：自建工作项使用与 007 不同的 scheme 前缀 `gitlab-instance:`，避免 007 的 `gitlab:` 解析器被静默扩权。007 必须继续拒绝该前缀与自建 Host。
  - 授权：指挥官 `AuthorizationGrant` 允许清单必须点名实例来源与项目路径；能力默认 `read_projection`。Journal / Receipt / Projection 不扩权。
  - 失败关闭：来源不在允许清单、SaaS 冒充自建、明文凭据进入连接记录、未知 scheme、内嵌凭据、带来源路径、嵌套组、未知种类 → 拒绝。不再仅因 `http:` 拒绝已允许清单的自建来源。
  - 默认不写回：`write_back_enabled` 唯一合法默认值是关闭。Constitution 未修订前，写回授权无效。
- **Rationale**: #49 点名四项必须可验收；Constitution III 禁止公开仓写入私有 Endpoint 与凭据。#53 之后指挥官确认真实自建形状包含 HTTP + IPv4 + 非默认端口，须修订本 Kit 而非另开 `013`。
- **Alternatives considered**: 复用 007 的 `gitlab:` scheme 并塞进 Host（会扩大 007）；默认开启写回（违反 Constitution）；把 token 写入 `.hufu/`（禁止）；继续「HTTP 非 HTTPS → 拒绝」（与已授权的自建形状冲突）。

## 6. Constitution 张力

- **Decision**: 核实 Constitution I 与「系统边界」：第一版 GitHub / GitLab Adapter 只读，外部写回不在已接受范围。本 Kit 记录该张力，**不修订** Constitution。未来写回实现被阻断，直到维护者批准修订。
- **Rationale**: 治理条款要求例外先修订 Constitution 再实现。设计票可以描述闸门，不能自己开闸。
- **Alternatives considered**: 在本 PR 修订 Constitution（用户与治理均禁止）；假装不存在张力（后续实现会误读为已批准）。

## 7. ADR 0006 归类

- **Decision**: 本票只属于类 (1) 自建 GitLab AuthorityProvider。明确排除：类 (2) LoopX 桥、类 (3) Renderer、已废止 M10–M15、出站 Runtime、会商、`hufu serve`。
- **Rationale**: ADR 0006 后续约束要求每个后续 Module 证明属于三类之一。
- **Alternatives considered**: 把本票写成「通用控制面」或「出站 Runtime」（与 (a) 冲突）。

## 8. 公开安全示例

- **Decision**: 公开仓只使用标明为示例的占位来源与 `example-group/example-project`。允许的示例来源是 `https://gitlab.example.com`、`http://192.0.2.10:41101`（RFC 5737 TEST-NET-1）与 `http://gitlab.example.com:41101`。禁止真实客户名、内部路径、家庭 / 机房主机、字面量凭据、RFC 1918 / 本机地址。
- **Rationale**: Constitution III 与 #49 必须交付项。文档 IPv4 只用 TEST-NET，避免把操作者真实地址写进公开仓。
- **Alternatives considered**: 使用维护者真实自建 URL（禁止入库）；只用 HTTPS 主机名示例（无法覆盖已授权的 HTTP IPv4:port 形状）。

## 9. #53 之后的来源形状修订（指挥官授权，不另开 013）

- **Decision**: 修订本 Kit，不创建 `specs/013`。允许清单内的自建来源可以是 HTTP 或 HTTPS；请求必须停留在已声明的精确 origin（scheme + host + port）。声明为 `https:` 的来源仍只接受 HTTPS 请求。离开授权 origin 的 redirect（含 http→https 不同 origin、跳到 `gitlab.com`）失败关闭。写回保持关闭。Constitution 不修订。版本保持 `0.1.0`。
- **Rationale**: #53 实现按原 Kit「HTTP 非 HTTPS → 拒绝」失败关闭；指挥官确认真实用法是 HTTP + IPv4 + 非默认端口。这是 011 合同修订，不是新 Module。
- **Alternatives considered**: 另开 013（用户禁止）；把 SaaS `http://gitlab.com` 当成自建（禁止）；放宽 007 解析器（禁止）。
