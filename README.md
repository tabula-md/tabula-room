# Tabula Room

Encrypted live-collaboration relay for [Tabula.md](https://tabula.md).

Service: [rooms.tabula.md](https://rooms.tabula.md) · Source:
[tabula-md/tabula-room](https://github.com/tabula-md/tabula-room)

Tabula Room is intentionally small. It accepts Socket.IO connections, groups
clients by room id, and relays encrypted envelopes between peers. The browser
creates the room key, keeps it in the URL fragment, encrypts locally, and sends
only ciphertext to this server.

## Role

- Relay encrypted document updates between connected clients.
- Relay encrypted volatile messages for presence and cursor state.
- Track room membership metadata needed for peer discovery.
- Reject room keys, plaintext-like fields, oversized payloads, disallowed
  origins, and malformed envelopes.

Tabula Room does not decrypt Markdown, store recovery snapshots, serve the web
app, index content, manage accounts, or implement billing. Live-room recovery
belongs to the Tabula.md hosted app data provider, not to this relay.

## Development

Requirements:

- Node.js 22 or newer
- npm

```sh
npm install
cp .env.example .env
npm run dev
```

The development server listens on `http://localhost:3002` by default. Use
`npm run dev:watch` when you want the server to restart on file changes.

Run Tabula.md against a local room server with:

```sh
VITE_TABULA_ROOM_URL=http://localhost:3002 npm run dev
```

## Protocol

Room links keep keys in the browser URL fragment:

```text
https://tabula.md/#room=<roomId>,<roomKey>
```

The fragment is not sent in HTTP requests, so `roomKey` must never reach this
server.

Socket.IO events:

- `room:join` with `{ roomId, clientId }`
- `room:joined` with `{ roomId, clientId, peerCount }`
- `room:message` with an encrypted envelope
- `room:volatile-message` with an encrypted envelope
- `room:peer-joined` with `{ roomId, clientId }`
- `room:peers` with `{ roomId, peers }`
- `room:error` with `{ error }`

`room:message` and `room:volatile-message` are relayed to other sockets in the
room, not echoed to the sender. `room:peer-joined` lets an existing peer send an
encrypted `state-init` update to the new peer.

Encrypted envelopes use this shape:

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

Allowed `kind` values are `yjs-update`, `presence`, `state-init`, and
`snapshot`. `snapshot` is accepted as an opaque compatibility envelope, but this
relay does not persist it.

## HTTP API

- `GET /health`
  - returns `{ ok: true, service: "tabula-room", version }`
- `GET /v1/rooms/:roomId`
  - returns `{ roomId, activeConnections }`

## Configuration

See `.env.example`.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | HTTP and Socket.IO port. |
| `TABULA_ROOM_ALLOWED_ORIGINS` | localhost origins when unset | Comma-separated browser origin allowlist. |
| `TABULA_ROOM_MAX_PAYLOAD_BYTES` | `1048576` | HTTP JSON body, Socket.IO packet, and ciphertext byte limit. |
| `TABULA_ROOM_RATE_LIMIT_PER_MINUTE` | `600` | In-memory per-minute limit for connections, joins, and messages. |

Requests without an `Origin` header are allowed for server-to-server and CLI
access. Browser requests with an `Origin` header must match the allowlist.

## Production

The hosted v0 deployment runs the built Node server on a small Ubuntu VM under
pm2, with nginx terminating HTTP and WebSocket traffic for `rooms.tabula.md`.

```sh
npm ci
npm test
npm run build
npm install --global pm2

TABULA_ROOM_ALLOWED_ORIGINS=https://tabula.md,https://www.tabula.md \
TABULA_ROOM_MAX_PAYLOAD_BYTES=1048576 \
TABULA_ROOM_RATE_LIMIT_PER_MINUTE=600 \
PORT=3002 \
pm2 start npm --name tabula-room -- start

pm2 save
```

Use `ops/nginx/rooms.tabula.md.conf` as the nginx site template. The Node
process should listen on loopback, usually `127.0.0.1:3002`; public traffic
should reach the service through nginx.

## Docker

```sh
docker build -t tabula-room .
docker run --rm -p 3002:3002 \
  -e TABULA_ROOM_ALLOWED_ORIGINS=http://localhost:5173 \
  tabula-room
```

Merges to `main` publish production images to GitHub Container Registry:

```text
ghcr.io/tabula-md/tabula-room:latest
ghcr.io/tabula-md/tabula-room:sha-<commit-sha>
```

The publish workflow uses the repository `GITHUB_TOKEN` package permission and
does not require production server SSH credentials. A VM or container host can
pull a pinned `sha-<commit-sha>` image and restart the service through its own
deployment process.

## Validation

```sh
npm test
npm run build
npm run test:docker
```

## Maintainers

For workflow and release operations, see `WORKFLOW.md`, `knowledge/`, and
`docs/adr/`. Report private security issues through `SECURITY.md`.

## Backed By

Tabula Room is backed by
[Marker Inc Korea](https://github.com/Marker-Inc-Korea).

## License

MIT. See `LICENSE`.
