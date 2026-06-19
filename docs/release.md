# Release Procedure

This document covers Tabula Room releases only. Tabula Room remains the
ciphertext-only collaboration room server; it does not serve pages, plaintext
Markdown, room keys, or generated documents.

## Release Artifact

The production artifact is the Docker image:

```txt
ghcr.io/tabula-md/tabula-room
```

The release workflow publishes images from `vX.Y.Z` tags. A `v1.2.3` tag should
produce these image tags:

- `ghcr.io/tabula-md/tabula-room:1.2.3`
- `ghcr.io/tabula-md/tabula-room:1.2`
- `ghcr.io/tabula-md/tabula-room:v1.2.3`
- `ghcr.io/tabula-md/tabula-room:latest`
- `ghcr.io/tabula-md/tabula-room:sha-<commit>`

Deploy pinned version tags such as `1.2.3` or `sha-<commit>` when repeatability
matters. Treat `latest` as a convenience tag, not a rollback target.

## Before Tagging

Run the local release checks from a clean `main` checkout:

```sh
npm ci
npm run knowledge:check
npm run test:hooks
npm test
npm run build
node scripts/validate-release-version.mjs 1.2.3
docker build -t tabula-room:release-check .
```

For public preview releases, also run the focused Tabula.md collaboration smoke
from the sibling app repository:

```sh
TABULA_ROOM_REPO_DIR=../tabula-room npm run test:browser:collab
```

The package version must match the release tag without the `v` prefix. For
example, `v1.2.3` must be released from a commit whose `package.json` and
`package-lock.json` version fields are `1.2.3`. Land that version bump before
creating the release tag. The release workflow runs the same validation script
and will reject mismatched version tags.

## Create A Release Tag

Create and push an annotated semantic version tag:

```sh
git tag -a v1.2.3 -m "tabula-room v1.2.3"
git push origin v1.2.3
```

Pushing the tag starts `.github/workflows/release.yml`. The workflow builds and
publishes the multi-platform Docker image to GHCR.

## Manual Publish

Use the `Release Docker Image` workflow dispatch only for an existing ref that
should be published. For a release version, pass either `v1.2.3` or
`refs/tags/v1.2.3` as the `ref` input. Leaving `ref` blank publishes the selected
workflow ref and should be reserved for explicit maintainer recovery.

## Post-Publish Verification

Pull the published image and check `/health` before promoting it:

```sh
docker pull ghcr.io/tabula-md/tabula-room:1.2.3
docker run --rm --name tabula-room-release-check \
  -p 3002:3002 \
  -e TABULA_ROOM_ALLOWED_ORIGINS=http://localhost:5173 \
  -v tabula-room-release-check:/data \
  ghcr.io/tabula-md/tabula-room:1.2.3
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

Rollback by redeploying the previous pinned image tag, for example:

```txt
ghcr.io/tabula-md/tabula-room:1.2.2
```

Keep the same persistent `/data` volume unless the release notes explicitly say
otherwise. Snapshot files are encrypted envelopes plus server metadata only; do
not inspect, transform, or decrypt them as part of rollback.

After rollback, verify `/health`, room join, encrypted relay, and snapshot
restore against the Tabula.md app.
