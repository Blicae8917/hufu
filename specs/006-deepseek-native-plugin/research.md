# Research: 006-deepseek-native-plugin

## 1. 包边界

- **Decision**: 用 pnpm workspace 增加 `packages/hufu-dsh`。根包 `hufu` 继续零运行时依赖。Cordis 只作为 `hufu-dsh` 的依赖出现。根包 `src/hufu/**` 禁止 `import` Cordis 或 `hufu-dsh`。
- **Rationale**: ADR 0003：领域核心与 Standalone 不组装 Cordis；Cordis 随 DeepSeek Profile Module 引入。
- **Alternatives considered**: 根包 optionalDependency 引入 Cordis（容易被 CLI 误装）；把插件源码放进 `src/hufu/`（边界无法用打包图证明）。

## 2. 安装契约与是否依赖 `dsh` 二进制

- **Decision**: 产品快速开始使用官方命令 `dsh plugin --profile <name> add <file-spec>`。门禁里的真装真卸执行**同一契约**的隔离步骤：临时 Profile 目录、`file:` 说明符、读取 `dsh.bundle.patch`、调和 `dsh.profile.bundles`、用 `@deepseek-ai/cordis` mount/dispose。PATH 上若有 `dsh`，可另加可选烟测；没有 `dsh` 时不得把该烟测标为通过，也不得跳过契约测试。
- **Rationale**: 规格允许「测试中等价的、同一契约的隔离调用」。不把整个 Harness CLI/UI 搬进 `pnpm test`，符合「不照搬上游基础设施」。
- **Alternatives considered**: CI 必须安装 `@deepseek-ai/dsh`（体积大、pnpm 11 与本仓 pnpm 10 冲突、网络副作用）；只做 mock 不 mount Cordis（无法证明 Effect 可撤销）。

## 3. 持久化

- **Decision**: DeepSeek 入口与独立入口都把项目事实写入工作区 `.hufu/ledger`（既有 JSONL），由 `storage-domain.ts` 实现 Hufu StorageDomain 包装。不在本模块启用 Host JSON Storage Provider，也不把 Session 存储当正本。
- **Rationale**: 双入口对等只需同一事件语义；换 Host 存储是可逆后续，不阻塞装上/卸下。
- **Alternatives considered**: 本模块就接 `ctx.storageDomain` JSON Provider（要证明与 JSONL 对等，范围膨胀）；事实只写 Session Log（违反 Constitution）。

## 4. 服务与工具名

- **Decision**: Cordis Context 上注册 `ctx.hufu` 服务（方法对应既有领域函数）。工具名：`hufu.validate`、`hufu.connect`、`hufu.doctor`、`hufu.status`、`hufu.handoff`、`hufu.decide`。禁止裸名 `status`/`connect`。载荷与 CLI 相同语义（JSON 对象，decide 仍用互斥 kind + 文件或内联对象）。结果形状与 CLI 成功/失败 JSON 一致，便于对等比较。
- **Rationale**: ARCHITECTURE 要求 `ctx.hufu*` 前缀；Consumer 不得解析另一 Consumer 的文本。
- **Alternatives considered**: 只注册服务不注册工具（模型无法直接调用）；包装 `hufu` CLI 子进程（文本合同，禁止）。

## 5. Bundle 补丁

- **Decision**: `packages/hufu-dsh/cordis.patch.yml` 必须自包含：插入 Hufu 插件行，引用包内 `plugin` 入口。测试覆盖「整块替换」：一份不完整的用户补丁覆盖同 id 后，Hufu 行若被换掉则服务不可用（fail closed），Hufu 自己的补丁不得依赖深合并。
- **Rationale**: 上游用户 patch 不做深合并。
- **Alternatives considered**: 多行补丁依赖默认 base 配置深合并（上游会丢字段）。

## 6. 三种生命周期

- **Decision**:
  1. 无 `dsh.bundle` 的包只作为普通依赖 → 不进入 bundles，至多警告；
  2. 无有效 Bundle 却被写入 `dsh.profile.bundles` → 加载失败，`CONTRACT_INVALID`（或测试断言抛出等价错误）；
  3. Cordis `dispose` / 从 bundles 移除并卸载 → 工具与监听器消失，`.hufu/ledger` 仍在。
- **Rationale**: COMPATIBILITY.md 第 8 条与三种生命周期段落。
- **Alternatives considered**: 用 `rm node_modules` 当卸载证明（规格禁止）。

## 7. CurrentView 对等

- **Decision**: 比较函数对 `projectCurrentView` 的规范化 JSON（既有键排序）做结构相等。允许忽略仅 Host 注入且双方均为 `unavailable`/`null` 的观测槽位中的 freshness 字符串差异，但 `value` 不得一侧为 `0`。`view_schema_version` 仍为 `1`。夹具含 connect、work item、handoff、packet。
- **Rationale**: 规格明确不要求逐字节相同序列化。
- **Alternatives considered**: 比较 CLI stdout 字符串（把 Consumer 文本当合同）。

## 8. 上游基线

- **Decision**: 实现动手前再读一次公开 `master`。本 Plan 记录 2026-08-16 观测：`47f943859bef60e4160492346772ded9b24f765a`，`@deepseek-ai/cordis` `4.0.1`，`@deepseek-ai/dsh` `0.1.0-rc.5`。漂移则先改 `docs/COMPATIBILITY.md` 再写代码。测试常量 `CORDIS_IMPLEMENTATION = "@deepseek-ai/cordis"`。
- **Rationale**: FR-019；不声明浮动 master。
- **Alternatives considered**: 跟踪 latest tag（上游无稳定 tag 绑定）。

## 9. 错误码

- **Decision**: 不新增退出码数字。Bundle 无效 / 显式加载失败 → `CONTRACT_INVALID`（2）。插件未挂载时工具不存在，测试断言工具列表不含 `hufu.*`，不为「未装插件」发明成功路径。既有领域错误码原样透传。
- **Rationale**: 规格要求优先复用失败类别。
- **Alternatives considered**: 新码 `PLUGIN_MISSING`（扩大合同，无独立用户价值）。
