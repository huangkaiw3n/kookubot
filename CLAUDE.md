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

- `TELEGRAM_BOT_KEY`, `CHAT_ID` — required to actually send Telegram messages.
- `env=dev` — short-circuits Telegram sends to `console.log` (see `Telegram.js`).
- `DEBUG_HTML=1` — persist scraped HTML for selector debugging.

## Architecture

Three modules, wired together in `index.js`:

- **`index.js`** — orchestration + scheduling. Holds an in-memory `Set` of seen listing IDs persisted to `seen_listings.json` (loaded on startup, saved after each run and on SIGINT/SIGTERM). Diffs fetched listings against the set, notifies on new ones, and sends a run summary. `SEARCH_CONFIG` (street + minSize) and `SCHEDULE_PATTERN` (cron, server-local GMT+8 time) are defined here as constants.
- **`PropertyGuru.js`** — the scraper. Drives Puppeteer to load the search, survive Cloudflare's JS challenge, paginate, and parse listings with Cheerio.
- **`Telegram.js`** — message formatting + delivery via the Telegram Bot API.
- **`browser.config.js`** — viewport, HTTP headers, and Chrome launch flags tuned to suppress automation signals.

### The Cloudflare-bypass scraping flow (the tricky part)

PropertyGuru sits behind Cloudflare, so scraping is fragile and the code is built around evading bot detection:

1. `setupPage` derives the user agent from the bundled Chromium (stripping the `HeadlessChrome` marker) and injects `evaluateOnNewDocument` patches that spoof `navigator.webdriver`, plugins, languages, `window.chrome`, and the permissions API — all run *before* page load.
2. `navigateWithChallenge` loads the first page with `waitUntil: "domcontentloaded"` (deliberately not `networkidle` — the CF challenge keeps the network busy and would time out). On a 403 it polls for the `cf_clearance` cookie, then waits for the listing selector to confirm real content loaded. It returns the HTML directly to avoid a redundant second navigation. `fetchAndParseListings` falls back to `navigateAndGetHTML` (with retries/backoff) if this returns null.
3. **Pagination is done by clicking, not `page.goto()`** — a fresh navigation re-triggers the CF challenge, whereas an in-browser click on the `[da-id="hui-pagination-btn-page-N"]` button is treated as natural. Between pages it adds randomized "human reading" delays and scrolls to the bottom. Pagination may be SPA-driven or a full navigation, so it races a `waitForNavigation` (allowed to fail) against waiting for the listing selector.

### Parsing & filtering

`parseListings` extracts each card via PropertyGuru's `da-listing-id` / `.listing-card-v2` selectors (with fallbacks). A listing is **kept** only if it passes two filters:

- size ≥ `minSize` (when both are present), and
- its address **matches** `BLOCK_REGEX` (defined at the top of `PropertyGuru.js`) — this regex selects the block numbers of interest. Edit this constant to change which blocks are monitored.

These selectors and the `.hui-pagination-root` pagination selector are coupled to PropertyGuru's current DOM. When scraping silently returns zero listings, the markup has likely changed — use `DEBUG_HTML=1` and inspect `debug_response.html` (the parser also logs candidate class names when no cards are found).

## Gitignored runtime files

`seen_listings.json`, `debug_response.html`, and `*.env` are gitignored. `seen_listings.json` is the dedup state — deleting it makes the next run treat every current listing as new.
