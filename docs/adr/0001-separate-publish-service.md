# ADR 0001: Separate Publish Service From Tabula Room

Date: 2026-06-19
Status: Accepted
Owner: taeha

## Context

Tabula.md needs two related but different collaboration surfaces:

- Live Markdown collaboration, where browser-held room keys encrypt updates and
  Tabula Room relays or stores ciphertext only.
- Public publish, where a user creates read-only project snapshots that may be
  served as pages, Markdown bundles, `llms.txt`, or `llms-full.txt`.

These surfaces have opposite security properties. Tabula Room must never receive
room keys or plaintext Markdown. A publish service intentionally receives,
stores, and serves public plaintext artifacts.

Keeping both concerns in one service would make the ciphertext-only room
boundary harder to explain, review, deploy, and audit.

## Decision

Tabula Room remains the encrypted live collaboration room server only.

Tabula Room may:

- route rooms by `roomId`;
- track connection membership;
- validate encrypted room envelopes;
- relay encrypted `yjs-update` and `presence` envelopes;
- store the latest encrypted `snapshot` envelope per room;
- enforce CORS, payload limits, and rate limits for room traffic.

Tabula Room must not:

- receive or persist `roomKey`;
- receive or persist plaintext Markdown;
- serve published pages;
- generate or serve `llms.txt`, `llms-full.txt`, Markdown bundles, or public
  snapshot pages;
- implement publish indexing, search, moderation, takedown, analytics, custom
  domains, or public artifact caching.

Server-backed publish will be implemented as a separate service/repository, such
as `tabula-publish`, when Tabula.md moves beyond browser-local publish
snapshots.

Tabula.md, the product app, may call both services:

- `VITE_TABULA_ROOM_URL` for encrypted live collaboration.
- `VITE_TABULA_PUBLISH_URL` for public publish.

## Consequences

Benefits:

- The room server remains small, inspectable, and Excalidraw-room-like.
- The ciphertext-only claim is easier to audit because plaintext publish code is
  absent from this repository.
- Publish can evolve its own storage, deletion, abuse, SEO, and public-serving
  behavior without weakening room security boundaries.
- Deployment and incident response can treat encrypted room traffic and public
  published content as separate risk domains.

Costs:

- Tabula.md needs two backend URLs once server-backed publish exists.
- Local development and smoke tests need orchestration for app, room, and
  publish services.
- Shared validation helpers or schemas may need duplication or a small shared
  package later.

Risks:

- Publish product pressure may tempt room-server changes that weaken the
  ciphertext-only boundary.
- A separate publish service can become too large unless v0 scope is kept narrow.

## Alternatives Considered

### Put publish endpoints in Tabula Room

Rejected. It mixes plaintext public artifacts with a ciphertext-only relay,
making the service harder to reason about and easier to accidentally expand into
a general backend.

### Keep publish entirely browser-local forever

Rejected as the long-term direction. Browser-local publish is useful for
prototyping, but public URLs, `llms.txt`, snapshot sharing, deletion, caching,
and durable access require a server-backed publish surface.

### Put publish inside tabula-md only

Rejected for server-backed publish. The product app should own UX and client
composition, but public artifact serving needs independent deploy and security
boundaries.

## Implementation Notes

Initial `tabula-publish` scope should stay narrow:

- create public read-only snapshots;
- serve `/p/:publishId`;
- serve `/p/:publishId/llms.txt`;
- serve `/p/:publishId/llms-full.txt`;
- support unpublish/delete through an owner or unpublish token;
- enforce CORS, payload limits, and rate limits;
- use local file storage for preview before choosing object storage.

Do not add accounts, billing, search, comments, realtime collaboration, or room
relay behavior to `tabula-publish` v0 unless a later ADR accepts that expansion.

## Acceptance Criteria

- Tabula Room README and knowledge docs point maintainers to this decision.
- Future PRs that add publish behavior to Tabula Room are rejected unless this
  ADR is superseded.
- Server-backed publish planning creates a separate `tabula-publish` tracker and
  repository/service.
