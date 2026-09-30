// Each search is fetched from PropertyGuru with `params` (merged over the
// defaults in PropertyGuru.js), then narrowed by `keep(listing)`.
//
// Optional fields:
//   budget         — price the buyer is aiming for; listings above it are
//                    flagged in the Telegram message (the fetch uses maxPrice).
//   compareResale  — show the street's median HDB resale price for the same
//                    flat type (see Resale.js).
//   reviewBrief    — who the buyer is and what they need; when set, Claude
//                    reviews each new listing's photos and description
//                    (see ListingReview.js).

// Areas with an easy trip to Botanic Gardens MRT (Circle/Downtown lines),
// matched against PropertyGuru's "address, region" text.
const MUM_AREAS =
  /Commonwealth|Alexandra|Queenstown|Tiong Bahru|Telok Blangah|Toa Payoh|Bishan|Ang Mo Kio|Macpherson/i;

// 1-room flats are ~333 sqft; 2-room start around 366 sqft.
const MIN_HDB_2_ROOM_SQFT = 350;
const MAX_MRT_WALK_MINS = 15;

module.exports = [
  {
    name: "HDB for Mum",
    params: {
      propertyTypeGroup: "H",
      // Above budget so move-in-ready flats slightly over it still show up.
      maxPrice: 320000,
    },
    budget: 300000,
    compareResale: true,
    reviewBrief:
      "A 71-year-old woman buying a 2- or 3-room HDB flat to live in. She is price sensitive: budget S$300k, and will only pay slightly more for a move-in-ready flat. She needs convenient shops, groceries and public transport, and travels regularly to church at 17D Adam Road (near Botanic Gardens MRT, Circle and Downtown lines). Lift access, floor level and steps matter at her age.",
    keep: (listing) =>
      listing.size >= MIN_HDB_2_ROOM_SQFT &&
      MUM_AREAS.test(listing.address) &&
      (listing.mrtWalkMins === null || listing.mrtWalkMins <= MAX_MRT_WALK_MINS),
  },
];
