# Tabula Room

Tabula Room is the encrypted collaboration room server for Tabula.md. It relays
and stores ciphertext only.

Tabula Room is the server-side half of Tabula.md live collaboration. The browser
generates the room id and room key, keeps the key in the URL fragment, encrypts
document updates locally, and sends only encrypted envelopes to this server.

## Quick Start

Requirements:

- Node.js 22 or newer
- npm

From a fresh clone:

```sh
npm install
cp .env.example .env
npm test
npm run build
npm run dev
```

The dev server listens on `http://localhost:3002` by default. Runtime snapshots
are written to `.tabula-room/data` unless `TABULA_ROOM_DATA_DIR` is set.
Use `npm run dev:watch` when you want the local server to restart on file
changes.

## What It Does

- Relays encrypted room messages between connected clients.
- Stores the latest encrypted room snapshot for recovery.
- Tracks room membership metadata without reading document content.
- Rejects payloads that try to send room keys or plaintext fields.

## What It Does Not Do

- It does not receive room keys.
- It does not decrypt Markdown.
- It does not serve pages or generated documents.
- It does not index, search, moderate, or process document content.
- It does not implement accounts, billing, permissions, or audit logs.

## Protocol

Encrypted envelopes use this JSON shape:

```json
{
  "v": 1,
  "roomId": "room_123",
  "kind": "yjs-update",
  "version": 1,
  "iv": "base64url",
  "ciphertext": "base64url",
  "createdAt": "2026-06-18T00:00:00.000Z"
}
```

Allowed `kind` values are `yjs-update`, `presence`, and `snapshot`. `iv` and
`ciphertext` are unpadded base64url strings. `createdAt` is a UTC ISO timestamp.

Room links keep keys in the browser URL fragment:

```txt
/r/:roomId#key=:roomKey
```

The fragment is not sent in HTTP requests, so `roomKey` must never reach this
server.

## HTTP API

- `GET /health`
  - returns `{ ok: true, service: "tabula-room", version }`
- `GET /v1/rooms/:roomId`
  - returns `{ roomId, activeConnections, snapshotVersion, updatedAt }`
- `GET /v1/rooms/:roomId/snapshot`
  - returns the latest encrypted snapshot envelope, or `404`
- `PUT /v1/rooms/:roomId/snapshot`
  - stores an encrypted `snapshot` envelope

Invalid room ids, malformed envelopes, room key fields, plaintext-like fields,
oversized payloads, disallowed origins, and rate-limited requests return clear
4xx responses.

## WebSocket API

Socket.IO events:

- `room:join` with `{ roomId, clientId }`
- `room:joined` with `{ roomId, clientId, peerCount }`
- `room:message` with an encrypted envelope
- `room:peers` with `{ roomId, peers }`
- `room:error` with `{ error }` for invalid socket actions

`room:message` is relayed to other sockets in the room, not echoed to the sender.

## Configuration

See `.env.example`.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | HTTP and Socket.IO port. |
| `TABULA_ROOM_ALLOWED_ORIGINS` | localhost origins when unset | Comma-separated browser origin allowlist. Use the Tabula.md app origin in production. |
| `TABULA_ROOM_DATA_DIR` | `.tabula-room/data` | Local encrypted snapshot directory. |
| `TABULA_ROOM_MAX_PAYLOAD_BYTES` | `1048576` | HTTP JSON body, Socket.IO packet, and encrypted ciphertext byte limit. |
| `TABULA_ROOM_RATE_LIMIT_PER_MINUTE` | `600` | In-memory per-minute limit for snapshot writes, socket connections, room joins, and room messages. |

Requests without an `Origin` header are allowed for server-to-server and CLI
access. Browser requests with an `Origin` header must match the allowlist.

## Docker

```sh
docker build -t tabula-room .
docker run --rm -p 3002:3002 \
  -e TABULA_ROOM_ALLOWED_ORIGINS=http://localhost:5173 \
  -v tabula-room-data:/data \
  tabula-room
```

The image stores snapshots under `/data`.

## Validation

```sh
npm test
npm run build
npm run test:docker
```

CI runs the knowledge check, hook policy tests, unit/integration tests, the
TypeScript build, and a Docker runtime smoke check against `/health`.

## Security Model

The server treats `roomId` as routing metadata and encrypted envelopes as opaque
payloads. The room key must stay in the Tabula.md browser client and in the URL
fragment only. Snapshot files contain the latest encrypted envelope plus server
metadata such as `updatedAt`; they must not contain `roomKey` or plaintext
Markdown.

## Maintainers

For maintainer and agent workflow, see `WORKFLOW.md`. Durable architecture and
repository context lives in `knowledge/`, including the production operations
runbook. Architecture decisions live in `docs/adr/`.

Report private security issues through the instructions in `SECURITY.md`.
