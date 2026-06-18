# Security Policy

Tabula Room is designed to relay and store ciphertext only. Room keys and
plaintext Markdown must remain in the Tabula.md browser client.

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

Reports that show a room key, plaintext document content, or decrypted snapshot
reaching the server are treated as high severity.
