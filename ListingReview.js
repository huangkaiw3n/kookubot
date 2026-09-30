const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");

const MODEL = "claude-opus-5-5";
// Enough to see every room in a small flat while keeping cost per listing low.
const MAX_PHOTOS = 12;

const CONDITIONS = ["move-in ready", "minor touch-ups", "needs renovation", "unclear"];

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    score: {
      type: "integer",
      description: "Overall fit for this buyer, 1 (poor) to 10 (excellent)",
    },
    condition: { type: "string", enum: CONDITIONS },
    summary: {
      type: "string",
      description: "Two or three plain sentences on why this score",
    },
    trip_to_church: {
      type: "string",
      description: "Likely public transport route and rough time to the church",
    },
    concerns: {
      type: "array",
      items: { type: "string" },
      description: "Short points the buyer should check before viewing; empty if none",
    },
  },
  required: ["score", "condition", "summary", "trip_to_church", "concerns"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You review Singapore HDB resale listings for a specific buyer and decide how well each one fits them.

Judge the flat's condition from the photos and description: "move-in ready" means she could live there without work; "minor touch-ups" means paint or small fixes; "needs renovation" means kitchen, bathroom, flooring or wiring work. Use "unclear" when the photos don't show enough. Agents' descriptions are marketing, so trust the photos over the text. Some agents virtually stage or declutter photos; say so if they look edited, and judge the flat's fixtures rather than the furniture.

Value: the listing includes the median price of similar-age flats of the same type recently sold on the same street when that data exists. Weigh price against condition, remaining lease and location.

Location: use what you know about Singapore's MRT network, bus routes and HDB estates. Say when you are estimating.

Write plainly for a family member deciding whether to arrange a viewing.`;

let client = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

// PropertyGuru's image CDN rejects requests without a browser user agent and a
// PropertyGuru referer, so photos are downloaded here and sent as base64 rather
// than as URLs for the API to fetch.
async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      Referer: "https://www.propertyguru.com.sg/",
    },
  });
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: response.headers["content-type"].split(";")[0],
      data: Buffer.from(response.data).toString("base64"),
    },
  };
}

async function downloadImages(urls) {
  const results = await Promise.allSettled(urls.map(downloadImage));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) console.warn(`Could not download ${failed} of ${urls.length} photos`);
  return results.filter((r) => r.status === "fulfilled").map((r) => r.value);
}

function describeListing(listing, details, resale, search) {
  const lines = [
    `Buyer: ${search.reviewBrief}`,
    "",
    `Address: ${listing.address}`,
    `Asking price: S$ ${listing.price}` +
      (search.budget ? ` (budget S$ ${search.budget})` : ""),
    `Size: ${listing.size} sqft`,
    listing.builtYear ? `Built: ${listing.builtYear}` : null,
    listing.nearestMrt ? `Nearest MRT: ${listing.nearestMrt}` : null,
    resale
      ? `Similar-age ${resale.flatType.toLowerCase()} flats on ${resale.street}: median S$ ${resale.median} over ${resale.count} sales in the past year`
      : "No comparable recent resale data for this street.",
    details.details.length ? `Details: ${details.details.join("; ")}` : null,
    details.amenities.length ? `Amenities: ${details.amenities.join(", ")}` : null,
    "",
    "Agent's description:",
    details.description || "(none)",
    "",
    `The first ${details.photoCount} images are listing photos` +
      (details.floorPlanCount ? `; the last ${details.floorPlanCount} is the floor plan.` : "."),
  ];
  return lines.filter((line) => line !== null).join("\n");
}

// Returns { score, condition, summary, trip_to_church, concerns }.
async function reviewListing(listing, details, resale, search) {
  const photos = await downloadImages(details.photoUrls.slice(0, MAX_PHOTOS));
  const floorPlans = await downloadImages(details.floorPlanUrls.slice(0, 1));
  const text = describeListing(
    listing,
    { ...details, photoCount: photos.length, floorPlanCount: floorPlans.length },
    resale,
    search,
  );

  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Re-run on Anthropic's recommended model if a safety classifier declines.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: REVIEW_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: [...photos, ...floorPlans, { type: "text", text }] },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Review refused: ${response.stop_details?.category ?? "unknown"}`);
  }
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error(`Review returned no text (stop_reason: ${response.stop_reason})`);
  }
  return JSON.parse(textBlock.text);
}

module.exports = { reviewListing };
