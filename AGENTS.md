# AGENTS.md

## Project Overview

Tabula Room is the encrypted collaboration room server for Tabula.md. It relays
encrypted room messages and stores encrypted room snapshots. The server must
remain ciphertext-only.

Product direction:

- Keep Tabula Room small and inspectable.
- Preserve the Excalidraw-style room mental model: link-based rooms, browser-held
  keys, opaque server transport.
- Treat `tabula-md` as the product app and this repository as the room server.
- Do not add accounts, billing, search, moderation, or document processing
  without an explicit architecture decision.

## Workflow

- Follow `WORKFLOW.md` for work classification, Linear, Graphite, validation,
  PR shape, and merge cleanup.
- Treat `WORKFLOW.md` as the workflow source of truth. Do not duplicate or
  override workflow rules in this file.
- Use `knowledge/index.md` when a task needs deeper project context.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Start built server: `npm start`
- Test: `npm test`
- Build: `npm run build`
- Knowledge check: `npm run knowledge:check`
- PR title: `npm run pr:title`
- PR body: `npm run pr:body`
- PR metadata: `npm run pr:metadata`
- Sync GitHub labels: `npm run labels:sync`

## Repository Map

- `WORKFLOW.md`: standard workflow for implementation, review, and merge.
- `knowledge/index.md`: durable context map for humans and coding agents.
- `src/server.ts`: Express and Socket.IO room server.
- `src/protocol.ts`: room id, client id, and encrypted envelope validation.
- `src/storage/file-store.ts`: local encrypted snapshot persistence.
- `src/rate-limit.ts`: in-memory rate limiting.
- `test`: protocol, HTTP, storage, CORS, payload, and WebSocket coverage.

## Code Style

- Prefer simple TypeScript modules over framework-heavy abstractions.
- Keep protocol validation explicit and tested.
- Keep public API changes reflected in `README.md`.
- Avoid introducing server-side knowledge of Tabula.md document semantics.

## Testing

- Run `npm test` for protocol and server behavior changes.
- Run `npm run build` after TypeScript, package, or CI changes.
- Add tests for any change that touches envelope validation, room membership,
  CORS, rate limiting, payload limits, or snapshot persistence.

## Collaboration Security

Before changing room links, envelopes, snapshots, storage, logging, or relay
behavior, preserve these constraints:

- Room keys stay in the Tabula.md browser URL fragment.
- Room keys are never sent to this server.
- Plaintext Markdown is never sent to this server.
- Server storage contains encrypted envelopes only.
- Decryption failure is a client concern and must not cause the server to
  overwrite ciphertext with plaintext or fallback content.
- `roomId` is routing metadata, not an authorization secret.
