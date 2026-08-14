# Architecture

## System shape

```text
Console / API
     |
Core contracts ---- derived evidence and run views
     |
Policy packs ------- optional project rules
     |
Provider adapters -- external tracker or native registry
     |
Engine adapters ---- optional durable execution and recovery
     |
Runner adapters ---- agent processes and hosted runtimes
```

The core is the plug socket, not the appliance. Providers, engines, and runners can be replaced as long as they satisfy the contracts.

## Ownership rules

### Core

Owns stable, provider-neutral identities and invariants. It must not import a provider SDK or assume a specific workflow engine.

### Provider adapter

Reads an external task and produces a projection. Any write-back must use the provider's concurrency and permission model. The provider remains authoritative for its task state.

### Policy pack

Adds optional dispatch, review, evidence, or handoff rules. Policy cannot create authorization. Project-specific policy must not leak into the general core.

### Engine adapter

May implement durable steps, retries, journals, quotas, or scheduling. It operates a run but does not own the task's business authorization.

### Runner adapter

Starts, observes, and stops a supported agent runtime. It receives a bounded task contract and returns events or evidence; it does not broaden scope.

### Console

Shows projections of authoritative data. A view may be rebuilt from provider and event records; it should not become a hidden second source of truth.

## Recovery invariant

Before retrying a side effect, a recovery path must query the target using a stable `effect_id` or equivalent idempotency key. A missing journal entry is not evidence that the effect did not happen. The journal provides causal context, not exactly-once semantics.

## Validation invariant

A future receipt must bind at least:

- claim type;
- target identity;
- input or code identity;
- causal predecessor or run identity;
- result and observation time;
- validator identity when independence matters.

An independent validator is warranted only when a high-risk acceptance claim could be changed by the same change being validated. Merely using a different file path is not independence.

## Initial implementation

The current implementation intentionally stops at `TaskEnvelope` validation. Each additional layer must arrive as a tested vertical slice, not as a pre-selected platform stack.
