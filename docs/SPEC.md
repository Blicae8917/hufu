# Product Specification

Status: accepted for the `0.0.x` contract phase
Last updated: 2026-08-13

## Objective

Build a provider-neutral task coordination core that lets AI agents resume work, produce reviewable evidence, and hand off safely without forcing users to maintain the same task state in two systems.

## Users and primary jobs

- A project maintainer wants one view of objective, authorization, current run, evidence, and handoff.
- An agent runner needs an explicit input contract and stop conditions.
- An adapter author needs to map an external tracker without stealing ownership of its state.
- A reviewer needs to know what was verified, against which target, and in what causal order.

## Technology choices

- Python 3.11 or newer.
- Standard library only for the initial runtime.
- JSON as the first interchange format.
- Immutable dataclasses at validated contract boundaries.
- `unittest` for initial automated checks.

These choices minimize installation cost while the core contracts are still changing.

## Core objects

| Object | Owns | Does not own |
| --- | --- | --- |
| `ProjectRef` | Stable project identity and repository reference | Repository configuration or credentials |
| `TaskEnvelope` | Objective, source, authorization scope, terminal conditions | External tracker status |
| `Run` (planned) | One execution attempt and its input identity | Long-lived task authority |
| `Effect` (planned) | A stable identity for an external side effect | A claim that the effect occurred exactly once |
| `Receipt` (planned) | A typed validation claim tied to a target | Business completion by implication |
| `JournalEntry` (planned) | Causal record of attempted phases | Authorization or proof that an unrecorded effect did not occur |
| `Handoff` (planned) | Completed work, remaining work, risk, next review point | New execution authority |

## Entry paths

1. `native`: the console owns the durable task identity.
2. `external`: another system owns task state; the console stores a stable reference and derived projection.
3. Ephemeral runs are a later concern and must not require durable task creation when a current-session authorization is sufficient.

## Required commands

```text
python -m hufu validate <task.json>
python -m unittest discover -s tests -v
python scripts/check_version.py
python tests/smoke.py
```

## Project structure

```text
src/hufu/                core contracts and CLI
tests/                   small unit and command tests
examples/                non-sensitive example inputs
docs/                    product and architecture contracts
tasks/                   incremental implementation plan
scripts/                 repository consistency checks
```

## Code style

- Type annotations for public functions and contract fields.
- Pure validation functions before stateful services.
- Small modules with explicit ownership.
- Descriptive tests that assert outcomes, not implementation call order.
- No speculative abstraction for a single provider or runner.

## Testing strategy

- Small tests cover validation rules and immutable outputs.
- Command tests cover exit codes, stdout, and stderr.
- Adapter contract tests will use recorded, sanitized fixtures before live integration tests.
- Side-effecting engines will require readback and recovery tests before they can be enabled.

The initial suite is dependency-free. Coverage tooling may be added when it can be introduced without becoming a runtime requirement.

## Boundaries and non-goals

- No second authoritative task state for external providers.
- No automatic approval, merge, deployment, or production access.
- No background scheduler, heartbeat, quota service, or lease in the core.
- No exactly-once claim for external effects.
- No mandatory independent validator for ordinary tasks.
- No UI protocol or durable database in the first slice.
- No hard dependency on one issue tracker, agent runtime, or workflow engine.

## Success criteria for the contract phase

- A minimal native task validates into an immutable object.
- An external task keeps only a reference; no external status is duplicated.
- Missing objectives, authorization, terminal conditions, or supported source values fail closed.
- The CLI returns deterministic machine-readable output and a non-zero invalid-input status.
- The test suite and version check run locally without network access.
- The repository contains no credentials, private endpoints, or machine-specific paths.

## Open questions

- Which receipt claim types provide the highest value with the least ceremony?
- What minimum event identity is sufficient for safe readback and recovery?
- Should the durable engine be an adapter to an existing workflow runtime or a small built-in store?
- Which provider should be the first adapter after contract review?
- What evidence demonstrates that a web console reduces operator time enough to justify it?
