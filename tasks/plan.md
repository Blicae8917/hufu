# Incremental implementation plan

## Slice 0 — Repository and task contract

Status: implemented locally

- Establish neutral public project identity and boundaries.
- Validate native and external task envelopes.
- Provide deterministic CLI output and failure exit codes.
- Add dependency-free unit and command tests.

Acceptance: all local tests, smoke check, version check, and content-safety scans pass.

## Slice 1 — Typed evidence receipt

Status: proposed; not authorized for implementation

- Define a small receipt claim taxonomy.
- Bind each receipt to task, run, target, input identity, and time.
- Keep dirty or uncommitted code distinguishable from a clean committed snapshot.
- Prove stale evidence is rejected when target identity changes.

Stop and evaluate whether the receipt reduces reviewer effort before continuing.

## Slice 2 — Read-only provider projection

Status: deferred

- Select one public provider interface.
- Read task identity and state without write-back.
- Map provider data into `TaskEnvelope` without duplicating provider status.
- Add recorded-fixture contract tests and explicit freshness behavior.

## Slice 3 — Effect journal and recovery

Status: deferred until a real side-effecting use case exists

- Define `effect_id`, causal ordering, and readback result.
- Demonstrate recovery after interruption without repeating a confirmed effect.
- State and test the limits: no exactly-once guarantee and no authorization from journal state.

## Later candidates

- Optional policy packs.
- Durable-engine adapter.
- Agent-runner adapters.
- Event projection and web console.
- Inter-agent protocol adapter.

These are candidates, not commitments.
