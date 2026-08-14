# Contributor Automation Rules

These rules apply to human and automated contributors in this repository.

- Read `README.md`, `docs/SPEC.md`, and `tasks/plan.md` before changing behavior.
- Preserve the provider-neutral core. Provider-specific state and policy belong behind adapters.
- Write a failing test before implementing behavior.
- Keep changes minimal, reviewable, and directly tied to an accepted task.
- Do not add network access, background services, credentials, telemetry, or external side effects without an explicit design decision and tests.
- Do not treat journal entries, receipts, or external projections as execution authorization.
- Run `python -m unittest discover -s tests -v` and `python scripts/check_version.py` before handing off a change.
- Never commit secrets, private endpoints, customer data, or machine-specific paths.
