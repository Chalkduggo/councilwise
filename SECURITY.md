# Security policy

Councilwise handles signed-in sessions to AI websites and confidential documents, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on https://github.com/Chalkduggo/councilwise

You will get a reply within a few days. Please include steps to reproduce and the version (Settings → About).

## How Councilwise protects you

- Passwords are typed only into each provider's own sign-in page. Councilwise never reads or stores them.
- Each member runs in its own isolated browser profile with context isolation and sandboxing. Cookies are encrypted by Chromium with Windows DPAPI.
- API keys are encrypted with Electron `safeStorage` (Windows DPAPI).
- The interface runs with a strict Content Security Policy and no Node.js access.
- Documents and reports are stored only in the user's own app-data folder. There is no telemetry.

## Supported versions

Only the latest release receives security fixes.
