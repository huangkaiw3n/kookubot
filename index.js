// Load .env into process.env before requiring modules that read env vars
// (e.g. Telegram.js reads TELEGRAM_BOT_KEY/CHAT_ID at import time).
require("dotenv").config();

const PropertyGuru = require("./PropertyGuru");
const { notifyNewListing, sendMessage } = require("./Telegram");
const { pingCronitor } = require("./Cronitor");
const { loadResaleBenchmarks, compareToResale } = require("./Resale");
const SEARCHES = require("./searches");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");

// Schedule configuration (cron format: minute hour day month dayOfWeek)
// Note: Times are in server local time (GMT+8 / Singapore time)
// Examples:
//   "*/5 * * * *"    - Every 5 minutes
//   "*/10 * * * *"   - Every 10 minutes
//   "0 * * * *"      - Every hour
//   "0 9-21 * * *"   - Every hour from 9am to 9pm SGT
//   "*/15 9-21 * * *" - Every 15 minutes from 9am to 9pm SGT
//   "0 9,12,15,18,21 * * *" - At 9am, 12pm, 3pm, 6pm, 9pm SGT
const SCHEDULE_PATTERN = "0 9,12,15,18,21 * * *";

// File to persist seen listing IDs
const SEEN_LISTINGS_FILE = path.join(__dirname, "seen_listings.json");

// In-memory storage of seen listing IDs
let seenListingIds = new Set();

// Load seen listings from file
function loadSeenListings() {
  try {
    if (fs.existsSync(SEEN_LISTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SEEN_LISTINGS_FILE, "utf8"));
      seenListingIds = new Set(data);
      console.log(`Loaded ${seenListingIds.size} seen listings from file`);
    }
  } catch (error) {
    console.warn("Failed to load seen listings:", error.message);
  }
}

// Save seen listings to file
function saveSeenListings() {
  try {
    fs.writeFileSync(
      SEEN_LISTINGS_FILE,
      JSON.stringify(Array.from(seenListingIds), null, 2),
    );
    console.log(`Saved ${seenListingIds.size} seen listings to file`);
  } catch (error) {
    console.error("Failed to save seen listings:", error.message);
  }
}

// Helper: Sleep utility
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resale data only feeds the message, so a data.gov.sg outage shouldn't fail
// the run.
async function loadBenchmarksIfNeeded() {
  if (!SEARCHES.some((search) => search.compareResale)) return null;
  try {
    return await loadResaleBenchmarks();
  } catch (error) {
    console.warn("Could not load resale benchmarks:", error.message);
    return null;
  }
}

// Notify new listings for one search. Delivery failures are pushed to
// `notificationErrors` rather than thrown, so one bad send doesn't stop the rest.
async function processSearch(search, benchmarks, notificationErrors) {
  const allListings = await PropertyGuru.fetchAndParseListings(search.params);
  const listings = allListings.filter(search.keep);
  console.log(
    `[${search.name}] ${listings.length} of ${allListings.length} listings match`,
  );

  let newListingsCount = 0;
  for (const listing of listings) {
    if (seenListingIds.has(listing.id)) {
      continue;
    }

    console.log(`[${search.name}] New listing found:`, {
      id: listing.id,
      address: listing.address,
      price: listing.price,
      size: listing.size,
    });

    try {
      const resale = search.compareResale
        ? compareToResale(benchmarks, listing)
        : null;
      await notifyNewListing(listing, search, resale);
      newListingsCount++;

      // Mark as seen only after a successful notification, so a failed send
      // stays unseen and is retried on the next run.
      seenListingIds.add(listing.id);

      // Wait a bit between notifications to avoid rate limits
      await sleep(1000);
    } catch (error) {
      console.error("Failed to notify new listing:", listing.id, error.message);
      notificationErrors.push(error);
    }
  }

  return { name: search.name, found: listings.length, new: newListingsCount };
}

