# Contributing

Thanks for helping improve Tabula.md Room.

## Before You Start

- Use GitHub Issues for bugs and focused proposals.
- Keep pull requests limited to one reviewable concern.
- Discuss protocol, persistence, or security-boundary changes before writing
  code.
- Do not include room links, keys, plaintext content, credentials, or complete
  encrypted envelopes in issues, logs, screenshots, or fixtures.
- Report vulnerabilities privately through [Security](SECURITY.md).

## Development

```sh
npm install
npm test
npm run build
npm run test:docker
```

## Pull Requests

Explain why the change is needed, what changed, and how you verified it.
Include risk notes only when they help review the relay or security boundary.
