# Hufu (虎符)

Hufu is a small, provider-neutral foundation for coordinating AI-agent work without creating a second source of truth. Its name comes from the ancient Chinese tally used to prove that a command was genuinely authorized before it could be carried out.

The project starts with one deliberately narrow capability: validating a durable task envelope that binds an objective to a project, an authorization scope, terminal conditions, and a source. External trackers remain authoritative for their own task state.

## Why this exists

Agent work is often split across issue trackers, chat sessions, command output, and handoff notes. That makes it hard to answer four basic questions:

- What is the exact objective?
- What is the agent allowed to change?
- What evidence proves the result?
- Where should a failed run resume?

This project aims to answer those questions with stable contracts and adapters, while avoiding a parallel workflow that users must maintain by hand.

## Current scope

Version `0.0.1` provides:

- a minimal `TaskEnvelope` contract;
- `native` and `external` task sources;
- explicit authorization scope and terminal conditions;
- a zero-dependency validation command;
- no scheduler, database, network calls, or external side effects.

It does **not** yet provide a web console, durable run engine, issue-tracker adapter, agent runner, receipt store, or automatic recovery.

## Quick start

Requirements: Python 3.11 or newer. Runtime dependencies: none.

```powershell
$env:PYTHONPATH = "$PWD\src"
py -3 -m hufu validate examples/task.json
py -3 -m unittest discover -s tests -v
py -3 scripts/check_version.py
```

On POSIX shells:

```bash
PYTHONPATH=src python3 -m hufu validate examples/task.json
python3 -m unittest discover -s tests -v
python3 scripts/check_version.py
```

Successful validation prints a compact JSON summary. Invalid input exits with status `2` and writes the contract error to stderr.

## Design rules

1. One fact has one authoritative owner.
2. Adapters project external state; they do not silently replace it.
3. Authorization is input to execution, never inferred from a journal or receipt.
4. Recovery reads back external effects before retrying them.
5. Optional policy packs may add project-specific behavior without hard-coding it into the core.
6. New infrastructure must earn its cost by reducing operator time or execution risk.

See [the specification](docs/SPEC.md), [architecture](docs/ARCHITECTURE.md), and [implementation plan](tasks/plan.md).

## Project status

This is an early contract-first build. The public API may change before `1.0.0`. No remote integration is enabled by default.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Report security issues using [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
