# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Keep this file current: when a change alters commands, architecture, config, or runtime behaviour described here, update the relevant section in the same change.

## Overview

Node.js (CommonJS) bot that runs a list of PropertyGuru Singapore sale searches, filters each search's results in code, and posts new listings to Telegram. Current search (`searches.js`): 2/3-room HDB flats up to $320k (budget $300k) in areas with easy transport to Botanic Gardens MRT, for the user's mother. It runs as a long-lived process on a home server with an in-process cron scheduler (`node-schedule`).

## Commands

```bash
npm start                # run once immediately, then on SCHEDULE_PATTERN
npm run dev              # env=dev: log Telegram payloads and Cronitor pings instead of sending
DEBUG_HTML=1 npm start   # write each fetched page to debug_response.html
```

There is no test suite, linter, or build step. `npm test` is an alias for `npm start` and never exits. To check parsing and one search's filter offline against a saved page:

```bash
node -e 'const pg=require("./PropertyGuru");console.log(pg.parseListings(require("fs").readFileSync("debug_response.html","utf8")).filter(require("./searches")[0].keep))'
```

## Configuration

`index.js` calls `require("dotenv").config()` before any other require, because `Telegram.js` reads its env vars at import time. `.env` is gitignored via `*.env`.

- `TELEGRAM_BOT_KEY`, `CHAT_ID` — Telegram delivery.
- `CRONITOR_API_KEY`, `CRONITOR_MONITOR_KEY` — optional; pings are skipped with a warning if either is unset.
- `ANTHROPIC_API_KEY` — needed for searches with `reviewBrief`. Without it every review fails and messages say "Review unavailable".
- `env=dev`, `DEBUG_HTML=1` — see Commands.

What is monitored is set in code, not env: the searches in `searches.js` and `SCHEDULE_PATTERN` (server local time, SGT) in `index.js`. Each search has a `name` (used in Telegram messages), `params` (PropertyGuru query params merged over the defaults in `PropertyGuru.js`), and a `keep(listing)` filter. Optional: `budget` flags listings priced above it; `compareResale` adds the street's median HDB resale price; `reviewBrief` (who the buyer is and what they need) turns on the Claude review; `minScore` (with `reviewBrief`) filters out listings scoring below this threshold.

PropertyGuru params that work: `freetext`/`_freetextDisplay` (street), `minSize` (sqft), `propertyTypeGroup: "H"` (HDB only), `maxPrice`.

## Architecture

