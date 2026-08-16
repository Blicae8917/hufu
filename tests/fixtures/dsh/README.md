# DeepSeek 双入口夹具

本目录存放 Issue #7 契约测试用的版本化事件与非法 Bundle 样本。

- `events.jsonl`：本机连接、一个工作项、一条交接、一份 `decision.packet_recorded`。不含议题正文、凭据或本机绝对路径。
- `plain-dep/`：没有 `dsh.bundle` 的普通依赖，不得被当成已启用组合层。
- `invalid-bundle/`：声明了 Bundle 但 patch 文件缺失，显式列入加载项时必须 `CONTRACT_INVALID`。
- `incomplete-hufu-override.yml`：同 id 整块替换且未重述字段，Hufu 行不得再被视为有效。

测试设置临时 `DSH_HOME`，不得读写维护者 `~/.dsh`。
