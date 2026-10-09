const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const {
  VIEWPORT,
  BASE_HEADERS,
  BROWSER_ARGS,
  IGNORED_DEFAULT_ARGS,
} = require("./browser.config");

// Search configuration
const SEARCH_CONFIG = {
  baseUrl: "https://www.propertyguru.com.sg/property-for-sale",
  defaultParams: {
    listingType: "sale",
    isCommercial: false,
  },
};

// Element that confirms real search results (not a Cloudflare challenge) loaded.
const SEARCH_RESULTS_SELECTOR = ".listing-card-v2, [da-listing-id]";

// Set to "1" to save debug_response.html after each successful page fetch
const SAVE_DEBUG_HTML = process.env.DEBUG_HTML === "1";

// Sleep utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Launch a Puppeteer browser with standard args
async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: BROWSER_ARGS,
    ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
  });
}

// Create and configure a new page in an existing browser
async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Derive UA from the bundled Chromium so it always matches the real browser,
  // but strip the "HeadlessChrome" marker that Cloudflare flags.
  const defaultUA = await browser.userAgent();
  const cleanUA = defaultUA.replace("HeadlessChrome", "Chrome");
  await page.setUserAgent(cleanUA);

  await page.setExtraHTTPHeaders(BASE_HEADERS);

  // Method 1: Patch JS properties that Cloudflare checks before any page load
  await page.evaluateOnNewDocument(() => {
    // Hide webdriver flag
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });

    // Spoof plugins (headless Chrome has none)
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Spoof languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-GB", "en-US", "en"],
    });

    // Add chrome object (missing in headless)
    globalThis.chrome = { runtime: {} };

    // Spoof permission query to avoid bot detection
    const originalQuery = globalThis.navigator.permissions.query;
    globalThis.navigator.permissions.query = (parameters) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });

  return page;
}

// Save the page to debug_response.html when DEBUG_HTML=1
function saveDebugHtml(htmlContent) {
  if (!SAVE_DEBUG_HTML) return;
  try {
    fs.writeFileSync(path.join(__dirname, "debug_response.html"), htmlContent);
    console.log("Saved HTML to debug_response.html");
  } catch (err) {
    console.warn("Could not save debug HTML:", err.message);
  }
}

// Navigate to the target URL, let Cloudflare's JS challenge run, and return
// the page HTML if listings are already present (avoids a redundant reload).
// Returns null if the page didn't load usable content. Time spent solving the
// challenge is recorded in `timings.cloudflareMs`.
async function navigateWithChallenge(page, targetUrl, readySelector, timings) {
  let status = "no response";
  let cloudflare = "no challenge";

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    status = response.status();

    // If we got a challenge (403), poll for cf_clearance then wait for
    // the page to auto-refresh with real content.
    if (status === 403) {
      cloudflare = "timed out waiting for cf_clearance";

      const maxWaitMs = 30000;
      const pollMs = 2000;
      const startedAt = Date.now();

      while (Date.now() - startedAt < maxWaitMs) {
        const cookies = await page.cookies();
        if (cookies.some((c) => c.name === "cf_clearance")) {
          cloudflare = "cf_clearance obtained";
          break;
        }
        await sleep(pollMs);
      }
      timings.cloudflareMs = Date.now() - startedAt;
    }

    // Wait for listings to appear (challenge pages auto-redirect once solved)
    await page.waitForSelector(readySelector, {
      timeout: 20000,
    });

    // Set Referer for subsequent navigations
    await page.setExtraHTTPHeaders({
      ...BASE_HEADERS,
      Referer: targetUrl,
    });

    const htmlContent = await page.content();
    saveDebugHtml(htmlContent);
    return htmlContent;
  } catch (error) {
    console.warn(
      `navigateWithChallenge failed for ${targetUrl} (HTTP ${status}, ${cloudflare}): ${error.message}`,
    );
    return null;
  }
}

// Navigate an existing page to a URL and return its HTML
async function navigateAndGetHTML(page, url, readySelector, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let status = "no response";
    try {
      // Use domcontentloaded so we return quickly and don't block on
      // Cloudflare challenge network activity (which causes networkidle2 to timeout)
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      status = response.status();

      // Don't bail on 403 — Cloudflare's JS challenge may still run and load
      // the real page content. Wait for the listing selector to confirm.
      await page.waitForSelector(readySelector, {
        timeout: 15000,
      });

      const htmlContent = await page.content();
      saveDebugHtml(htmlContent);
      return htmlContent;
    } catch (error) {
      const failure = `${url} (attempt ${attempt + 1}/${maxRetries}, HTTP ${status}${status === 403 ? ", waiting on Cloudflare challenge" : ""}): ${error.message}`;
      if (attempt === maxRetries - 1) {
        console.error("Failed to fetch after all retries:", failure);
        throw error;
      }
      const backoffMs = 2000 * (attempt + 1);
      console.log(`Retrying in ${backoffMs}ms after error: ${failure}`);
      await sleep(backoffMs);
    }
  }
}

