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

function formatListingMessage(listing) {
  const priceFormatted = listing.price
    ? `S$ ${parseInt(listing.price).toLocaleString()}`
    : "Price not available";

  const sizeFormatted = listing.size
    ? `${listing.size.toLocaleString()} sqft`
    : "Size not available";

  const urlLink = listing.url
    ? `<a href="${listing.url}">View Listing</a>`
    : "URL not available";

  return `
🏠 <b>New Property on Bishan Street 13!</b>

📍 <b>Address:</b> ${listing.address || "Address not available"}
💰 <b>Price:</b> ${priceFormatted}
📏 <b>Size:</b> ${sizeFormatted}
🔗 <b>Link:</b> ${urlLink}

⏰ Found at: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}
`.trim();
}

function notifyNewListing(listing) {
  const message = formatListingMessage(listing);
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
