const PropertyGuru = require("./PropertyGuru");
const { notifyNewListing, sendMessage } = require("./Telegram");

// Search configuration
const SEARCH_CONFIG = {
  street: "Bishan Street 13",
  minSize: 1300,
};

// In-memory storage of seen listing IDs (resets on each run)
const seenListingIds = new Set();

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
        // Check if we've seen this listing before (in this run)
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

// Run if executed directly
if (require.main === module) {
  run()
    .then((result) => {
      console.log("\n=== Run Complete ===");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n=== Run Failed ===");
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
