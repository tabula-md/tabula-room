# Release Notes

This document covers Tabula Room source releases only. Tabula Room remains the
ciphertext-only collaboration room server; it does not serve pages, plaintext
Markdown, room keys, or generated documents.

Tabula Room does not publish an official Docker image for v0. The repository
ships source, a Dockerfile, and CI/runtime checks. Maintainers can build a Docker
image locally from a tagged checkout when they need one.

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
  -v tabula-room-release-check:/data \
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

Stop the release-check container and remove the temporary volume after
verification.

## Rollback

Rollback by redeploying the previous source tag or locally built image. Keep the
same persistent `/data` volume unless release notes explicitly say otherwise.
Snapshot files are encrypted envelopes plus server metadata only; do not inspect,
transform, or decrypt them as part of rollback.

After rollback, verify `/health`, room join, encrypted relay, and snapshot
restore against the Tabula.md app.
