# Changelog

## 1.0.3 — unreleased

- Contact & maintainer details: About page, sidebar footer and README now show the official LoopWise and personal contact addresses as clickable email links.
- Attribution: "Councilwise is an open-source software product developed and maintained by LoopWise, created by Suman Mondal."
- Links in the app now always open in your email app or browser, never inside the Councilwise window.

## 1.0.2 — 2026-10-31

- **New connection: My Chrome/Edge (now the default on Windows).** Each member opens in a window of your real Chrome or Edge, using a separate Councilwise profile, so Google sign-in ("Couldn't sign you in — this browser or app may not be secure") and other strict sign-in pages work. Your everyday browser profile is never touched.
- The built-in window is still available as **Built-in window**.
- Settings: choose Chrome or Edge, or give a custom browser path.
- First-run tips in the README and the app: use a separate Gmail account for Councilwise, and expect one browser window per model during a run.

## 1.0.1 — 2026-10-30

- Fix: long messages are now typed instead of pasted. Claude and ChatGPT turned long pastes into attachments, which hid the prompt and could send it twice.
- Model windows are shown during automatic runs by default, because some sites pause when hidden.
- New **Copy timeline** button on the Live run screen, for bug reports.

## 1.0.0 — 2026-10-29

First public release.

- Council process: preflight, independent reviews with roles, anonymous peer review, live fact check, Council Head ruling, moderation, reports.
- Members: Claude, Gemini, ChatGPT, Perplexity, Grok, DeepSeek, Mistral Le Chat, Cohere, plus custom websites.
- Connections: website login (no API keys), optional OpenAI-compatible API (including OpenRouter and Ollama), demo.
- Free / Pro plan detection with manual override.
- Automatic and Assisted modes.
- Live status for every member: working, waiting, paused, needs you, retrying, stopped, skipped, done.
- Pause, Stop and Resume from checkpoint; automatic retries; Windows notifications when a member needs you.
- Long documents split into parts to fit each site's limit; optional original-file upload.
- Transparent 0–100 confidence score (agreement, evidence, facts, resolution).
- Scorecard and disagreement map, key findings, change list, fact check, ruling, moderator corrections, minority report.
- Reports: full report, executive summary, change list, raw answers — PDF, Word, Text, Markdown — with your name and logo.
- Eight review templates and a library of twelve roles; custom templates and connectors from JSON files.
- Local-first: no telemetry; cookies and API keys encrypted with Windows DPAPI.
