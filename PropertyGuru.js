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

// Block filter configuration - Fill this to whatever you need
const BLOCK_REGEX = /\b(158|16[0-6])\b/;

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

// Navigate to the target URL, let Cloudflare's JS challenge run, and return
// the page HTML if listings are already present (avoids a redundant reload).
// Returns null if the page didn't load usable content.
async function navigateWithChallenge(page, targetUrl) {
  console.log(`Navigating (with CF challenge handling): ${targetUrl}`);

  try {
    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    console.log(`Response status: ${response.status()}`);

    // If we got a challenge (403), poll for cf_clearance then wait for
    // the page to auto-refresh with real content.
    if (response.status() === 403) {
      console.log("Cloudflare challenge detected, waiting for it to resolve...");

      const maxWaitMs = 30000;
      const pollMs = 2000;
      let elapsed = 0;

      while (elapsed < maxWaitMs) {
        const cookies = await page.cookies();
        if (cookies.some((c) => c.name === "cf_clearance")) {
          console.log(`cf_clearance obtained after ${elapsed / 1000}s`);
          break;
        }
        await sleep(pollMs);
        elapsed += pollMs;
        console.log(`Waiting for cf_clearance... (${elapsed / 1000}s)`);
      }
    }

    // Wait for listings to appear (challenge pages auto-redirect once solved)
    await page.waitForSelector(".listing-card-v2, [da-listing-id]", {
      timeout: 20000,
    });
    console.log("Listings loaded!");

    // Set Referer for subsequent navigations
    await page.setExtraHTTPHeaders({
      ...BASE_HEADERS,
      Referer: targetUrl,
    });

    const htmlContent = await page.content();
    console.log(`Successfully fetched HTML (${htmlContent.length} bytes)`);

    if (SAVE_DEBUG_HTML) {
      try {
        fs.writeFileSync(
          path.join(__dirname, "debug_response.html"),
          htmlContent,
        );
        console.log("Saved HTML to debug_response.html");
      } catch (err) {
        console.warn("Could not save debug HTML:", err.message);
      }
    }

    return htmlContent;
  } catch (error) {
    console.warn("navigateWithChallenge failed:", error.message);
    return null;
  }
}

