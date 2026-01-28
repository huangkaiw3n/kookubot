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
    page: searchParams.page || 1, // Use provided page or default to 1
  };

  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

  return `${SEARCH_CONFIG.baseUrl}?${queryString}`;
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

  // Build URL for first page
  const firstPageUrl = buildSearchUrl(searchParams);

  // Fetch first page
  const firstPageHtml = await fetchPropertyGuruHTML(firstPageUrl);

  // Parse first page listings
  const firstPageListings = parseListings(firstPageHtml, searchParams.minSize);
  allListings.push(...firstPageListings);

  console.log(`First page: Found ${firstPageListings.length} listings`);

  // Check for additional pages
  const totalPages = getTotalPages(firstPageHtml);

  if (totalPages > 1) {
    console.log(`Found ${totalPages} total pages to fetch`);

    // Fetch pages 2 through totalPages
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      console.log(`Fetching page ${pageNum}/${totalPages}...`);

      try {
        // Build URL with incremented page number
        const pageUrl = buildSearchUrl({ ...searchParams, page: pageNum });
        const pageHtml = await fetchPropertyGuruHTML(pageUrl);
        const pageListings = parseListings(pageHtml, searchParams.minSize);
        allListings.push(...pageListings);
        console.log(`  Page ${pageNum}: Found ${pageListings.length} listings`);

        // Small delay between pages to be polite
        await sleep(2000);
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
