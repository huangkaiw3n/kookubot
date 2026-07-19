const cronitor = require("cronitor");

// Cronitor telemetry pings via the official `cronitor` package. Set:
//   CRONITOR_API_KEY     — your Cronitor account/telemetry API key
//   CRONITOR_MONITOR_KEY — the monitor's key
// Cronitor's Telegram integration (configured in the Cronitor dashboard, not
// here) alerts when a "fail" ping arrives or when expected pings stop (the
// process died or missed its schedule) — this replaces the old self-sent
// uptime heartbeat.
//
// state is one of: "run" (job started), "complete" (finished OK), "fail".

let monitor = null;

// Build the Monitor lazily so env vars (loaded by dotenv in index.js) are read
// at call time, not import time.
function getMonitor() {
  if (monitor) return monitor;

  const apiKey = process.env.CRONITOR_API_KEY;
  const monitorKey = process.env.CRONITOR_MONITOR_KEY;
  if (!apiKey || !monitorKey) return null;

  monitor = new (cronitor(apiKey).Monitor)(monitorKey);
  return monitor;
}

async function pingCronitor(state, message) {
  // In dev mode, log instead of pinging the real monitor (mirrors Telegram.js).
  if (process.env.env === "dev") {
    console.log(
      `[cronitor:dev] would ping state=${state}${message ? ` message=${message}` : ""}`,
    );
    return;
  }

  const m = getMonitor();
  if (!m) {
    console.warn(
      "CRONITOR_API_KEY/CRONITOR_MONITOR_KEY not set — skipping Cronitor ping",
    );
    return;
  }

  try {
    await m.ping({ state, ...(message ? { message } : {}) });
  } catch (error) {
    // Telemetry must never break the monitored run.
    console.warn(`Cronitor ping (${state}) failed:`, error.message);
  }
}

module.exports = { pingCronitor };
