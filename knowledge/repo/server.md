---
type: Repository Area
title: Server repository map
description: TypeScript server modules for relay, protocol validation, storage, and rate limiting.
resource: repo:/src
tags: [repo, server, protocol]
---

# Scope

`src/` contains the Tabula Room runtime:

- `server.ts`: Express HTTP API and Socket.IO relay.
- `protocol.ts`: room id, client id, envelope, payload, and plaintext-field
  validation.
- `storage/file-store.ts`: local file-backed encrypted snapshot persistence.
- `rate-limit.ts`: in-memory rate limit helper for v0.

# Boundaries

- Keep protocol validation independent from HTTP and Socket.IO wiring.
- Keep storage responsible for encrypted snapshot envelopes only.
- Keep rate limiting generic; do not encode document semantics into it.
- Keep tests close to protocol and runtime behavior in `test/`.

# Review Notes

- Protocol shape changes need README updates.
- Envelope validation changes need unit tests.
- HTTP or WebSocket behavior changes need server tests.
- Storage changes must preserve ciphertext-only persistence.

# Related

- [Encrypted room security model](../architecture/encrypted-room-security.md)
- [Local development](../runbooks/local-development.md)
