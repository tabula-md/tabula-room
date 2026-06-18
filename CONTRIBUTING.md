# Contributing

Thanks for improving Tabula Room.

## Local Setup

```sh
npm install
npm test
npm run build
```

## Development Rules

- Keep the server ciphertext-only.
- Do not add features that require the server to read room keys or plaintext
  Markdown.
- Keep public APIs small and documented in `README.md`.
- Add tests for protocol, storage, and WebSocket behavior when changing them.
- Maintainer work should follow `WORKFLOW.md`.

## Pull Requests

Use focused pull requests. Include:

- summary of the behavior change
- validation commands
- security impact, especially whether room keys or plaintext could reach the
  server
