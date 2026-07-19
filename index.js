// Load .env into process.env before requiring modules that read env vars
// (e.g. Telegram.js reads TELEGRAM_BOT_KEY/CHAT_ID at import time).
require("dotenv").config();

const PropertyGuru = require("./PropertyGuru");
const { notifyNewListing, sendMessage } = require("./Telegram");
const { pingCronitor } = require("./Cronitor");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");

// Search configuration
const SEARCH_CONFIG = {
  street: "Bishan Street 13",
  minSize: 1300,
};

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

// Main function
async function run() {
  const startTime = Date.now();

  console.log("PropertyGuru monitor started", {
    timestamp: new Date().toISOString(),
    searchConfig: SEARCH_CONFIG,
  });

  try {
    // Tell Cronitor the run started (enables duration + hung-job detection).
    await pingCronitor("run");

    // Step 1: Fetch and parse listings from PropertyGuru
    const listings = await PropertyGuru.fetchAndParseListings(SEARCH_CONFIG);

    console.log(`Found ${listings.length} listings matching criteria`);

    // Step 2: Process each listing
    let newListingsCount = 0;
    // Collect Telegram delivery failures so we can fail the run afterwards —
    // otherwise a broken bot would be invisible to Cronitor (the run would
    // still ping "complete").
    const notificationErrors = [];

    for (const listing of listings) {
      // Check if we've seen this listing before
      if (seenListingIds.has(listing.id)) {
        continue;
      }

      // New listing! Send notification
      console.log("New listing found:", {
        id: listing.id,
        address: listing.address,
        price: listing.price,
        size: listing.size,
      });

      try {
        await notifyNewListing(listing);
        newListingsCount++;

        // Mark as seen only after a successful notification, so a failed send
        // stays unseen and is retried on the next run.
        seenListingIds.add(listing.id);

        // Wait a bit between notifications to avoid rate limits
        await sleep(1000);
      } catch (error) {
        // Don't stop processing other listings, but remember the failure.
        console.error(
          "Failed to notify new listing:",
          listing.id,
          error.message,
        );
        notificationErrors.push(error);
      }
    }

    // Save seen listings to file after processing
    saveSeenListings();

    // Step 3: Log completion
    const duration = Date.now() - startTime;
    const summary = {
      totalListings: listings.length,
      newListings: newListingsCount,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    };

    console.log("PropertyGuru monitor completed", summary);

    // Only notify Telegram when there are new listings. Liveness is now tracked
    // by Cronitor (see pingCronitor below), not a self-sent uptime heartbeat.
    if (summary.newListings > 0) {
      const summaryMessage = `
        📊 PropertyGuru Monitor Summary
        📋 Listings found: ${summary.totalListings}
        🆕 New listings: ${summary.newListings}
        ⏱️ Duration: ${summary.duration}
        🕐 Completed at: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
        `.trim();

      try {
        await sendMessage(summaryMessage);
      } catch (error) {
        console.error("Failed to send summary message:", error.message);
        notificationErrors.push(error);
      }
    } else {
      console.log("No new listings — nothing to notify");
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

    return summary;
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
