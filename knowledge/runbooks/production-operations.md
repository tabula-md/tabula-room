---
type: Runbook
title: Production operations
description: How to operate Tabula Room as a small ciphertext-only service.
tags: [runbook, production, docker, operations]
---

# Scope

This runbook covers production operation for Tabula Room itself. It does not
cover Tabula.md app deployment.

# Security Boundary

Tabula Room remains ciphertext-only in production:

- never configure clients to send `roomKey`;
- never send plaintext Markdown to this service;
- never inspect, log, index, search, or transform encrypted envelope contents;
- never add durable room recovery persistence to this service without a new
  architecture decision;
- treat `roomId` as routing metadata, not authorization.

Operational logs should use counts, status codes, sizes, and health state.
Avoid logging full encrypted envelopes.

# Required Environment

Set these values explicitly in production:

- `PORT`: container port, usually `3002`.
- `TABULA_ROOM_ALLOWED_ORIGINS`: comma-separated Tabula.md browser origins.
- `TABULA_ROOM_MAX_PAYLOAD_BYTES`: maximum HTTP JSON body, Socket.IO packet,
  and encrypted ciphertext bytes.
- `TABULA_ROOM_RATE_LIMIT_PER_MINUTE`: in-memory per-minute limit for socket
  connections, room joins, and room messages.

Do not use `TABULA_ROOM_ALLOWED_ORIGINS=*` for public production deployments.
Requests without an `Origin` header are allowed for server-to-server and CLI
health checks.

# Docker Shape

The Docker image listens on `PORT` and keeps room membership in memory:

```sh
docker build -t tabula-room .
docker run --detach --name tabula-room \
  --publish 3002:3002 \
  --env TABULA_ROOM_ALLOWED_ORIGINS=https://app.example.com \
  tabula-room
```

No `/data` volume is required. Live recovery belongs to the Tabula.md app data
provider, such as Firebase Firestore.

# Health Checks

Use `/health` for load balancer, orchestrator, and deployment checks:

```sh
curl --fail http://127.0.0.1:3002/health
```

The expected JSON shape is:

```json
{ "ok": true, "service": "tabula-room", "version": "0.1.0" }
```

Use `npm run test:docker` before deploying a locally built image. It builds the
image, starts a container on a random local port, and verifies `/health`.

# Deploy

1. Build and test the image:

   ```sh
   npm test
   npm run build
   npm run test:docker
   ```

2. Start the new container.
3. Verify `/health`.
4. Verify the Tabula.md app uses the production room URL and keeps room keys in
   URL fragments.
5. Watch connection counts, 4xx/5xx rates, restart count, WebSocket upgrade
   errors, and payload-limit/rate-limit rejections.

# Rollback

1. Stop routing new traffic to the failing container.
2. Start the previous image with the same environment.
3. Verify `/health`.
4. Confirm clients can join rooms, relay encrypted messages, relay volatile
   presence, and receive peer join events.

# Restarts

Tabula Room stores no room recovery data. Active socket membership is in memory
and is expected to reset on restart. Clients reconnect and use the Tabula.md app
recovery provider or peer `state-init` messages for recovery.

For planned restarts:

1. Drain or roll one instance at a time if multiple instances are ever
   introduced.
2. Verify `/health` after restart.
3. Verify a two-browser live room can rejoin and sync.

# Relay Data Handling

Socket payloads are operationally sensitive even though they should contain
ciphertext only.

- Do not copy encrypted envelopes into issue trackers or logs.
- Do not log room keys or URL fragments.
- Keep payload-size and rate-limit telemetry aggregate.
- If an envelope is malformed, reject or ignore it without attempting to parse
  plaintext.

# Related

- [Encrypted room security model](../architecture/encrypted-room-security.md)
- [Local development](local-development.md)
- [Server repository map](../repo/server.md)
