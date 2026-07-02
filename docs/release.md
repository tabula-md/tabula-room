# Release Notes

This document covers Tabula Room source releases only. Tabula Room remains the
ciphertext-only collaboration room server; it does not serve pages, plaintext
Markdown, room keys, or generated documents.

Tabula Room publishes Docker images to GitHub Container Registry from `main`.
The repository also ships source, a Dockerfile, pm2 production config, nginx
template, and CI/runtime checks. Maintainers can deploy a tagged checkout to the
hosted VM or pull a pinned Docker image when they need one.

## Before Tagging

Run the release checks from a clean `main` checkout:

```sh
npm ci
npm run knowledge:check
npm run test:hooks
npm test
npm run build
npm run test:docker
```

The package version should match the release tag without the `v` prefix. For
example, `v1.2.3` should be tagged from a commit whose `package.json` and
`package-lock.json` version fields are `1.2.3`.

## Create A Source Tag

Create and push an annotated semantic version tag:

```sh
git tag -a v1.2.3 -m "tabula-room v1.2.3"
git push origin v1.2.3
```

Pushing a tag does not publish a package. It marks the source version that a
maintainer can clone, build, or deploy.

## Build A Local Image

Build and run the Docker image from the checked-out source:

```sh
docker build -t tabula-room:1.2.3 .
docker run --rm --name tabula-room-release-check \
  -p 3002:3002 \
  -e TABULA_ROOM_ALLOWED_ORIGINS=http://localhost:5173 \
  tabula-room:1.2.3
```

In another shell:

```sh
curl -fsS http://localhost:3002/health
```

The response must include:

```json
{ "ok": true, "service": "tabula-room", "version": "1.2.3" }
```

Stop the release-check container after verification.

## Published Image

Merges to `main` publish Docker images to GitHub Container Registry:

```text
ghcr.io/tabula-md/tabula-room:latest
ghcr.io/tabula-md/tabula-room:sha-<commit-sha>
```

Use the immutable `sha-<commit-sha>` tag for production rollouts. Keep VM,
nginx, pm2, or container-orchestrator credentials outside this public
repository; this workflow publishes the artifact only.

## Deploy To Hosted VM

From a clean tagged checkout on the VM:

```sh
npm ci
npm run build
TABULA_ROOM_ALLOWED_ORIGINS=https://tabula.md,https://www.tabula.md \
  pm2 start pm2.production.cjs --update-env
pm2 save
curl -fsS http://127.0.0.1:3002/health
```

nginx should use `ops/nginx/rooms.tabula.md.conf` as the site template and
terminate public traffic for `rooms.tabula.md`.

## Rollback

Rollback by redeploying the previous source tag or locally built image. There
is no Tabula Room data volume to migrate or preserve.

After rollback, verify `/health`, room join, encrypted relay, volatile relay,
and peer join/state-init behavior against the Tabula.md app.
