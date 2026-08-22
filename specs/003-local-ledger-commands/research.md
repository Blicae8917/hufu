# Research: 003-local-ledger-commands

## 1. 摘要算法与运行时依赖

- **Decision**: 在 `src/hufu/digest.ts` 实现 RFC 8785 有界规范化（对象、数组、字符串、整数、布尔、null），再用 `node:crypto` 做 SHA-256，输出小写十六进制。`digest_spec_version` 固定为 `"1"`。不新增 npm 运行时依赖。事件载荷避免浮点数，时间一律 ISO-8601 字符串。
- **Rationale**: 架构正本要求 RFC 8785 + SHA-256 且跨平台逐字节相同。M1 与 ADR 0003 要求领域核心零运行时依赖；完整第三方 JCS 包会引入新依赖与许可证审查，本模块规模不足以证明净收益。有界子集覆盖本模块 Schema 实际用到的 JSON 类型，并用 RFC 8785 附录样例与自有夹具锁死字节。
- **Alternatives considered**: 引入 `canonicalize` / `json-canonicalize`（新增依赖，Constitution VI 需更强理由）；只用 `JSON.stringify` 键排序（不是 RFC 8785，字符串转义与码点排序会漂移）；把摘要推迟到后续模块（违反 #3 必须交付）。

## 2. 账本路径、锁与撕裂写入

- **Decision**:
  - 事件文件：`.hufu/ledger/events.jsonl`，UTF-8，每行一个 JSON 对象，行结束仅为 LF。
  - 锁文件：`.hufu/ledger/write.lock`，`fs.open(path, "wx")` 独占创建；写入 `{writer_id, pid, created_at}` 后保持打开直至本次追加结束再关闭并删除。
  - 取锁失败（`EEXIST`）→ `LEDGER_WRITER_CONFLICT`，退出码 3。不排队、不超时等待、不覆盖删除他人锁。
  - 中间行畸形 → `LEDGER_CORRUPT`，读写 fail closed。
  - 仅最后一行无完整 JSON 或无 LF → 读取报告未完成追加（`availability=conflict`）；`doctor` 默认只建议；`hufu doctor --repair-truncated-tail` 在持锁下截除该尾部并追加 `hufu/ledger.repair.truncated_tail`。
- **Rationale**: 架构把独占创建锁、撕裂策略和「不静默修复」写成可验收合同；`wx` 在 Windows 与 POSIX 语义一致。崩溃残留锁视为冲突，避免把「清锁」做成抢锁通道。
- **Alternatives considered**: `proper-lockfile`（依赖 + 过期抢锁，违反 fail closed）；把锁放在事件文件本身的 `flock`（Windows 可移植性差）；自动删除 stale lock（会让第二写者在第一写者仍存活时接管）。

## 3. 冷启动与 connect 参数

- **Decision**: `hufu connect` 必填 `--project-id`、`--repository`、`--task-authority local`、`--commander`、`--grant-scope`。可选 `--project-lead`（默认等于指挥官）、`--grant-expires`（ISO-8601；缺省表示无终止）。一次成功写入四条事件（连接、指挥官声明、授权签发、`project_lead` 绑定），共享同一幂等键前缀；任一步失败则不提交半套（实现上先在内存构造四条再一次性追加）。相同载荷重提幂等返回原 `event_id`。`github`/`gitlab` → `TASK_AUTHORITY_UNSUPPORTED`，退出码 2。
- **Rationale**: 架构冷启动序列与 SPEC「不存凭据、不从外部系统猜测」一致。不读 git remote，避免网络与 git 耦合。
- **Alternatives considered**: 从 `git remote -v` 推断仓库（隐式 git/网络）；允许无授权先连接（违反授权本体）；把四条事件拆成四个命令（增加操作者步骤且易留下半套）。

## 4. 错误合同与退出码

- **Decision**: 四个新命令成功与失败都向 stdout 写一个 JSON 对象（键排序）。失败对象含 `ok: false` 与 `error: { code, schema_version, message }`。退出码：`0/2/3/4` 按规格映射。`validate` 保持 M1（失败走 stderr、退出码 2）。未知子命令退出码 `1`。错误码见 Assumptions / `contracts/command-error.v1.md`。
- **Rationale**: SPEC 要求消费者不解析人类句子。保留 `validate` 避免破坏 M1 合同与样例脚本。
- **Alternatives considered**: 四命令失败也只写 stderr（机器消费者不稳定）；把 `validate` 一并改成新错误信封（范围外回归）；用退出码 1 表示全部失败（与产品规范冲突）。

