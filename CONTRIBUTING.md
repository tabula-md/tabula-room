# Contributing

Thanks for improving Tabula Room.

## Local Setup

```sh
npm install
npm run dev
npm test
npm run build
```

Copy `.env.example` to `.env` when you need local configuration. The default
server port is `3002`.

## Development Rules

- Keep the server ciphertext-only.
- Do not add features that require the server to read room keys or plaintext
  Markdown.
- Keep public APIs small and documented in `README.md`.
- Add tests for protocol, storage, WebSocket, CORS, payload, and rate-limit
  behavior when changing them.
- Maintainer work should follow `WORKFLOW.md`.

## Pull Requests

Use focused pull requests. Include:

- summary of the behavior change
- validation commands
- security impact, especially whether room keys or plaintext could reach the
  server

Run the narrowest useful validation before opening a PR. For protocol, server,
storage, WebSocket, CORS, payload, or rate-limit changes, run `npm test`. For
TypeScript, package, Docker, or CI changes, run `npm run build`.
