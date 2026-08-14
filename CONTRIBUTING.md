# Contributing

Hufu is intentionally contract-first and incremental. Small changes with explicit evidence are preferred over broad framework additions.

## Before opening a change

1. Describe the user problem and the current limitation.
2. State which contract or adapter owns the behavior.
3. List non-goals and any new side effects.
4. Add or update a test that fails before the implementation.
5. Keep external systems authoritative for their own state.

## Local checks

```bash
python3 -m unittest discover -s tests -v
python3 scripts/check_version.py
python3 tests/smoke.py
```

The suite must run without network access or installed runtime dependencies.

## Pull requests

A pull request should include:

- the problem and chosen boundary;
- tests and commands actually run;
- compatibility or migration impact;
- security and side-effect impact;
- remaining risks or intentionally deferred work.

Adding a scheduler, durable store, provider adapter, runner integration, or UI protocol requires a written architecture decision before implementation.
