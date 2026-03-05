/**
 * Browser / Cloudflare bypass configuration.
 *
 * When you refresh cookies.json you MUST update USER_AGENT to exactly
 * match the browser that solved the Cloudflare challenge, otherwise
 * cf_clearance will be rejected and you'll get 403s on every page.
 *
 * To find your UA: open Chrome → chrome://version → "User Agent" line.
 */

// ─── UPDATE THIS whenever you get new cookies ────────────────────────────────
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
// ─────────────────────────────────────────────────────────────────────────────

const VIEWPORT = { width: 1920, height: 1080 };

// Cloudflare sets these cookies with specific httpOnly/sameSite attributes.
// Wrong attributes cause the cookie to be ignored by the browser.
const CF_COOKIE_ATTRS = {
  cf_clearance: { httpOnly: true,  sameSite: "None" }, // main bypass token — bound to IP + UA
  __cf_bm:      { httpOnly: true,  sameSite: "None" }, // bot-management score (~30 min TTL)
  _cfuvid:      { httpOnly: true,  sameSite: "None" }, // session tracker (~7 day TTL)
};

// HTTP headers sent on every navigation request.
const BASE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
};

// Chrome launch flags that suppress automation signals Cloudflare detects.
const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--disable-gpu",
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
];

// Default args that Puppeteer adds which expose the browser as automated.
const IGNORED_DEFAULT_ARGS = ["--enable-automation"];

module.exports = { USER_AGENT, VIEWPORT, CF_COOKIE_ATTRS, BASE_HEADERS, BROWSER_ARGS, IGNORED_DEFAULT_ARGS };
