---
type: Runbook
title: Local development
description: How to run Tabula Room locally and connect it to Tabula.md.
tags: [runbook, local, development]
---

# Run The Server

```sh
npm install
npm run dev
```

The default port is `3002`. Runtime snapshots are stored under
`.tabula-room/data` unless `TABULA_ROOM_DATA_DIR` is set.

# Validate

```sh
npm test
npm run build
git diff --check
```

# Connect Tabula.md

From a sibling `tabula-md` checkout:

```sh
VITE_TABULA_ROOM_URL=http://localhost:3002 npm run dev
```

Then start a live room in the app. The share URL should keep the key in the
fragment:

```txt
/r/:roomId#key=:roomKey
```

The server should receive only `roomId`, socket membership, and encrypted
envelopes.

# Useful Environment

- `PORT`: HTTP and Socket.IO port.
- `TABULA_ROOM_ALLOWED_ORIGINS`: comma-separated origin allowlist.
- `TABULA_ROOM_DATA_DIR`: encrypted snapshot data directory.
- `TABULA_ROOM_MAX_PAYLOAD_BYTES`: HTTP and WebSocket payload limit.
- `TABULA_ROOM_RATE_LIMIT_PER_MINUTE`: in-memory rate limit.

# Related

- [Encrypted room security model](/architecture/encrypted-room-security.md)
- [Server repository map](/repo/server.md)
