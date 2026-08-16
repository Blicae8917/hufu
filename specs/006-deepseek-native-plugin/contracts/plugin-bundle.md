# 合同: Plugin Bundle 与三种生命周期

## 包清单

`packages/hufu-dsh/package.json` MUST 包含：

```json
{
  "name": "hufu-dsh",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`cordis.patch.yml` MUST 能在无深合并的情况下插入 Hufu 插件行。

## 生命周期

| 步骤 | 合法结果 |
| --- | --- |
| 安装无 Bundle 声明的普通依赖 | 依赖可存在；`bundles` 不含它；Hufu 工具不出现 |
| 将无有效 Bundle 的名字写入 `bundles` 并加载 | 失败关闭；不得部分启用 |
| `file:` 安装 `hufu-dsh` 并调和 bundles 后 mount | `ctx.hufu` 与 `hufu.*` 工具可用 |
| dispose / 从 bundles 移除后卸载 | `hufu.*` 工具不可用；工作区账本文件仍在 |

官方 CLI 形态（快速开始，非门禁硬依赖）：

```text
dsh plugin --profile hufu-fixture add <repo>/packages/hufu-dsh
dsh plugin --profile hufu-fixture remove hufu-dsh
```

说明符 MUST 为相对路径或 `file:`。不得把裸包名解析成功当成通用验收。

## 隔离

测试设置 `DSH_HOME`（或等价）为临时目录。MUST NOT 读写维护者 `~/.dsh`。
