const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Search configuration
const SEARCH_CONFIG = {
  baseUrl: "https://www.propertyguru.com.sg/property-for-sale",
  defaultParams: {
    listingType: "sale",
    page: 1,
    isCommercial: false,
  },
};

const blockRegex = /\b16[0-6]\b/;

// Try to load cookies from cookies.json for Puppeteer
let browserCookies = [];
try {
  const cookiesPath = path.join(__dirname, "cookies.json");
  if (fs.existsSync(cookiesPath)) {
    const cookieData = JSON.parse(fs.readFileSync(cookiesPath, "utf8"));
    // Convert to Puppeteer cookie format
    browserCookies = Object.entries(cookieData).map(([name, value]) => ({
      name,
      value,
      domain: ".propertyguru.com.sg",
      path: "/",
      httpOnly: false,
      secure: true,
    }));
    console.log("Loaded cookies for Puppeteer:", Object.keys(cookieData));
  }
} catch (error) {
  console.warn("Failed to load cookies.json:", error.message);
}

// Sleep utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch PropertyGuru HTML using Puppeteer
async function fetchPropertyGuruHTML(url, maxRetries = 3) {
  let browser;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const randomDelay = 1000 + Math.random() * 2000;
        await sleep(randomDelay);
      }

      console.log(
        `Fetching PropertyGuru with Puppeteer (attempt ${attempt + 1}/${maxRetries}):`,
        url,
      );

      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      });

      const page = await browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Set user agent
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      );

      // Set cookies if available
      if (browserCookies.length > 0) {
        await page.setCookie(...browserCookies);
        console.log("Set cookies in Puppeteer");
      }

      // Navigate to page
      console.log("Navigating to page...");
      const response = await page.goto(url, {
        waitUntil: "networkidle2", // Wait until network is idle
        timeout: 30000,
      });

      console.log(`Response status: ${response.status()}`);

      if (response.status() === 403) {
        console.warn("Cloudflare blocked request");
        await browser.close();
        if (attempt < maxRetries - 1) {
          continue;
        }
        throw new Error("Cloudflare blocked request after all retries");
      }

      if (response.status() !== 200) {
        await browser.close();
        throw new Error(`Unexpected status code: ${response.status()}`);
      }

      // Wait for listings to load (try multiple selectors)
      console.log("Waiting for listings to load...");
      try {
        await page.waitForSelector(
          "[data-listing-id], .listing-card, article",
          {
            timeout: 10000,
          },
        );
        console.log("Listings loaded!");
      } catch (err) {
        console.warn("Could not find listings selector, proceeding anyway...");
      }

      // Get HTML content
      const htmlContent = await page.content();
      console.log(`Successfully fetched HTML (${htmlContent.length} bytes)`);

      // Save HTML for debugging
      try {
        const debugPath = path.join(__dirname, "debug_response.html");
        fs.writeFileSync(debugPath, htmlContent);
        console.log(`Saved HTML to debug_response.html`);
      } catch (err) {
        console.warn("Could not save debug HTML:", err.message);
      }

      await browser.close();
      return htmlContent;
    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          // Ignore close errors
        }
      }

      if (attempt === maxRetries - 1) {
        console.error(
          "Failed to fetch PropertyGuru after all retries:",
          error.message,
        );
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

// Extract listing data from cheerio element
function extractListingData($element, $) {
  // Try multiple selectors for listing ID (PropertyGuru specific + fallbacks)
  const listingId = $element.attr("da-listing-id");

  // Extract address - PropertyGuru uses .listing-address
  const address =
    $element.find(".listing-address").first().text().trim() ||
    $element.find(".property-address").first().text().trim() ||
    $element.find("h3 a").first().text().trim() ||
    $element.find("a[itemprop='name']").first().text().trim() ||
    $element.find(".nav-link").first().text().trim() ||
    $element.find("h3").first().text().trim() ||
    $element.find("a").first().attr("title") ||
    $element.find("a").first().text().trim();

  // Extract price - PropertyGuru uses .listing-price
  const priceText =
    $element.find(".listing-price").first().text().trim() ||
    $element.find(".price").first().text().trim() ||
    $element.find(".list-price").first().text().trim() ||
    $element.find("[itemprop='price']").first().text().trim() ||
    $element.find("span[class*='price']").first().text().trim();

  // Parse price: "S$ 1,200,000" or "$1200000" -> 1200000
  const price = priceText ? priceText.replace(/[^0-9]/g, "") : null;

  // Extract size - PropertyGuru has size in feature group
  // Get all text from the element and search for sqft pattern
  const elementText = $element.text();
  const sizeText =
    $element.find(".listing-floorarea").first().text().trim() ||
    $element.find("[itemprop='floorSize']").first().text().trim() ||
    $element.find(".property-size").first().text().trim() ||
    $element.find("span[class*='size']").first().text().trim() ||
    $element.find(".listing-feature-group").text() ||
    elementText;

  // Parse size: "1,500 sqft" or "1500 sqft" -> 1500
  const sizeMatch = sizeText.match(
    /(\d{1,3}(?:,\d{3})*)\s*(?:sqft|sq\.?\s*ft)/i,
  );
  const size = sizeMatch ? parseInt(sizeMatch[1].replace(/,/g, "")) : null;

  // Extract URL - try multiple selectors
  const relativeUrl = $element.find(".card-footer").first().attr("href");

  const url = relativeUrl
    ? relativeUrl.startsWith("http")
      ? relativeUrl
      : `https://www.propertyguru.com.sg${relativeUrl}`
    : null;

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
    ".listing-card-v2",
    ".listing-card",
    "[data-listing-id]",
    ".property-card",
    ".search-result-card",
    "article[class*='listing']",
    "article[class*='property']",
    "div[class*='ListingCard']",
    "[data-id]",
    ".listing-item",
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

      // If address found and not address range of interest, skip it
      if (listing.address && !blockRegex.test(listing.address)) {
        console.log(
          `Skipping listing ${listing.id}: Address ${listing.address} NOT 160-166`,
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

// Build search URL from parameters
function buildSearchUrl(searchParams) {
  const params = {
    ...SEARCH_CONFIG.defaultParams,
    freetext: searchParams.street,
    _freetextDisplay: searchParams.street,
    minSize: searchParams.minSize,
  };

  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${SEARCH_CONFIG.baseUrl}?${queryString}`;
}

// Main entry point: Fetch and parse listings
async function fetchAndParseListings(searchParams) {
  console.log(
    "Starting PropertyGuru listing fetch with Puppeteer...",
    searchParams,
  );

  // Build URL
  const url = buildSearchUrl(searchParams);

  // Fetch HTML using Puppeteer
  const htmlString = await fetchPropertyGuruHTML(url);

  // Parse listings
  const listings = parseListings(htmlString, searchParams.minSize);

  console.log(`Fetch complete: Found ${listings.length} listings`);
  return listings;
}

module.exports = {
  fetchAndParseListings,
  fetchPropertyGuruHTML,
  parseListings,
  buildSearchUrl,
};
