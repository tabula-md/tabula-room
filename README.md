# Tabula Room

Tabula Room is the encrypted collaboration room server for Tabula.md. It relays
and stores ciphertext only.

Tabula Room is the server-side half of Tabula.md live collaboration. The browser
generates the room id and room key, keeps the key in the URL fragment, encrypts
document updates locally, and sends only encrypted envelopes to this server.

## What It Does

- Relays encrypted room messages between connected clients.
- Stores the latest encrypted room snapshot for recovery.
- Tracks room membership metadata without reading document content.
- Rejects payloads that try to send room keys or plaintext fields.

## What It Does Not Do

- It does not receive room keys.
- It does not decrypt Markdown.
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

Allowed `kind` values are `yjs-update`, `presence`, and `snapshot`.

## HTTP API

- `GET /health`
- `GET /v1/rooms/:roomId`
- `GET /v1/rooms/:roomId/snapshot`
- `PUT /v1/rooms/:roomId/snapshot`

The snapshot endpoint stores and returns encrypted envelopes. A missing snapshot
returns `404`.

## WebSocket API

Socket.IO events:

- `room:join` with `{ roomId, clientId }`
- `room:joined` with `{ roomId, clientId, peerCount }`
- `room:message` with an encrypted envelope
- `room:peers` with `{ roomId, peers }`

## Development

```sh
npm install
npm run dev
```

Run tests and build:

```sh
npm test
npm run build
```

For maintainer and agent workflow, see `WORKFLOW.md`. Durable architecture and
repository context lives in `knowledge/`.

## Configuration

See `.env.example`.

Important environment variables:

- `PORT`
- `TABULA_ROOM_ALLOWED_ORIGINS`
- `TABULA_ROOM_DATA_DIR`
- `TABULA_ROOM_MAX_PAYLOAD_BYTES`
- `TABULA_ROOM_RATE_LIMIT_PER_MINUTE`

## Security Model

The server treats `roomId` as routing metadata and encrypted envelopes as opaque
payloads. The room key must stay in the Tabula.md browser client and in the URL
fragment only.

Report private security issues through the instructions in `SECURITY.md`.
