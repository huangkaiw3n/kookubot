# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A PropertyGuru property-listing monitor. It scrapes a PropertyGuru search (by street + minimum size), filters listings by a block-number regex, tracks which listing IDs it has already seen, and pushes new ones to Telegram. It runs as a long-lived scheduled process on a home server.

## Commands

```bash
npm start        # run the scheduler (runs once immediately, then on SCHEDULE_PATTERN)
npm run dev      # same, with env=dev — logs Telegram payloads instead of sending them
DEBUG_HTML=1 npm start   # dump fetched HTML to debug_response.html after each page fetch
```

There is no test suite — `npm test` just runs `index.js`. To exercise a single piece of the pipeline, require the relevant module (`PropertyGuru.js` exports `fetchAndParseListings`, `parseListings`, `buildSearchUrl`, `getTotalPages`) from a Node REPL or a throwaway script.

### Environment variables

A `.env` file (gitignored via `*.env`) is auto-loaded at startup — `index.js` calls `require("dotenv").config()` as its first statement, *before* requiring `Telegram.js` (which reads its keys at import time).

- `TELEGRAM_BOT_KEY`, `CHAT_ID` — required to actually send Telegram messages.
- `CRONITOR_API_KEY`, `CRONITOR_MONITOR_KEY` — Cronitor account API key + monitor key, used by the official `cronitor` package. Optional; if either is unset, Cronitor pings are skipped. See below.
- `env=dev` — short-circuits Telegram sends *and* Cronitor pings to `console.log` (see `Telegram.js` / `Cronitor.js`).
- `DEBUG_HTML=1` — persist scraped HTML for selector debugging.

### Liveness / down-alerting

Liveness is tracked by **Cronitor** (via the official `cronitor` npm package), not a self-sent message. `run()` pings Cronitor `run` at start, `complete` on success, and `fail` (with the error message) on error, via `Cronitor.js` (`pingCronitor`, which wraps `new cronitor.Monitor(key).ping({ state, message })`). Cronitor's own Telegram integration — configured in the Cronitor dashboard, not in this repo — alerts when a `fail` arrives or when expected pings stop (process died / missed schedule). Telegram messages from the app itself are now sent **only when there are new listings**.

Crucially, a **Telegram delivery failure also fails the run**: `run()` collects any `notifyNewListing`/`sendMessage` errors and throws at the end if any occurred, so a broken bot (bad token, bad `CHAT_ID`, rate limit) pings Cronitor `fail` instead of silently pinging `complete`. Because Cronitor's alert channel is independent of this app's bot, the alert still arrives. A listing whose notification failed is **not** marked seen, so it retries on the next run.

## Architecture

Modules, wired together in `index.js`:

- **`index.js`** — orchestration + scheduling. Holds an in-memory `Set` of seen listing IDs persisted to `seen_listings.json` (loaded on startup, saved after each run and on SIGINT/SIGTERM). Diffs fetched listings against the set, notifies on new ones, sends a summary only when there are new listings, and pings Cronitor for liveness. `SEARCH_CONFIG` (street + minSize) and `SCHEDULE_PATTERN` (cron, server-local GMT+8 time) are defined here as constants.
- **`PropertyGuru.js`** — the scraper. Drives Puppeteer to load the search, survive Cloudflare's JS challenge, paginate, and parse listings with Cheerio.
- **`Telegram.js`** — message formatting + delivery via the Telegram Bot API.
- **`Cronitor.js`** — `pingCronitor(state, message)` telemetry ping (`run`/`complete`/`fail`) for up/down monitoring; see "Liveness / down-alerting" above.
- **`browser.config.js`** — viewport, HTTP headers, and Chrome launch flags tuned to suppress automation signals.

### The Cloudflare-bypass scraping flow (the tricky part)

PropertyGuru sits behind Cloudflare, so scraping is fragile and the code is built around evading bot detection:

1. `setupPage` derives the user agent from the bundled Chromium (stripping the `HeadlessChrome` marker) and injects `evaluateOnNewDocument` patches that spoof `navigator.webdriver`, plugins, languages, `window.chrome`, and the permissions API — all run *before* page load.
2. `navigateWithChallenge` loads a page with `waitUntil: "domcontentloaded"` (deliberately not `networkidle` — the CF challenge keeps the network busy and would time out). On a 403 it polls for the `cf_clearance` cookie, then waits for the listing selector to confirm real content loaded. It returns the HTML directly to avoid a redundant second navigation. `fetchPropertyGuruHTML` falls back to `navigateAndGetHTML` (with retries/backoff) if this returns null.
3. **Each page is fetched in its own fresh browser session** via `fetchPropertyGuruHTML` (launch → navigate → close). This is load-bearing, not wasteful: the CF challenge re-fires on every navigation, and `navigateWithChallenge` only solves it by polling *while* the challenge runs. Reusing one session leaves a stale `cf_clearance` cookie that makes that poll short-circuit instantly, so the challenge never re-solves and every page after the first 403s. A fresh session (no cookie) waits correctly and succeeds. A randomized human-like delay separates page loads.
4. **Pagination is path-based**: PropertyGuru paginates via `/property-for-sale/N`, *not* a `?page=N` query param (which it silently ignores, always returning page 1). `buildSearchUrl` puts the page number in the path for N > 1. (An earlier click-based approach using the `[da-id="hui-pagination-btn-page-N"]` buttons was abandoned — those buttons are JS-driven and `href` back to page 1, so clicks were unreliable.)

### Parsing & filtering

`parseListings` extracts each card via PropertyGuru's `da-listing-id` / `.listing-card-v2` selectors (with fallbacks). A listing is **kept** only if it passes two filters:

- size ≥ `minSize` (when both are present), and
- it has a **non-empty address that matches** `BLOCK_REGEX` (defined at the top of `PropertyGuru.js`) — this regex selects the block numbers of interest. Edit this constant to change which blocks are monitored. Requiring a non-empty address also drops PropertyGuru's injected advertisement cards (larger private properties with no street address and a bogus size), which would otherwise slip past the filters.

These selectors and the `.hui-pagination-root` pagination selector are coupled to PropertyGuru's current DOM. When scraping silently returns zero listings, the markup has likely changed — use `DEBUG_HTML=1` and inspect `debug_response.html` (the parser also logs candidate class names when no cards are found).

## Gitignored runtime files

`seen_listings.json`, `debug_response.html`, and `*.env` are gitignored. `seen_listings.json` is the dedup state — deleting it makes the next run treat every current listing as new.
