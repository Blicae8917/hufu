# 参与贡献

Hufu 刻意采用合同优先、插件优先和增量交付的方式。相比一次引入大范围框架，更推荐带有明确证据、
能够独立卸载和验证的小型变更。

## 提交变更前

1. 说明用户问题和当前限制。
2. 说明哪个合同或适配器拥有相关行为。
3. 列出非目标以及任何新增副作用。
4. 在实现前新增或更新一个能够失败的测试。
5. 外部系统必须继续拥有自身状态的权威性。
6. 插件变更必须说明 Service Definition、Provider、Consumer、Event 和 Effect 清理边界。
7. DeepSeek Harness、其他 Host 或 LoopX 的采用不得绕过 Hufu 的任务正本和授权合同。

## 当前基线的本地检查

以下命令对应当前 Python 实现。在 Cordis 技术基线 Module 合并前仍然有效：

```bash
python3 -m unittest discover -s tests -v
python3 scripts/check_version.py
python3 tests/smoke.py
```

测试套件必须能够在无网络访问、未安装运行时依赖的环境中运行。
工具链迁移必须在同一 Pull Request 中提供等价的 typecheck、lint、unit test、coverage、build、
版本一致性和 `git diff --check` 门禁，并同步更新本文件与 `AGENTS.md`。

## Pull Request

Pull Request 应包含：

- 问题及所选择的边界；
- 实际运行的测试和命令；
- 兼容性或迁移影响；
- 安全和副作用影响；
- 剩余风险或有意推迟的工作。

在实现 Scheduler、持久存储、Provider、RuntimeProvider、EngineProvider 或 UI 协议前，必须先记录架构决策。

## DeepSeek Harness 生态贡献

Hufu 以独立 `dsh-plugin` 参与 DeepSeek Harness 生态，并在每个发布系列记录验证过的 Harness、Cordis、
Node 和公开插件 API 基线。当前官方不接受外部 Pull Request；发现通用问题时先通过 Discussion
提交可复现证据。若未来贡献政策开放，只向上游提交与 Hufu 产品治理解耦的通用修复。

采用或改编 LoopX 等第三方源码时，Pull Request 必须列出来源文件、许可证、改造边界和特征测试，
并在需要时更新 NOTICE。
