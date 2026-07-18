# AGENTS.md

## Project Overview

Tabula.md Room is the stateless encrypted live-collaboration relay for
Tabula.md.

## Product Guardrails

- Relay encrypted room events and presence without receiving room keys or
  plaintext Markdown.
- Do not add accounts, content indexing, recovery snapshots, or application UI
  to this service.
- Keep room URLs, keys, plaintext, and complete encrypted envelopes out of
  logs.
- Treat the Socket.IO protocol as an internal Tabula.md client contract, not a
  general third-party API.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- Docker smoke: `npm run test:docker`

## Engineering Guidelines

- Keep transport, validation, rate limiting, and server lifecycle concerns
  separated.
- Preserve strict origin checks and payload limits.
- Add focused tests for protocol, security, rate-limit, and lifecycle changes.
- Run `npm test`, `npm run build`, and `npm run test:docker` before submitting a
  server or container change.