- `index.js` — scheduling and orchestration. `run()` loads resale benchmarks once, then for each search fetches, filters with `keep`, notifies for IDs not in the (shared) seen map, persists the map, and sends one summary only when there are new listings.
- `searches.js` — the search definitions.
- `PropertyGuru.js` — Puppeteer fetch (Cloudflare handling, pagination) and Cheerio parsing. Returns every real card; no search-specific filtering.
- `Resale.js` — pulls the last 12 months of 2/3-room HDB resale transactions from data.gov.sg (dataset `d_8b84c4ee58e3cfc0ece0d773c8ca6abc`, no API key) and compares a listing with sales on the same street and flat type. Flat type comes from size (<560 sqft = 2-room, <850 = 3-room) because PropertyGuru bedroom counts are unreliable. Street names are converted to HDB abbreviations (`Commonwealth Close` → `C'WEALTH CL`) via `STREET_ABBREVIATIONS`. Only sales whose lease started within 10 years of the listing's build year count, since streets mix 1960s and new blocks and PropertyGuru's build year can precede HDB's lease start by ~9 years.
- `ListingReview.js` — for each new listing of a search with `reviewBrief`, `index.js` fetches the listing page (`PropertyGuru.fetchListingDetails`: description, detail rows such as floor level, photo and floor plan URLs from the page's `__NEXT_DATA__`), and `reviewListing` sends up to 12 photos, the floor plan and the listing facts to Claude Opus 5.5 (`output_config.effort: "medium"`, JSON-schema structured output, `fallbacks: "default"` under beta `server-side-fallback-2026-07-01`). It returns `{ score, condition, summary, trip_to_church, concerns }`. Photos are downloaded and sent as base64 because PropertyGuru's image CDN returns 403 without a browser user agent and PropertyGuru referer. Each review costs roughly US$0.05–0.10 and adds one browser launch.
- `browser.config.js` — viewport, request headers and Chrome flags chosen to hide automation signals.
- `Telegram.js` — Bot API `sendMessage` via axios; listing messages use `parse_mode: "HTML"`.
- `Cronitor.js` — `pingCronitor(state, message)` wrapping the `cronitor` package.

### Monitoring and failure handling

Liveness is tracked by Cronitor, not by messages the app sends itself. `run()` pings `run` at start, `complete` on success and `fail` on any thrown error. Down/failure alerts come from Cronitor's own Telegram integration, configured in the Cronitor dashboard.

- Telegram send errors are collected and rethrown after all listings are processed, so a broken bot results in a Cronitor `fail` rather than `complete`.
- A listing is added to the seen map only after its notification succeeds, so failed sends retry next run.
- A failed search (e.g. page 1 fetch fails) is recorded, the remaining searches still run, and the run is failed at the end. A failed fetch of page 2+ is logged and skipped.
- A data.gov.sg failure only drops the resale comparison from messages; it does not fail the run.
- A failed listing-page fetch or Claude review is shown in that listing's message ("Review unavailable: ...") and does not fail the run.
- Listings scoring below `minScore` (if set) are marked seen without a message (recorded with `notified: false` and their score); failed reviews and null reviews are always sent.

Console output is one line per page fetched (listing count, Cloudflare wait and total fetch time), one per search, and one per new listing with its outcome (score and sent/skipped), plus run start/completion. Warnings and errors include the URL, HTTP status and whether the fetch was waiting on `cf_clearance`.

### Cloudflare and scraping

This is the fragile part and most fixes land here.

`fetchPropertyGuruHTML(url, { readySelector })` waits for `readySelector` to confirm real content loaded: search-result cards by default, `script#__NEXT_DATA__` for listing pages.

1. `setupPage` takes the user agent from the bundled Chromium with `HeadlessChrome` replaced, and injects `evaluateOnNewDocument` patches (`navigator.webdriver`, plugins, languages, `window.chrome`, permissions query).
2. `navigateWithChallenge` uses `waitUntil: "domcontentloaded"`; `networkidle` times out while the challenge runs. On a 403 it polls for the `cf_clearance` cookie, then waits for the listing selector and returns the HTML. If it returns null, `fetchPropertyGuruHTML` falls back to `navigateAndGetHTML` with retries.
3. Every page is fetched in a new browser (`fetchPropertyGuruHTML` launches and closes one per call). Do not reuse a session across pages: the stale `cf_clearance` cookie makes the poll exit immediately, the per-navigation challenge never re-solves, and later pages 403.
4. Pagination is path-based (`/property-for-sale/N`); PropertyGuru ignores `?page=N`. Page count comes from `.hui-pagination-root` links on page 1. Clicking the pagination buttons was tried and abandoned as unreliable.

### Parsing and filtering

Cards are found via `.listing-card-v2` / `[da-listing-id]`; fields come from `da-listing-id`, `.listing-address` ("street, region", e.g. "86 Commonwealth Close, Alexandra / Commonwealth"), `.listing-price`, `[da-id="listing-card-v2-area"] p`, `[da-id="listing-card-v2-build-year"]`, `.listing-location-value` (nearest MRT and walk time) and `.agent-description` (headline). Card sections are identified by `da-id` attributes, not classes. The parser drops cards with no address (injected ads); everything else is filtered by each search's `keep`.

If a run returns zero listings, PropertyGuru's markup has probably changed. Re-run with `DEBUG_HTML=1` and inspect `debug_response.html`; the parser also logs candidate class names when it finds no cards.

## Runtime state

`seen_listings.json` (a JSON object keyed by listing ID) is the dedup state, shared across searches. Each entry is `{ search, address, price, size, url, score, notified, seenAt }`: `score` is Claude's review score (null when there was no review or it failed), `notified` is false for listings skipped for scoring below `minScore`, and `seenAt` is an ISO timestamp. It is gitignored, loaded on startup, and saved after each run and on SIGINT/SIGTERM. A legacy file holding an array of IDs is converted on load to `{ notified: true }` entries and rewritten in the new format on the next save. Deleting it, or adding a new search, makes the next run notify every current match. The same unit listed by several agents has several IDs and is notified once per listing.

`run()` called directly (not via `startScheduler`) starts with an empty seen map and still writes `seen_listings.json`.
