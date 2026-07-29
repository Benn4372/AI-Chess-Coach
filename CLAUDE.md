# AI Chess Coach — Claude Code Instructions

## Project shape

Single-page web app, vanilla JS with no build step, hosted on GitHub Pages. Client-only — no server backend.

- Chess engine: **Stockfish WASM** for evaluation.
- Coaching layer: dual LLM — **Claude API** (premium tier) and **WebLLM** (free tier).

## Key files

- [app.js](app.js) — board rendering + engine integration.
- [coach.js](coach.js) — LLM coaching integration, opening detection, endgame logic.
- [openings.json](openings.json) — ECO opening book used by `coach.js`.
- [index.html](index.html), [style.css](style.css) — UI shell + styling.
- [DESIGN.md](DESIGN.md) — design doc for the app.

## External systems

- **Jira project key:** `ACC` on `benjamin02coding.atlassian.net` (cloud ID `ebc606c1-32e4-4f71-a87b-893f42de9cf6`). Use this when referencing tickets or looking up phase work.
