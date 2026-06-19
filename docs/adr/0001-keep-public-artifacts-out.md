# ADR 0001: Keep Public Artifact Serving Out Of Tabula Room

Date: 2026-06-19
Status: Accepted
Owner: taeha

## Context

Tabula.md has two related but different concerns:

- Live Markdown collaboration, where browser-held room keys encrypt updates and
  Tabula Room relays or stores ciphertext only.
- Public artifact serving, where read-only project output may be served outside
  the encrypted collaboration room.

These surfaces have opposite security properties. Tabula Room must never receive
room keys or plaintext Markdown. Public artifact serving intentionally handles
content that is meant to be readable.

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
- serve public pages;
- generate or serve public Markdown bundles, indexes, metadata feeds, or static
  project artifacts;
- implement public artifact indexing, search, moderation, takedown, analytics,
  custom domains, or caching.

## Consequences

Benefits:

- The room server remains small, inspectable, and Excalidraw-room-like.
- The ciphertext-only claim is easier to audit because public artifact serving
  code is absent from this repository.
- Deployment and incident response can treat encrypted room traffic and readable
  public content as separate risk domains.

Costs:

- Local development and smoke tests may need orchestration beyond just the room
  server if other Tabula.md services are running nearby.
- Shared validation helpers or schemas may need duplication or a small shared
  package later.

Risks:

- Product pressure may tempt room-server changes that weaken the ciphertext-only
  boundary.

## Alternatives Considered

### Put public artifact endpoints in Tabula Room

Rejected. It mixes plaintext public artifacts with a ciphertext-only relay,
making the service harder to reason about and easier to accidentally expand into
a general backend.

## Acceptance Criteria

- Tabula Room README and knowledge docs point maintainers to this decision.
- Future PRs that add public artifact serving behavior to Tabula Room are
  rejected unless this ADR is superseded.
