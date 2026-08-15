# ADR 0001：分离任务正本、执行事实与呈现层

- 状态：候选，待 `0.1.0` 设计 Pull Request 接受
- 日期：2026-08-14
- 决策所有者：Hufu 维护者

## 背景

Agent 协调会组合来自 Issue 跟踪器、本地执行、Evidence、Session 和操作者界面的事实。
如果把它们都视为同一个 Provider，或存进一个可变状态模型，就会产生相互竞争的任务正本、
隐藏 freshness，并让 UI 或执行历史看起来像是在授予权限。

Hufu 还需要同时支持外部任务系统、纯本地工作、可选 LoopX Engine 和多个 Renderer，
但不能把其中任何一个的所有权假设引入供应商中立核心。

## 决策

Hufu 把系统分为三条正交轴：

1. **任务正本**：每个 Project 恰好声明 `github`、`gitlab` 或 `local` 之一。
   GitHub 和 GitLab 保留原生 Issue 生命周期所有权；Local 使用 Hufu append-only Ledger。
2. **执行事实**：Hufu 拥有自身 Run、Session、Workspace、决策传递、Evidence、Receipt、Effect readback、
   Handoff、角色绑定和观测的有界记录。零拷贝决策流只引用任务正本及既有授权，不拥有 WorkItem
   生命周期或审批状态。LoopX 可以作为 EngineProvider 或机制来源，
   但不是任务正本。
3. **呈现层**：模型 Tool、CLI 和 Web 界面是来源事实的 Consumer 或 Renderer，可以计算依赖和下一步视图，
   但不拥有任务生命周期。

Provider Projection 包含原始身份、链接、观测时间和 freshness。V1 中它们只读。
外部 Issue 状态转换不会被复制到本地 Ledger，伪装成第二套事件正本。

第一版本地纵切使用 append-only JSONL 和前台 CLI。只有 CLI 代表性试点通过效能门禁，前台 loopback
工作台才进入 `0.1.0`；否则顺延到后续 Module。两条路径都不引入数据库、Message Queue、Daemon、
Scheduler、Heartbeat、Quota Service、多主机协调、自动 Agent 启动或外部写回。

## 仓库边界

Hufu 只保存已采纳、公开安全的产品正本和必要的简短来源说明。
外部源码 Mirror、长篇研究、横向比较、内部经验和未采纳设计继续留在公开仓库之外。
Hufu 内部不建立被忽略的研究资料区。

## 后果

### 正面影响

- Project 拥有唯一、明确的任务生命周期所有者。
- 执行 Evidence 可以演进，而不改变 Provider 权威性。
- CLI、通过门禁后才进入的 loopback HTML 和未来 Renderer 可以复用相同合同。
- 外部状态可以刷新或重建，而不会成为隐藏的 Hufu 状态。
- 可以分阶段采用 LoopX 能力，而不让其控制面自动取得任务或授权所有权。

### 成本与约束

- 视图必须携带来源和 freshness，不能把所有内容压平为一个 Status 字段。
- Local 与外部任务正本需要在同一个合同后实现不同生命周期。
- 派生的阻塞、ETA 和下一步需要可追溯的输入身份。
- 未来写回或 Engine 控制需要新的决策，不能作为 Adapter 便利功能顺手加入。

## 考虑过的替代方案

### 把 GitHub、GitLab、Local 和 LoopX 放进同一个 Provider 枚举

拒绝。LoopX 提供执行引擎或兼容事实，不拥有权威 Issue 生命周期；共享枚举会把两条独立轴合并。

### 把外部 Issue 状态镜像到 Hufu 任务数据库

拒绝。该方案会创建第二个生命周期来源，引入冲突解决义务，并让过期状态看起来具有权威性。

### 让 Dashboard 拥有标准化状态

拒绝。呈现层会因此成为意外的控制平面，其他 Renderer 也无法重建相同视图。

### 从持久 Engine 和后台 Scheduler 起步

V1 拒绝。前台命令和 append-only 本地记录已经足以验证产品结果，新增失败模式尚无合理依据。

## 后续约束

每个 `0.1.0` Module 都必须在 Spec Kit Constitution Check 中保持此分离。
任何 Provider 写回、自动 Agent 启动、EngineAdapter 控制、远端 UI 绑定或数据库提案，
都需要新的 ADR 或对本决策的显式修订。