// Navigate an existing page to a URL and return its HTML
async function navigateAndGetHTML(page, url, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Navigating (attempt ${attempt + 1}/${maxRetries}):`, url);

      // Use domcontentloaded so we return quickly and don't block on
      // Cloudflare challenge network activity (which causes networkidle2 to timeout)
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log(`Response status: ${response.status()}`);

      // Don't bail on 403 — Cloudflare's JS challenge may still run and load
      // the real page content. Wait for the listing selector to confirm.
      console.log(
        response.status() === 403
          ? "Cloudflare challenge detected, waiting up to 15s for it to resolve..."
          : "Waiting for listings to load...",
      );
      await page.waitForSelector(".listing-card-v2, [da-listing-id]", {
        timeout: 15000,
      });
      console.log("Listings loaded!");

      const htmlContent = await page.content();
      console.log(`Successfully fetched HTML (${htmlContent.length} bytes)`);

      if (SAVE_DEBUG_HTML) {
        try {
          fs.writeFileSync(
            path.join(__dirname, "debug_response.html"),
            htmlContent,
          );
          console.log("Saved HTML to debug_response.html");
        } catch (err) {
          console.warn("Could not save debug HTML:", err.message);
        }
      }

      return htmlContent;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error("Failed to fetch after all retries:", error.message);
        throw error;
      }
      const backoffMs = 2000 * (attempt + 1);
      console.log(
        `Error occurred, retrying in ${backoffMs}ms...`,
        error.message,
      );
      await sleep(backoffMs);
    }
  }
}

// Fetch PropertyGuru HTML using Puppeteer (standalone — creates its own browser)
async function fetchPropertyGuruHTML(url, maxRetries = 3) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await setupPage(browser);
    return await navigateWithChallenge(page, url)
      || await navigateAndGetHTML(page, url, maxRetries);
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

  return {
    id: listingId,
    address,
    price,
    size,
    url,
    extractedAt: new Date().toISOString(),
  };
}

// Parse HTML to extract listings
function parseListings(htmlString, minSize) {
  const $ = cheerio.load(htmlString);
  const listings = [];

  console.log("Parsing HTML for property listings...");

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
      console.log(
        `Found ${$elements.length} elements with selector: ${selector}`,
      );
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

      // Filter by minimum size if specified
      if (minSize && listing.size && listing.size < minSize) {
        console.log(
          `Skipping listing ${listing.id}: Size ${listing.size} < ${minSize} sqft`,
        );
        return;
      }

      // Require an address that matches the block range of interest. An empty
      // address means this isn't a real result from our search — PropertyGuru
      // injects advertisement cards for larger private properties (no street
      // address, bogus size) that must be excluded.
      if (!listing.address || !BLOCK_REGEX.test(listing.address)) {
        console.log(
          `Skipping listing ${listing.id}: Address "${listing.address}" NOT in search range`,
        );
        return;
      }

      listings.push(listing);
    } catch (error) {
      console.error(
        `Error extracting listing at index ${index}:`,
        error.message,
      );
    }
  });

  console.log(`Parsed ${listings.length} valid listings`);
  return listings;
}

// Build search URL from parameters.
// PropertyGuru paginates by PATH segment (/property-for-sale/N), NOT a query
// param — a ?page=N query is silently ignored and always returns page 1.
function buildSearchUrl(searchParams) {
  const page = searchParams.page || 1;

  const params = {
    ...SEARCH_CONFIG.defaultParams,
    freetext: searchParams.street,
    _freetextDisplay: searchParams.street,
    minSize: searchParams.minSize,
  };

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

// Main entry point: Fetch and parse listings (with pagination)
async function fetchAndParseListings(searchParams) {
  console.log(
    "Starting PropertyGuru listing fetch with Puppeteer...",
    searchParams,
  );

  const allListings = [];

  // Each page is fetched in its own fresh browser session (fetchPropertyGuruHTML
  // launches and tears down a browser per call). This is deliberate: reusing one
  // session across pages leaves a stale cf_clearance cookie that makes
  // navigateWithChallenge short-circuit its wait, so Cloudflare's per-navigation
  // challenge never gets time to re-solve and every page after the first 403s. A
  // fresh session has no cookie, polls while the challenge solves, and succeeds.
  const firstPageUrl = buildSearchUrl(searchParams);
  const firstPageHtml = await fetchPropertyGuruHTML(firstPageUrl);
  const firstPageListings = parseListings(firstPageHtml, searchParams.minSize);
  allListings.push(...firstPageListings);
  console.log(`First page: Found ${firstPageListings.length} listings`);

  // Check for additional pages
  const totalPages = getTotalPages(firstPageHtml);

  if (totalPages > 1) {
    console.log(`Found ${totalPages} total pages to fetch`);

    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      console.log(`Fetching page ${pageNum}/${totalPages}...`);
      try {
        // Small human-like pause between page loads.
        await sleep(2000 + Math.random() * 2000);

        // PropertyGuru paginates by path (/property-for-sale/N); a ?page=N
        // query is ignored.
        const pageUrl = buildSearchUrl({ ...searchParams, page: pageNum });
        const pageHtml = await fetchPropertyGuruHTML(pageUrl);

        const pageListings = parseListings(pageHtml, searchParams.minSize);
        allListings.push(...pageListings);
        console.log(`  Page ${pageNum}: Found ${pageListings.length} listings`);
      } catch (error) {
        console.error(`Error fetching page ${pageNum}:`, error.message);
      }
    }
  } else {
    console.log("No additional pages found");
  }

  console.log(
    `Fetch complete: Found ${allListings.length} total listings across all pages`,
  );
  return allListings;
}

module.exports = {
  fetchAndParseListings,
  fetchPropertyGuruHTML,
  parseListings,
  buildSearchUrl,
  getTotalPages,
};