// Fetch PropertyGuru HTML using Puppeteer (standalone — creates its own browser)
async function fetchPropertyGuruHTML(
  url,
  { readySelector = SEARCH_RESULTS_SELECTOR, maxRetries = 3, timings = {} } = {},
) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await setupPage(browser);
    return await navigateWithChallenge(page, url, readySelector, timings)
      || await navigateAndGetHTML(page, url, readySelector, maxRetries);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Extract listing data from cheerio element (simplified based on actual HTML structure)
function extractListingData($element, $) {
  // PropertyGuru uses da-listing-id attribute
  const listingId = $element.attr("da-listing-id");

  // Address is in .listing-address
  const address = $element.find(".listing-address").first().text().trim();

  // Price is in .listing-price (format: "S$ 949,000")
  const priceText = $element.find(".listing-price").first().text().trim();
  const price = priceText ? priceText.replace(/[^0-9]/g, "") : null;

  // Size is in div[da-id="listing-card-v2-area"] > p (format: "1,302 sqft")
  const areaText = $element
    .find('[da-id="listing-card-v2-area"] p')
    .first()
    .text()
    .trim();
  const size = areaText ? parseInt(areaText.replace(/\D/g, "")) : null;

  // URL is in .card-footer anchor element
  const url = $element.find(".card-footer").first().attr("href");

  // Format: "Built: 1964"
  const builtMatch = $element
    .find('[da-id="listing-card-v2-build-year"]')
    .first()
    .text()
    .match(/\d{4}/);
  const builtYear = builtMatch ? parseInt(builtMatch[0]) : null;

  // Format: "210 m (2 min) from EW20 Commonwealth MRT"
  const nearestMrt = $element.find(".listing-location-value").first().text().trim();
  const walkMatch = nearestMrt.match(/\((\d+) min\)/);
  const mrtWalkMins = walkMatch ? parseInt(walkMatch[1]) : null;

  // Agent-written headline, e.g. "Move-In Ready Home Next to Havelock MRT"
  const headline = $element.find(".agent-description").first().text().trim();

  return {
    id: listingId,
    address,
    price,
    size,
    url,
    builtYear,
    nearestMrt,
    mrtWalkMins,
    headline,
    extractedAt: new Date().toISOString(),
  };
}

// Parse HTML to extract listings. Search-specific filtering is done by the
// caller (see searches.js).
function parseListings(htmlString) {
  const $ = cheerio.load(htmlString);
  const listings = [];

  // Try multiple selectors for listing cards (PropertyGuru uses listing-card-v2)
  const selectors = [
    ".listing-card-v2", // Primary selector for PropertyGuru
    "[da-listing-id]", // Fallback using PropertyGuru's custom attribute
    ".listing-card", // Generic fallback
  ];

  let $elements = $();
  for (const selector of selectors) {
    $elements = $(selector);
    if ($elements.length > 0) {
      break;
    }
  }

  if ($elements.length === 0) {
    console.warn(
      "No listing elements found with any selector. HTML structure may have changed.",
    );
    console.log(
      "HTML preview (first 1000 chars):",
      htmlString.substring(0, 1000),
    );

    // Try to find common patterns
    console.log("\n=== Debugging HTML Structure ===");
    const possibleClasses = [
      "listing",
      "property",
      "card",
      "item",
      "result",
      "Card",
    ];
    possibleClasses.forEach((cls) => {
      const found = $(`[class*="${cls}"]`).length;
      if (found > 0) {
        console.log(`Found ${found} elements with class containing "${cls}"`);
        $(`[class*="${cls}"]`)
          .slice(0, 3)
          .each((_, el) => {
            console.log(`  - ${$(el).attr("class")}`);
          });
      }
    });
  }

  $elements.each((index, element) => {
    try {
      const $element = $(element);
      const listing = extractListingData($element, $);

      // Validate listing has required fields
      if (!listing.id) {
        console.warn(`Skipping listing at index ${index}: No ID found`);
        return;
      }

      // An empty address means this isn't a real result from our search —
      // PropertyGuru injects advertisement cards for larger private
      // properties (no street address, bogus size) that must be excluded.
      if (!listing.address) return;

      listings.push(listing);
    } catch (error) {
      console.error(
        `Error extracting listing at index ${index}:`,
        error.message,
      );
    }
  });

  return listings;
}

