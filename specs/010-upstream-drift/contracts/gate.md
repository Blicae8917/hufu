# 合同：上游漂移门禁

## 命令

```bash
node scripts/check-upstream-drift.mjs
node scripts/check-upstream-drift.mjs --mode=static
node scripts/check-upstream-drift.mjs --mode=observe
node scripts/check-upstream-drift.mjs --mode=release
```

只读 `docs/COMPATIBILITY.md` 的「门禁核对表」。可用 `HUFU_COMPATIBILITY_PATH` 指向测试夹具。
`--mode` 也可用 `HUFU_UPSTREAM_GATE_MODE` 提供。省略时默认为 `static`。

未知 mode 视为契约错误。不得用 `continue-on-error` 代替模式拆分。不得自动改写已接受 SHA。

## 模式

| 模式 | 用途 | 是否查询实时 ref | 单纯 HEAD 前进 |
| --- | --- | --- | --- |
| `static` | 普通 PR / 默认 CI：接受表静态完整性 | 否 | 不失败 |
| `observe` | 定时或人工 HEAD 观测 | 是（`git ls-remote`） | 报告 `drift`，退出 0；不是不兼容 |
| `release` | 发布前接受基线完整性 | 是 | 不失败 |

`refs/tags/*` 视为不可变 tag。`refs/heads/*` 视为可前进分支。

## 退出码

| 码 | `static` | `observe` | `release` |
| --- | --- | --- | --- |
| 0 | 表可解析且记录 SHA 合法 | `match`，或 `drift`（观测，非不兼容） | `match`，或 `head_advanced`（记录 commit 仍可达） |
| 1 | 契约错误 | `unavailable`、契约错误、或 `HUFU_DENY_NETWORK=1` 未核对 | `tag_moved`、`unreachable`、`unavailable`、契约错误、或未核对 |

`drift` 只表示记录 SHA 与实时 HEAD 不同，需要人再观察，不得写成不兼容，也不得把已接受基线改成 HEAD。

## 输出字段

顶层：`mode`、`status`、`exitCode`、`message`、`checked_at`、`upstreams`。
观测性 `drift` / `head_advanced` 必须带 `incompatibility: false`。

每个上游：`name`、`repository`、`ref`、`recorded`、`actual`（`static` 为 `not_queried`；取不到则为 `unavailable`）、`distance`（本模块为 `data_insufficient`，不得为 `0`）、`observed_at`。

`status`：`static_ok`、`match`、`drift`、`head_advanced`、`tag_moved`、`unreachable`、`unavailable`、`contract_invalid`、`unchecked`。

## 离线

`HUFU_DENY_NETWORK=1`：

- `static`：不查询网络，仍做表完整性；退出码 0；不得打印「通过」或「未核对」。
- `observe` / `release`：不调用 ls-remote，stdout/stderr 含「未核对」，退出码 1，不得打印「通过」。
