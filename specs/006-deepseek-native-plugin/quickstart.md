# Quickstart: DeepSeek 原生插件

要求：Node.js `>=22.19.0` 与 pnpm（根 `package.json` 的 `packageManager`）。不要在仓库根目录做连接。不要改本机默认 `~/.dsh` Profile。

## 门禁

```bash
pnpm test
node scripts/check-version.mjs
git diff --check
```

门禁使用隔离临时目录与 `tests/fixtures/dsh/`，不写回议题。契约测试声明 `@deepseek-ai/cordis`。不要求 PATH 上已有 `dsh`。

## 本机最短路径（实现完成后，可选官方 CLI）

若已安装 `dsh`，使用**隔离**主目录：

```bash
export DSH_HOME=<empty-temp-home>
dsh plugin --profile hufu-fixture add <repo>/packages/hufu-dsh
```

在另一空临时工作区通过插件工具或独立 CLI 连接本机正本（命令与 #3 相同）。预期：Profile bundles 含 `hufu-dsh`；`hufu.status` 与 `pnpm --dir <repo> hufu status` 对同一账本得到结构相等的当前视图。

卸载：

```bash
dsh plugin --profile hufu-fixture remove hufu-dsh
```

预期：工具消失；该工作区 `.hufu/ledger` 仍在，独立 CLI `status` 仍能回放。

无 `dsh` 时，以 `pnpm test` 中的隔离 Bundle 契约测试为准。

## 对等夹具

同一 `events.jsonl` 经独立入口与插件入口各投影 3 次，决策引用与护栏一致；`session`/`run` 缺失时不为 `0`。
