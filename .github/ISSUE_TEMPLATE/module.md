---
name: 完整 Module
about: 具有独立用户价值、跨模块合同或架构影响的 Module Issue
title: ""
labels: ["module"]
---

## 范围

（写清用户价值、合同边界与验收口径。）

## 必须交付

-

## 明确不做

-

## 正本

- Constitution：`.specify/memory/constitution.md`
- 产品 / 架构：`docs/SPEC.md`、`docs/ARCHITECTURE.md`
- 适用 ADR：
- 功能合同：`specs/`（本 Issue 走完整 Spec Kit 后生成）

## 流程

完整 GitHub 官方 Spec Kit：已接受 Issue → Spec → Plan → 依赖有序 Tasks → Branch → Pull Request → Review → Merge → Issue 关闭。
实现行为前必须先编写一个会失败的测试。
