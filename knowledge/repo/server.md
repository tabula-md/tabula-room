---
type: Repository Area
title: Server repository map
description: TypeScript server modules for relay, protocol validation, and rate limiting.
resource: repo:/src
tags: [repo, server, protocol]
---

# Scope

`src/` contains the Tabula Room runtime:

- `server.ts`: Express HTTP API and Socket.IO relay.
- `protocol.ts`: room id, client id, envelope, payload, and plaintext-field
  validation.
- `rate-limit.ts`: in-memory rate limit helper for v0.
- `pm2.production.cjs`: single-process production supervisor config for the
  hosted VM.
- `ops/nginx/rooms.tabula.md.conf`: nginx reverse proxy template for
  HTTP/WebSocket traffic.

# Boundaries

- Keep protocol validation independent from HTTP and Socket.IO wiring.
- Keep the server relay-only; do not add room recovery persistence here.
- Keep rate limiting generic; do not encode document semantics into it.
- Keep tests close to protocol and runtime behavior in `test/`.

# Review Notes

- Protocol shape changes need README updates.
- Envelope validation changes need unit tests.
- HTTP or WebSocket behavior changes need server tests.
- Persistence changes require a new architecture decision.

# Related

- [Encrypted room security model](../architecture/encrypted-room-security.md)
- [Local development](../runbooks/local-development.md)
