# Security Policy

Tabula Room is designed to relay and store ciphertext only. Room keys and
plaintext Markdown must remain in the Tabula.md browser client.

## Supported Versions

Tabula Room is pre-1.0. Security fixes are handled on `main` and released with
the next public preview tag or deployment.

## Report A Vulnerability

Please do not open a public issue for vulnerabilities. Email the maintainer at
security@tabula.md with:

- affected version or commit
- reproduction steps
- impact
- any suggested fix

## Security Boundaries

- Room keys must never be sent to this server.
- Plaintext Markdown must never be sent to this server.
- Snapshot persistence stores encrypted envelopes only.
- `roomId` is public routing metadata and is not a secret.
- The server may know room membership, timestamps, versions, IVs, ciphertext,
  payload sizes, and rate-limit metadata.
- Decryption failures are client concerns and must not cause the server to write
  plaintext fallback content.

Reports that show a room key, plaintext document content, or decrypted snapshot
reaching the server are treated as high severity.

## Non-Goals For v0

Do not treat the absence of accounts, room permissions, audit logs, Redis,
database storage, or object storage as a vulnerability by itself. Those features
are intentionally outside the v0 room-server scope unless they are tied to a
specific security bug.
