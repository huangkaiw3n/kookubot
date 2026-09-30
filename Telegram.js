const axios = require("axios");
const { serializeError } = require("serialize-error");

const TELEGRAM_BOT_KEY = process.env.TELEGRAM_BOT_KEY;
const CHAT_ID = process.env.CHAT_ID;

function sendMessage(message, options = {}) {
  const payload = {
    chat_id: CHAT_ID,
    text: message,
    ...options,
  };

  // In dev mode, just log it instead of sending
  if (process.env.env === "dev") {
    console.log(payload);
    return;
  }

  return axios.post(
    `https://api.telegram.org/bot${TELEGRAM_BOT_KEY}/sendMessage`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function notifyError(error) {
  const message = JSON.stringify(serializeError(error), null, 2);
  return sendMessage(message);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPrice(amount) {
  return `S$ ${Math.round(amount).toLocaleString()}`;
}

function formatLease(builtYear) {
  // Lease start is usually the build year, so this is an estimate.
  const yearsLeft = 99 - (new Date().getFullYear() - builtYear);
  return `Built ${builtYear} (~${yearsLeft} yrs lease left)`;
}

function formatResale(price, resale) {
  const diffPct = Math.round(((price - resale.median) / resale.median) * 100);
  const comparison =
    diffPct === 0 ? "at" : `${Math.abs(diffPct)}% ${diffPct < 0 ? "below" : "above"}`;
  return `${comparison} ${formatPrice(resale.median)} median (${resale.count} similar-age ${resale.flatType.toLowerCase()} sales on ${resale.street}, past year)`;
}

function formatReview(review) {
  const lines = [
    `🤖 <b>Claude: ${review.score}/10</b> · ${escapeHtml(review.condition)}`,
    escapeHtml(review.summary),
    `⛪ ${escapeHtml(review.trip_to_church)}`,
    ...review.concerns.map((concern) => `• ${escapeHtml(concern)}`),
  ];
  return lines.join("\n");
}

// review is the ListingReview result, null when the search has no review, or
// an Error when the review failed (shown so a broken review isn't silent).
function formatListingMessage(listing, search, resale, review) {
  const price = listing.price ? parseInt(listing.price) : null;
  const overBudget = price && search.budget && price > search.budget;

  const lines = [
    `🏠 <b>New listing: ${escapeHtml(search.name)}</b>`,
    listing.headline ? `<i>${escapeHtml(listing.headline)}</i>` : null,
    "",
    `📍 <b>Address:</b> ${escapeHtml(listing.address || "Address not available")}`,
    `💰 <b>Price:</b> ${price ? formatPrice(price) : "Price not available"}` +
      (overBudget ? ` ⚠️ ${formatPrice(price - search.budget)} over budget` : ""),
    price && resale ? `📊 <b>Value:</b> ${escapeHtml(formatResale(price, resale))}` : null,
    `📏 <b>Size:</b> ${listing.size ? `${listing.size.toLocaleString()} sqft` : "Size not available"}`,
    listing.builtYear ? `🗓️ <b>Lease:</b> ${formatLease(listing.builtYear)}` : null,
    listing.nearestMrt ? `🚇 <b>MRT:</b> ${escapeHtml(listing.nearestMrt)}` : null,
    review instanceof Error
      ? `\n🤖 Review unavailable: ${escapeHtml(review.message)}`
      : review
        ? `\n${formatReview(review)}`
        : null,
    `🔗 <b>Link:</b> ${listing.url ? `<a href="${listing.url}">View Listing</a>` : "URL not available"}`,
    "",
    `⏰ Found at: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`,
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function notifyNewListing(listing, search, resale, review) {
  const message = formatListingMessage(listing, search, resale, review);
  return sendMessage(message, {
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

module.exports = {
  sendMessage,
  notifyError,
  notifyNewListing,
  formatListingMessage,
};
