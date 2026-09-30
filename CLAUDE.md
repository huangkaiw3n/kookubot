# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Keep this file current: when a change alters commands, architecture, config, or runtime behaviour described here, update the relevant section in the same change.

## Overview

Node.js (CommonJS) bot that scrapes a PropertyGuru Singapore sale search (street + minimum size), keeps listings whose address matches a block-number regex, and posts new ones to Telegram. It runs as a long-lived process on a home server with an in-process cron scheduler (`node-schedule`).

## Commands

```bash
npm start                # run once immediately, then on SCHEDULE_PATTERN
npm run dev              # env=dev: log Telegram payloads and Cronitor pings instead of sending
DEBUG_HTML=1 npm start   # write each fetched page to debug_response.html
```

There is no test suite, linter, or build step. `npm test` is an alias for `npm start` and never exits. To check the parser offline against a saved page:

```bash
node -e 'const pg=require("./PropertyGuru");console.log(pg.parseListings(require("fs").readFileSync("debug_response.html","utf8"),1300))'
```

## Configuration

`index.js` calls `require("dotenv").config()` before any other require, because `Telegram.js` reads its env vars at import time. `.env` is gitignored via `*.env`.

- `TELEGRAM_BOT_KEY`, `CHAT_ID` — Telegram delivery.
- `CRONITOR_API_KEY`, `CRONITOR_MONITOR_KEY` — optional; pings are skipped with a warning if either is unset.
- `env=dev`, `DEBUG_HTML=1` — see Commands.

What is monitored is set in code, not env: `SEARCH_CONFIG` and `SCHEDULE_PATTERN` (server local time, SGT) in `index.js`, and `BLOCK_REGEX` at the top of `PropertyGuru.js`. The Telegram listing heading in `Telegram.js` has "Bishan Street 13" hard-coded and does not follow `SEARCH_CONFIG`.

## Architecture

- `index.js` — scheduling and orchestration. `run()` fetches listings, notifies for IDs not in the seen set, persists the set, and sends a summary only when there are new listings.
- `PropertyGuru.js` — Puppeteer fetch (Cloudflare handling, pagination) and Cheerio parsing/filtering.
- `browser.config.js` — viewport, request headers and Chrome flags chosen to hide automation signals.
- `Telegram.js` — Bot API `sendMessage` via axios; listing messages use `parse_mode: "HTML"`.
- `Cronitor.js` — `pingCronitor(state, message)` wrapping the `cronitor` package.

### Monitoring and failure handling

Liveness is tracked by Cronitor, not by messages the app sends itself. `run()` pings `run` at start, `complete` on success and `fail` on any thrown error. Down/failure alerts come from Cronitor's own Telegram integration, configured in the Cronitor dashboard.

- Telegram send errors are collected and rethrown after all listings are processed, so a broken bot results in a Cronitor `fail` rather than `complete`.
- A listing is added to the seen set only after its notification succeeds, so failed sends retry next run.
- A failed fetch of page 1 fails the run. A failed fetch of page 2+ is logged and skipped; the run still completes.

### Cloudflare and scraping

This is the fragile part and most fixes land here.

1. `setupPage` takes the user agent from the bundled Chromium with `HeadlessChrome` replaced, and injects `evaluateOnNewDocument` patches (`navigator.webdriver`, plugins, languages, `window.chrome`, permissions query).
2. `navigateWithChallenge` uses `waitUntil: "domcontentloaded"`; `networkidle` times out while the challenge runs. On a 403 it polls for the `cf_clearance` cookie, then waits for the listing selector and returns the HTML. If it returns null, `fetchPropertyGuruHTML` falls back to `navigateAndGetHTML` with retries.
3. Every page is fetched in a new browser (`fetchPropertyGuruHTML` launches and closes one per call). Do not reuse a session across pages: the stale `cf_clearance` cookie makes the poll exit immediately, the per-navigation challenge never re-solves, and later pages 403.
4. Pagination is path-based (`/property-for-sale/N`); PropertyGuru ignores `?page=N`. Page count comes from `.hui-pagination-root` links on page 1. Clicking the pagination buttons was tried and abandoned as unreliable.

### Parsing and filtering

Cards are found via `.listing-card-v2` / `[da-listing-id]`; fields come from `da-listing-id`, `.listing-address`, `.listing-price`, `[da-id="listing-card-v2-area"] p` and `.card-footer[href]`. A listing is kept only if size ≥ `minSize` (when both are known) and it has a non-empty address matching `BLOCK_REGEX`. The non-empty address check also drops injected ad cards, which have no address and a bogus size.

If a run returns zero listings, PropertyGuru's markup has probably changed. Re-run with `DEBUG_HTML=1` and inspect `debug_response.html`; the parser also logs candidate class names when it finds no cards.

## Runtime state

`seen_listings.json` (a JSON array of listing IDs) is the dedup state. It is gitignored, loaded on startup, and saved after each run and on SIGINT/SIGTERM. Deleting it makes the next run notify every current listing.
