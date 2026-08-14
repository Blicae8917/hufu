# Security Policy

## Supported versions

The project is pre-1.0. Security fixes currently target the latest released version only.

## Reporting a vulnerability

Do not publish exploit details in a public issue. Use the repository host's private security-reporting feature when available. Until a public repository is configured, contact the maintainer through the private channel from which you received the project.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Do not include real credentials or private production data.

## Security boundaries

The current release validates local JSON only. It does not execute task actions, connect to remote providers, persist credentials, or start background workers. Future adapters and runners must treat all task content and provider responses as untrusted input.
