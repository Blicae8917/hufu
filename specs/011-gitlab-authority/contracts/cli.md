# CLI 合同: 本设计票不改变 CLI

007 / #8 的 CLI 合同继续有效。本 Kit **不**增加子命令、不放宽 `--repository`、不增加写回标志。

## 本 PR（必须保持）

| 观察 | 期望 |
| --- | --- |
| `hufu connect --task-authority gitlab` + 自建 Host | 仍按 007 失败关闭 |
| `hufu status --refresh` 在 gitlab.com 正本 | 仍按 007 只读 |
| 新增写回 / token / `--instance` 等标志 | **不得**出现 |
| 版本 | `0.1.0` |

## 未来实现票（未授权）

若维护者接受本设计且另开实现 PR，CLI 差异也只能在**不扩大 007** 的前提下增加显式自建声明，并且：

- 默认不写回
- 不存储凭据
- `gitlab.com` 不得走可写路径
- Constitution 未修订前不得出现写回成功路径

上述未来差异不是本 PR 的行为合同。
