# 合同：上游漂移门禁

## 命令

```bash
node scripts/check-upstream-drift.mjs
```

只读 `docs/COMPATIBILITY.md` 的「门禁核对表」。可用 `HUFU_COMPATIBILITY_PATH` 指向测试夹具。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 表中每个上游的记录 SHA 等于 `git ls-remote` 得到的真实 ref |
| 1 | 漂移、`unavailable`、契约错误，或 `HUFU_DENY_NETWORK=1` 未核对 |

## 输出字段

每个上游：`name`、`repository`、`ref`、`recorded`、`actual`（取不到则为 `unavailable`）、`distance`（本模块为 `data_insufficient`，不得为 `0`）、`observed_at`。

## 离线

`HUFU_DENY_NETWORK=1`：不调用 ls-remote，stdout/stderr 含「未核对」，退出码 1，不得打印「通过」。
