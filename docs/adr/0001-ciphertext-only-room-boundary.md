# ADR 0001: Keep Tabula Room Ciphertext-Only

Date: 2026-06-19
Status: Accepted
Owner: taeha
Updated: 2026-07-01 for relay-only recovery boundary

## Context

Tabula Room is the encrypted collaboration room server for Tabula.md. Browser
clients create room links, hold room keys in URL fragments, encrypt document
updates locally, and send only encrypted envelopes to the server.

The server-side boundary is the core product property: Tabula Room can relay
ciphertext, but it must not understand, transform, or persist the Markdown
document. Durable live recovery belongs to the Tabula.md app data provider.

## Decision

Tabula Room remains ciphertext-only.

Tabula Room may:

- route rooms by `roomId`;
- track connection membership;
- validate encrypted room envelopes;
- relay encrypted `yjs-update`, `state-init`, `presence`, and opaque compatible
  `snapshot` envelopes;
- relay volatile encrypted presence/cursor envelopes;
- report room metadata such as active connection count;
- enforce CORS, payload limits, and rate limits for room traffic.

Tabula Room must not:

- receive or persist `roomKey`;
- receive or persist plaintext Markdown;
- persist live recovery snapshots;
- decrypt, parse, index, search, moderate, or transform document contents;
- serve document pages or generated documents;
- implement accounts, billing, room permissions, or document processing.

## Consequences

Benefits:

- The room server remains small, focused, and inspectable.
- The ciphertext-only claim is easier to audit.
- Deployment and incident response do not need to manage room data volumes.

Costs:

- Shared validation helpers or schemas may need duplication or a small shared
  package later.

Risks:

- Product pressure may tempt room-server changes that weaken the ciphertext-only
  boundary.

## Alternatives Considered

### Allow Server-Side Document Processing

Rejected. It would require plaintext Markdown or room keys to reach the server,
which breaks the product's browser-held-key security boundary.

### Add General Backend Features

Rejected for v0. Accounts, billing, document search, permissions, and similar
features make the room server harder to inspect without improving encrypted
room relay.

## Acceptance Criteria

- README, SECURITY, and knowledge docs describe the ciphertext-only boundary.
- Future PRs that require room keys, plaintext Markdown, or document processing
  in Tabula Room are rejected unless this ADR is superseded.