## 5. 工作项如何进入账本

- **Decision**: 不增加第五个产品命令。`src/hufu/work-item.ts` 导出领域函数，供测试与后续模块调用，追加 `hufu/work_item.opened`。`status` 在无工作项时仍成功，相关事实为 `data_insufficient`。`handoff` 必填 `--work-item`，找不到则 `DATA_INSUFFICIENT`、退出码 4。
- **Rationale**: Issue 只授权四个命令；工作项生命周期仍必须可测。领域服务保持 CLI 边界干净。
- **Alternatives considered**: `hufu work-item open`（第五命令，超出 Issue）；在 `connect` 时强制创建一个默认工作项（伪造任务）；让 `handoff` 顺便创建工作项（混杂授权与任务创建）。

## 6. CurrentView 与刷新

- **Decision**: `status` 只回放本地账本。权威本机事实 `fact_class=authoritative`、`freshness=not_applicable`。交接等自有观测 `fact_class=observed`、`freshness=fresh`。派生的下一步/阻塞 `fact_class=derived`。传入 `--refresh` 或等价参数 → `CONTRACT_INVALID`、退出码 2。项目级 `stale_after_hours` 默认 24，本模块写入连接记录但不用于把 `local` 正本标 stale。
- **Rationale**: SPEC 明确 `status` 默认读缓存/本地，显式刷新属 Provider 模块（#4）。本模块无外部投影，联网刷新没有合法对象。
- **Alternatives considered**: 预留 `--refresh` 空操作成功（会让人以为已刷新）；在 M2 实现 GitHub 拉取（属 #4）。

## 7. 测试入口扩展

- **Decision**: `package.json` 的 `test` 改为 `tsc && node --test dist/tests/`，自动收录本模块新增测试文件。版本保持 `0.1.0`。
- **Rationale**: M1 显式列举两个文件；继续列举会每次加测试都改门禁脚本。`dist/tests/` 仍只跑本仓库测试。
- **Alternatives considered**: 继续手写文件列表（易漏）；引入 Vitest（ADR 禁止本阶段膨胀工具链）。

## 8. 显式项目根（#40）

- **Decision**:
  - 六条有界命令共用解析顺序：`--project-root` → `HUFU_PROJECT_ROOT` → `process.cwd()`。
  - 环境变量名取既有 `HUFU_*` 前缀下最短一致名 `HUFU_PROJECT_ROOT`（Issue 未另给名字）。
  - 相对路径相对进程 cwd 落实；成功后输出顶层 `project_root`（绝对、可访问的目录）。
  - 标志以无值开关出现、来源为空/空白、路径不存在或不是目录 → `CONTRACT_INVALID`、退出码 2。
  - 解析成功后的命令失败仍带 `project_root`。解析失败不猜测路径。
  - `.hufu/ledger/` 仍挂在该根下。不移动旧账本，不引入配置文件，不新增退出码，不把 Windows 加入 CI。
  - Windows 盘符、混用分隔符与 UNC 用 `path.win32` 做契约测试，即使 CI 只跑 Ubuntu。
  - #38 第 3 项没有 Windows `pnpm test` 失败输出；本增量不猜测运行时缺陷，只吸收「需要显式工作目录合同」这一切片。
- **Rationale**: Issue 要求把 cwd 从隐式假设提升为可校验输入，并保留既有 `.hufu` 落点。顶层字段避免改 CurrentView v1。`HUFU_PROJECT_ROOT` 与 `HUFU_DENY_NETWORK` / `HUFU_COMPATIBILITY_PATH` 一致。
- **Alternatives considered**: 只改文档（#38 已做，无法作为逃生舱）；配置文件（Issue 禁止）；把 `project_root` 写入 CurrentView 或账本（改领域合同）；新增退出码；把 Windows 加入 CI 矩阵（属独立基础设施决策）。
