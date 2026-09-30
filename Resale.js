const axios = require("axios");

// HDB "Resale flat prices based on registration date from Jan-2017 onwards".
const DATASET_URL = "https://data.gov.sg/api/action/datastore_search";
const RESOURCE_ID = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
const LOOKBACK_MONTHS = 12;
// Streets mix 1960s blocks with new ones, so only compare against flats whose
// lease started near the listing's build year. PropertyGuru's build year can
// precede HDB's lease start by up to ~9 years on older blocks.
const LEASE_START_TOLERANCE_YEARS = 10;

// PropertyGuru writes street names in full; HDB's dataset abbreviates them.
const STREET_ABBREVIATIONS = {
  AVENUE: "AVE",
  BUKIT: "BT",
  CENTRAL: "CTRL",
  CLOSE: "CL",
  COMMONWEALTH: "C'WEALTH",
  CRESCENT: "CRES",
  DRIVE: "DR",
  GARDENS: "GDNS",
  HEIGHTS: "HTS",
  JALAN: "JLN",
  KAMPONG: "KG",
  LORONG: "LOR",
  MARKET: "MKT",
  NORTH: "NTH",
  PARK: "PK",
  PLACE: "PL",
  ROAD: "RD",
  SOUTH: "STH",
  SQUARE: "SQ",
  STREET: "ST",
  TANJONG: "TG",
  TERRACE: "TER",
  UPPER: "UPP",
};

// HDB floor areas: 2-room 34–50 sqm, 3-room 54–75 sqm. Bedroom counts on
// PropertyGuru are unreliable (agents count study rooms), so size decides.
function flatTypeFromSize(sqft) {
  if (!sqft) return null;
  if (sqft < 560) return "2 ROOM";
  if (sqft < 850) return "3 ROOM";
  return null;
}

// "86 Commonwealth Close, Alexandra / Commonwealth" -> "C'WEALTH CL"
function toHdbStreet(address) {
  return address
    .split(",")[0]
    .replace(/^\d+[A-Za-z]?\s+/, "")
    .toUpperCase()
    .split(/\s+/)
    .map((word) => STREET_ABBREVIATIONS[word] || word)
    .join(" ");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cutoffMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - LOOKBACK_MONTHS);
  return d.toISOString().slice(0, 7); // "YYYY-MM", same format as the dataset
}

async function fetchTransactions(flatType) {
  const { data } = await axios.get(DATASET_URL, {
    params: {
      resource_id: RESOURCE_ID,
      filters: JSON.stringify({ flat_type: flatType }),
      sort: "month desc",
      limit: 10000, // well over a year of 3-room sales
    },
    timeout: 30000,
  });
  return data.result.records;
}

// Returns a Map of "STREET|FLAT TYPE" -> [{ price, leaseStart }] over the
// last LOOKBACK_MONTHS of resale transactions.
async function loadResaleBenchmarks(flatTypes = ["2 ROOM", "3 ROOM"]) {
  const since = cutoffMonth();
  const salesByKey = new Map();

  for (const flatType of flatTypes) {
    const records = await fetchTransactions(flatType);
    for (const r of records) {
      if (r.month < since) continue;
      const key = `${r.street_name}|${r.flat_type}`;
      if (!salesByKey.has(key)) salesByKey.set(key, []);
      salesByKey.get(key).push({
        price: Number(r.resale_price),
        leaseStart: Number(r.lease_commence_date),
      });
    }
  }

  console.log(`Loaded resale benchmarks for ${salesByKey.size} street/flat types`);
  return salesByKey;
}

// Returns { flatType, street, median, count } or null if there is no
// comparable resale data for this listing.
function compareToResale(benchmarks, listing) {
  const flatType = flatTypeFromSize(listing.size);
  if (!benchmarks || !flatType || !listing.address) return null;

  const street = toHdbStreet(listing.address);
  const sales = (benchmarks.get(`${street}|${flatType}`) || []).filter(
    (sale) =>
      !listing.builtYear ||
      Math.abs(sale.leaseStart - listing.builtYear) <= LEASE_START_TOLERANCE_YEARS,
  );
  if (sales.length === 0) return null;

  const prices = sales.map((sale) => sale.price);
  return { flatType, street, median: median(prices), count: prices.length };
}

module.exports = { loadResaleBenchmarks, compareToResale, toHdbStreet };
