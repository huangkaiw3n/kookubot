const PropertyGuru = require("./PropertyGuru");
const { notifyNewListing, sendMessage } = require("./Telegram");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");

// Search configuration
const SEARCH_CONFIG = {
  street: "Bishan Street 13",
  minSize: 1300,
};

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
    // Step 1: Fetch and parse listings from PropertyGuru
    const listings = await PropertyGuru.fetchAndParseListings(SEARCH_CONFIG);

    console.log(`Found ${listings.length} listings matching criteria`);

    // Step 2: Process each listing
    let newListingsCount = 0;

    for (const listing of listings) {
      try {
        // Check if we've seen this listing before
        const alreadySeen = seenListingIds.has(listing.id);

        if (!alreadySeen) {
          // New listing! Send notification
          console.log("New listing found:", {
            id: listing.id,
            address: listing.address,
            price: listing.price,
            size: listing.size,
          });

          await notifyNewListing(listing);
          newListingsCount++;

          // Mark as seen
          seenListingIds.add(listing.id);

          // Wait a bit between notifications to avoid rate limits
          if (newListingsCount < listings.length) {
            await sleep(1000);
          }
        }
      } catch (error) {
        // Log but don't stop processing other listings
        console.error("Error processing listing:", listing.id, error.message);
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

    // Send summary message
    const summaryMessage = `
📊 PropertyGuru Monitor Summary

📋 Listings found: ${summary.totalListings}
🆕 New listings: ${summary.newListings}
⏱️ Duration: ${summary.duration}
🕐 Completed at: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
`.trim();

    await sendMessage(summaryMessage);

    return summary;
  } catch (error) {
    console.error("PropertyGuru monitor failed:", error);
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

  // Schedule to run every 5 minutes
  const job = schedule.scheduleJob("*/5 * * * *", async () => {
    console.log("\n=== Scheduled run triggered ===");
    try {
      await run();
    } catch (error) {
      console.error("Scheduled run failed:", error);
      // Send error notification
      try {
        await sendMessage(`❌ PropertyGuru monitor error:\n${error.message}`);
      } catch (notifyError) {
        console.error("Failed to send error notification:", notifyError);
      }
    }
  });

  console.log("Scheduler started - running every 5 minutes");
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
