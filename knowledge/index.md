# Knowledge Bundle

This directory is a small Markdown knowledge bundle for Tabula Room. It gives
humans and coding agents durable context that should not be repeated in every
PR.

Use `WORKFLOW.md` for execution rules. Use this bundle for product,
architecture, repository, and runbook context.

## Architecture

- [Encrypted room security model](architecture/encrypted-room-security.md) -
  the server-side boundaries that keep Room ciphertext-only.
- Architecture decision records live in `docs/adr/`.

## Repository

- [Server repository map](repo/server.md) - how the TypeScript server modules
  are split.

## Runbooks

- [Local development](runbooks/local-development.md) - how to run and validate
  the room server locally and with `tabula-md`.
- [Production operations](runbooks/production-operations.md) - how to operate
  the relay-only ciphertext server with Docker and health checks.
