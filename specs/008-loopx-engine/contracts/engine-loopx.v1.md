# Engine-loopx Adapter v1（机制目录，非控制面）

## 端口

本模块在领域核心之后提供只读分类端口，供 `decide` 校验载荷。它**不是**任务正本端口。

```text
EnginePort.assertBindable(payload) -> { engine_id: "loopx-mechanisms" }
EnginePort.assertTypedResult(payload, snapshot) -> TypedResult
EnginePort.assertReceipt(payload, snapshot) -> Receipt
```

禁止出现的方法名与行为：`schedule`、`heartbeat`、`quotaSpend`、`startAgent`、`createGoal`、`createTodo`、`writeIssue`、`fetchUpstream`。

## 拒绝清单（测试锁）

下列输入必须失败关闭，且不得写入账本工作项：

1. `engine_id` ≠ `loopx-mechanisms`
2. 载荷含 `goal_id` / `todo_id` / `registry` 并当作工作项或正本
3. 载荷含 `scheduler_hint`、`quota`、`heartbeat`、`next_cli_actions`
4. 要求自动启动 Agent 或出站 Session
5. 把 `loopx` 发行包或私有 Endpoint 写进连接记录

## 依赖锁

根目录与 `packages/*` 的 `package.json` 不得把 `loopx` 列入任何依赖字段。源码不得 `import` 名为 `loopx` 的包，不得加入上游源码树。

## 与决策流

TypedResult / Receipt 只引用既有 `decision_id` / `envelope_id` / `effect_id`。效果读回仍只通过 `EFFECT_DELTA`。Adapter 不得执行外部命令、不得扫描 git、不得访问网络。

## 夹具义务

`tests/fixtures/engine/` 至少包含：

1. 合法选用 `loopx-mechanisms`
2. 合法 `kind=progress` 与 `kind=stop` 结果
3. 合法核验回执
4. 含 `goal_id` 的非法映射
5. 含 `scheduler_hint` 的非法控制面
6. 未绑定即提交 result 的对照