// Main function
async function run() {
  const startTime = Date.now();

  console.log("PropertyGuru monitor started", {
    timestamp: new Date().toISOString(),
    searches: SEARCHES.map((search) => search.name),
  });

  try {
    // Tell Cronitor the run started (enables duration + hung-job detection).
    await pingCronitor("run");

    const benchmarks = await loadBenchmarksIfNeeded();

    // Collect Telegram delivery failures so we can fail the run afterwards —
    // otherwise a broken bot would be invisible to Cronitor (the run would
    // still ping "complete").
    const notificationErrors = [];
    // A failed search is recorded and the run carries on with the others; the
    // run is failed at the end so Cronitor still alerts.
    const searchErrors = [];
    const results = [];

    for (const search of SEARCHES) {
      try {
        results.push(await processSearch(search, benchmarks, notificationErrors));
      } catch (error) {
        console.error(`[${search.name}] Search failed:`, error.message);
        searchErrors.push(`${search.name}: ${error.message}`);
      }
    }

    // Save seen listings to file after processing
    saveSeenListings();

    const duration = Date.now() - startTime;
    const newListings = results.reduce((sum, r) => sum + r.new, 0);
    console.log("PropertyGuru monitor completed", {
      results,
      duration: `${duration}ms`,
    });

    // Only notify Telegram when there are new listings. Liveness is tracked
    // by Cronitor (see pingCronitor below), not a self-sent uptime heartbeat.
    if (newListings > 0) {
      const perSearch = results
        .map((r) => `• ${r.name}: ${r.new} new of ${r.found} matching`)
        .join("\n");
      const summaryMessage = [
        "📊 PropertyGuru Monitor Summary",
        perSearch,
        `⏱️ Duration: ${duration}ms`,
        `🕐 Completed at: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`,
      ].join("\n");

      try {
        await sendMessage(summaryMessage);
      } catch (error) {
        console.error("Failed to send summary message:", error.message);
        notificationErrors.push(error);
      }
    } else {
      console.log("No new listings — nothing to notify");
    }

    if (searchErrors.length > 0) {
      throw new Error(`Search failed — ${searchErrors.join("; ")}`);
    }

    // If any Telegram delivery failed, fail the run so the outer catch pings
    // Cronitor "fail". Cronitor's own (independent) Telegram integration then
    // alerts us — surfacing a broken bot that would otherwise go unnoticed.
    if (notificationErrors.length > 0) {
      throw new Error(
        `Telegram delivery failed for ${notificationErrors.length} message(s): ${notificationErrors[0].message}`,
      );
    }

    // Tell Cronitor the run finished successfully. If these stop arriving,
    // Cronitor's Telegram integration alerts that the bot is down.
    await pingCronitor("complete");

    return results;
  } catch (error) {
    console.error("PropertyGuru monitor failed:", error);
    await pingCronitor("fail", error.message);
    throw error;
  }
}

// Start the scheduler
function startScheduler() {
  console.log("Starting PropertyGuru monitor scheduler...");

  // Load seen listings from file
  loadSeenListings();

  // Run immediately on startup
  console.log("Running initial check...");
  run().catch((error) => {
    console.error("Initial run failed:", error);
  });

  // Schedule to run based on configured pattern
  const job = schedule.scheduleJob(SCHEDULE_PATTERN, async () => {
    console.log("\n=== Scheduled run triggered ===");
    try {
      await run();
    } catch (error) {
      // run() already pinged Cronitor "fail"; Cronitor alerts via Telegram.
      console.error("Scheduled run failed:", error);
    }
  });

  console.log(`Scheduler started - pattern: ${SCHEDULE_PATTERN}`);
  console.log("Press Ctrl+C to stop");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down gracefully...");
    saveSeenListings();
    job.cancel();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down gracefully...");
    saveSeenListings();
    job.cancel();
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  startScheduler();
}

module.exports = { run, startScheduler };
