# WORKFLOW.md

This file is the standard workflow for this repository for humans and coding
agents.

## Intent

Tabula Room is a small public server repo. Normal work should be easy to review,
safe to merge, and explicit about security impact. The server is ciphertext-only;
workflow decisions must protect that property.

## Work Classification

- Local-only: investigation, explanation, or commands that do not change files.
- Single PR: one reviewable concern, such as a protocol validation fix or docs
  update.
- Stack: several reviewable concerns that depend on each other, such as storage
  adapter groundwork followed by server wiring and tests.
- Cross-repo work: use Linear as the umbrella tracker. This repository and
  `tabula-md` each get their own Graphite PR or stack.

Default to a vertical slice when work crosses a new runtime boundary, storage
backend, deployment target, or security-sensitive protocol change.

## Linear

Use Linear for accepted maintainer work unless the repository owner explicitly
requests a GitHub-Issue-only flow. For cross-repo work with `tabula-md`, use one
umbrella Linear issue and attach each repository PR to it.

Move the Linear issue:

- `In Progress` when implementation starts.
- `In Review` when the relevant PR or stack is submitted.
- `Done` only after the closing PR has merged and no required follow-up remains.

## Graphite

Graphite is mandatory for normal PR work after the initial repository bootstrap.
The initial bootstrap has already happened, so future changes should not go
directly to `main` unless the repository owner explicitly asks for a fallback.

Branch rules:

- Make edits first, then run `gt create`.
- Use short semantic branch names, usually `codex/<short-slug>`,
  `claude/<short-slug>`, `cursor/<short-slug>`, or `dev/<github-login>/<short-slug>`.
- Use Conventional Commit titles, such as `docs(workflow): add agent context`.
- Keep Linear issue keys, dates, session ids, and underscores out of branch and
  PR titles.

Submit rules:

- Single PR: `gt submit`.
- Stack: `gt submit --stack`.
- Use `gt restack`, `gt move`, `gt reorder`, `gt fold`, `gt split`, and
  `gt undo` before reaching for raw Git recovery.

## PR Shape

Every PR should explain:

- Summary: what changed and why.
- Review focus: what the reviewer should inspect.
- Validation: commands run, or why they were not run.
- Security impact: whether room keys, plaintext, ciphertext envelopes, storage,
  logging, CORS, rate limits, or payload limits are affected.
- Risk: remaining operational or compatibility risk.

For docs-only changes, validation is usually `npm test`, `npm run build`, or an
explicit reason those commands were not needed.

## Validation

Use the smallest validation set that covers the risk:

- Protocol validation: `npm test`.
- Server, storage, WebSocket, CORS, rate limit, or payload changes: `npm test`.
- TypeScript, package, or CI changes: `npm run build`.
- Public docs or API documentation changes: verify `README.md`, `SECURITY.md`,
  and `CONTRIBUTING.md` stay consistent.
- Before PR handoff, run `git diff --check`.

## Merge And Cleanup

Use Graphite UI for normal PR and stack merges. After the repository owner
merges a PR or stack:

```sh
gt sync --delete-all
git remote prune origin
```

Do not edit `graphite-base/*` branches. They are Graphite implementation
branches and can be removed after the full stack lands and sync completes.

## Security Gate

Do not merge changes that violate these constraints:

- Room keys must not reach the server.
- Plaintext Markdown must not reach the server.
- Encrypted envelopes must stay opaque to server code.
- Snapshot storage must persist ciphertext only.
- Logs must not include room keys, plaintext Markdown, or full encrypted payloads
  unless explicitly needed for local debugging and removed before merge.
- `roomId` must not be treated as a write authorization secret.

If a requested feature needs server-side plaintext or key access, stop and ask
for an architecture decision before implementing it.