// Build search URL from parameters.
// PropertyGuru paginates by PATH segment (/property-for-sale/N), NOT a query
// param — a ?page=N query is silently ignored and always returns page 1.
function buildSearchUrl(searchParams, page = 1) {
  const params = { ...SEARCH_CONFIG.defaultParams, ...searchParams };

  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  const url = page > 1 ? `${SEARCH_CONFIG.baseUrl}/${page}` : SEARCH_CONFIG.baseUrl;
  return `${url}?${queryString}`;
}

// Extract total page count from HTML pagination
function getTotalPages(htmlString) {
  const $ = cheerio.load(htmlString);

  // Find all page links in pagination
  const pagination = $(".hui-pagination-root");
  if (pagination.length > 0) {
    const pageNumbers = [];
    pagination.find("a[href]").each((_, el) => {
      const text = $(el).text().trim();
      // Only get numbered pages
      if (/^\d+$/.test(text)) {
        pageNumbers.push(parseInt(text));
      }
    });

    // Return the highest page number found
    if (pageNumbers.length > 0) {
      return Math.max(...pageNumbers);
    }
  }

  return 1; // Default to 1 page if no pagination found
}

// Fetch and parse one results page, logging its listing count and fetch time.
// Each page is fetched in its own fresh browser session (fetchPropertyGuruHTML
// launches and tears down a browser per call). This is deliberate: reusing one
// session across pages leaves a stale cf_clearance cookie that makes
// navigateWithChallenge short-circuit its wait, so Cloudflare's per-navigation
// challenge never gets time to re-solve and every page after the first 403s. A
// fresh session has no cookie, polls while the challenge solves, and succeeds.
async function fetchResultsPage(searchParams, pageNum, totalPages) {
  const timings = {};
  const startedAt = Date.now();
  const html = await fetchPropertyGuruHTML(buildSearchUrl(searchParams, pageNum), {
    timings,
  });
  const listings = parseListings(html);

  const seconds = (ms) => `${Math.round(ms / 1000)}s`;
  const fetchTime = seconds(Date.now() - startedAt);
  const timing = timings.cloudflareMs
    ? `Cloudflare ${seconds(timings.cloudflareMs)}, ${fetchTime}`
    : fetchTime;
  console.log(`Page ${pageNum}/${totalPages ?? getTotalPages(html)}: ${listings.length} listings (${timing})`);
  return { html, listings };
}

// Main entry point: Fetch and parse listings (with pagination)
async function fetchAndParseListings(searchParams) {
  const firstPage = await fetchResultsPage(searchParams, 1);
  const allListings = [...firstPage.listings];
  const totalPages = getTotalPages(firstPage.html);

  for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
    try {
      // Small human-like pause between page loads.
      await sleep(2000 + Math.random() * 2000);

      // PropertyGuru paginates by path (/property-for-sale/N); a ?page=N
      // query is ignored.
      const page = await fetchResultsPage(searchParams, pageNum, totalPages);
      allListings.push(...page.listings);
    } catch (error) {
      console.error(
        `Error fetching page ${pageNum}/${totalPages} (${buildSearchUrl(searchParams, pageNum)}):`,
        error.message,
      );
    }
  }

  return allListings;
}

// Listing pages are Next.js; everything we need is in the embedded page data,
// which is absent on a Cloudflare challenge page.
const LISTING_PAGE_SELECTOR = "script#__NEXT_DATA__";

function htmlToText(html) {
  return cheerio.load(`<div>${html.replace(/<br\s*\/?>/gi, "\n")}</div>`)("div").text().trim();
}

// Fetch a listing page and return its full description, detail rows (floor
// level, furnishing, tenancy, ...), and photo / floor plan URLs.
async function fetchListingDetails(url) {
  const html = await fetchPropertyGuruHTML(url, {
    readySelector: LISTING_PAGE_SELECTOR,
  });
  const $ = cheerio.load(html);
  const data = JSON.parse($(LISTING_PAGE_SELECTOR).text()).props.pageProps
    .pageData.data;
  const media = data.mediaExplorerData?.mediaGroups || {};

  return {
    description: htmlToText(data.descriptionBlockData?.description || ""),
    details: (data.detailsData?.metatable?.items || []).map((item) => item.value),
    amenities: (data.amenitiesData?.data || []).map((item) => item.text),
    photoUrls: (media.images?.items || []).map((item) => item.src),
    floorPlanUrls: (media.floorPlans?.items || []).map((item) => item.src),
  };
}

module.exports = {
  fetchAndParseListings,
  fetchListingDetails,
  fetchPropertyGuruHTML,
  parseListings,
  buildSearchUrl,
  getTotalPages,
};
