<p align="center">
  <a href="https://tabula.md">
    <img src="https://tabula.md/favicon.svg" alt="Tabula.md" width="56" />
  </a>
</p>

# Tabula.md Room

Encrypted live-collaboration relay for [Tabula.md](https://tabula.md).

> This repository is for operators who self-host Tabula.md infrastructure. You
> do not need to run it to use Tabula.md.

Tabula.md Room relays encrypted workspace updates and presence between connected
clients. It never receives room keys or plaintext Markdown, and it does not
store recovery snapshots, serve the Tabula.md app, manage accounts, or index
content.

## Self-host

Run one Node process or container behind a TLS and WebSocket-capable edge:

```sh
npm ci
npm run build

TABULA_ROOM_ALLOWED_ORIGINS=https://app.example.com \
PORT=3002 \
npm start
```

Point a Tabula.md app checkout at the relay:

```sh
VITE_TABULA_ROOM_URL=https://rooms.example.com npm run dev
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3002` | HTTP and Socket.IO port. |
| `TABULA_ROOM_ALLOWED_ORIGINS` | localhost origins when unset | Comma-separated browser origin allowlist. |
| `TABULA_ROOM_MAX_PAYLOAD_BYTES` | `1048576` | Maximum encrypted payload size. |
| `TABULA_ROOM_RATE_LIMIT_PER_MINUTE` | `600` | Per-minute connection and message limit. |

Keep a strict origin allowlist, preserve WebSocket upgrades, and keep room URLs,
keys, plaintext, and complete encrypted envelopes out of logs. The service is
stateless; durable recovery belongs to the Tabula.md app data provider.

## Operations

- `GET /health` reports service health and version.
- `GET /` reports service metadata and the health-check path.

The Socket.IO protocol is an implementation contract between Tabula.md clients
and this relay. It is not a supported third-party application API.

## Development

```sh
npm install
cp .env.example .env
npm run dev

npm test
npm run build
npm run test:docker
```

## Backed By

Tabula.md Room is backed by
[Marker Inc Korea](https://github.com/Marker-Inc-Korea).

## License

MIT. See `LICENSE`.
