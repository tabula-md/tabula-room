---
type: Architecture Constraint
title: Encrypted room security model
description: Tabula Room relays encrypted envelopes without room keys or plaintext Markdown.
tags: [architecture, security, collaboration, e2ee]
---

# Constraint

Tabula Room is a ciphertext-only service. The browser client in `tabula-md`
holds the room key, encrypts Yjs updates and presence, and sends encrypted
envelopes to this server.

# Server May See

- `roomId`
- `clientId`
- socket membership
- envelope kind
- envelope version
- IV
- ciphertext
- timestamps
- aggregate rate-limit and payload-size metadata

# Server Must Not See

- `roomKey`
- plaintext Markdown
- decrypted Yjs updates
- decrypted presence data
- user document contents
- fallback plaintext snapshots or recovery state

# Consequences

- The server cannot index, search, moderate, summarize, or agent-process room
  content.
- Live recovery is outside this server. The Tabula.md app may use Firebase or a
  compatible encrypted recovery store.
- Observability must avoid payload logging. Prefer counts, sizes, status codes,
  and room ids.
- Any feature that needs server-side plaintext requires a new architecture
  decision before implementation.

# Related

- [Server repository map](../repo/server.md)
- [Local development](../runbooks/local-development.md)
