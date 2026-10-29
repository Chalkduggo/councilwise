# Contributing to Councilwise

Thank you for helping. The most valuable contributions are:

1. **Connector fixes** — when a chat website changes and a member stops working.
2. **Templates** — review types for new kinds of documents.
3. **Bug reports** with clear steps to reproduce.
4. **Translations and accessibility improvements.**

## Set up

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/councilwise.git
cd councilwise
npm install
npm run demo
```

## Before you open a pull request

- `npm test` passes (unit tests, including a complete simulated council).
- For UI changes: run a demo council and attach a screenshot.
- For connector changes: run a real council with that member, and bump the connector's `version`.
- Keep the app local-first: no telemetry, no new network calls except to the models the user chooses.
- Plain, friendly wording in the interface. Say what happened and what to do next.

## Code layout

See the project structure in the [README](README.md#project-structure). The UI is plain HTML, CSS and JavaScript with no build step, so you can edit and reload.

## Fixing a connector

See [docs/CONNECTORS.md](docs/CONNECTORS.md).

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
