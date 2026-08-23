# Research: 015-e2e-pilot

## 1. 验收票而不是引擎

- **Decision**: #60 只做端到端验收。不创建 Milestone / Goal / Todo / PM / Wave Engine。
- **Rationale**: ADR 0006 已废止自行控制面；指挥官禁止本波复活。
- **Alternatives considered**: 用试点票带动第二套调度器（拒绝）。

## 2. 公开夹具延后

- **Decision**: 本波只写大纲。夹具测试等到 #57–#59 有代码。
- **Rationale**: 指挥官明确允许延后；先写会失败的夹具测试会破坏本波 CI。
- **Alternatives considered**: 本波落地失败夹具测试（拒绝）。

## 3. 示例主机

- **Decision**: 与 011 / 013 相同的三个示例来源，均标明示例。
- **Rationale**: 公开安全；RFC 5737 TEST-NET-1。
