/**
 * Browser / Cloudflare bypass configuration.
 */

const VIEWPORT = { width: 1920, height: 1080 };

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

module.exports = { VIEWPORT, BASE_HEADERS, BROWSER_ARGS, IGNORED_DEFAULT_ARGS };
