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
- never inspect, log, index, search, or transform encrypted snapshot contents;
- treat `roomId` as routing metadata, not authorization.

Operational logs should use counts, status codes, sizes, and health state.
Avoid logging full encrypted envelopes.

# Required Environment

Set these values explicitly in production:

- `PORT`: container port, usually `3002`.
- `TABULA_ROOM_ALLOWED_ORIGINS`: comma-separated Tabula.md browser origins.
- `TABULA_ROOM_DATA_DIR`: persistent encrypted snapshot directory.
- `TABULA_ROOM_MAX_PAYLOAD_BYTES`: maximum HTTP JSON body, Socket.IO packet,
  and encrypted ciphertext bytes.
- `TABULA_ROOM_RATE_LIMIT_PER_MINUTE`: in-memory per-minute limit for snapshot
  writes, socket connections, and room messages.

Do not use `TABULA_ROOM_ALLOWED_ORIGINS=*` for public production deployments.
Requests without an `Origin` header are allowed for server-to-server and CLI
health checks.

# Docker Shape

The Docker image listens on `PORT` and stores encrypted snapshots under
`/data` by default:

```sh
docker build -t tabula-room .
docker run --detach --name tabula-room \
  --publish 3002:3002 \
  --env TABULA_ROOM_ALLOWED_ORIGINS=https://app.example.com \
  --env TABULA_ROOM_DATA_DIR=/data \
  --volume tabula-room-data:/data \
  tabula-room
```

The `/data` volume must be persistent across restarts and image upgrades.
Stored files contain encrypted snapshot envelopes plus server metadata such as
`updatedAt`.

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

2. Start the new container with the same persistent `/data` volume.
3. Verify `/health`.
4. Verify the Tabula.md app uses the production room URL and keeps room keys in
   URL fragments.
5. Watch connection counts, 4xx/5xx rates, restart count, and disk capacity for
   the snapshot volume.

# Rollback

1. Stop routing new traffic to the failing container.
2. Start the previous image with the same environment and `/data` volume.
3. Verify `/health`.
4. Confirm clients can rejoin rooms and restore encrypted snapshots.

Snapshot data should not require migration for v0 because the stored envelope
shape is versioned by `v`.

# Restarts

Tabula Room stores only the latest encrypted snapshot per room. Active socket
membership is in memory and is expected to reset on restart. Clients reconnect
and use encrypted snapshots for recovery.

For planned restarts:

1. Keep the persistent `/data` volume attached.
2. Restart one instance at a time if multiple instances are ever introduced.
3. Verify `/health` after restart.

# Snapshot Data Handling

Snapshot files are operational recovery data. Treat the snapshot directory as
sensitive even though it should contain ciphertext only.

- Back up the volume if losing room recovery snapshots is unacceptable.
- Do not edit snapshot files by hand.
- Do not copy snapshot contents into issue trackers or logs.
- If a file is corrupt, the server should fail closed instead of serving it as
  a valid encrypted snapshot.

# Related

- [Encrypted room security model](../architecture/encrypted-room-security.md)
- [Local development](local-development.md)
- [Server repository map](../repo/server.md)
