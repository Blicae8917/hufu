---
name: 简化验收
about: 父 Module 已覆盖的小型子任务、Bug 或文档修正
title: ""
labels: ["fix"]
---

## 范围

（不改变行为合同。写清要修什么、引用哪份父合同。）

## 必须交付

-

## 明确不做

-

## 正本

引用父合同：`specs/<parent>/`

## 流程

简化验收：引用父合同，不复制整套 Spec Kit 产物。
预读范围见 `AGENTS.md` 简化验收豁免；交付前仍须运行 `pnpm test`、`node scripts/check-version.mjs`、`git diff --check`。
