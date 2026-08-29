// Shared OpenDota client: throttling, retry and error handling.
// The free tier allows 60 calls/minute and 3000/day with no API key.
// Set OPENDOTA_API_KEY in the environment for a paid key (raises the cap).

const BASE = "https://api.opendota.com/api";
const KEY = process.env.OPENDOTA_API_KEY || "";

// 60/min => 1000ms between calls leaves margin. With a key we can go faster.
const MIN_INTERVAL_MS = KEY ? 200 : 1100;
let lastCall = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function odFetch(path, { retries = 4 } = {}) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);

  const url = `${BASE}${path}${KEY ? (path.includes("?") ? "&" : "?") + "api_key=" + KEY : ""}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": "BengTiPredictor" } });
    } catch (err) {
      if (attempt === retries) throw new Error(`Network error on ${path}: ${err.message}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (res.status === 429) {
      // Out of quota for this minute - wait the window out.
      const backoff = 5000 * (attempt + 1);
      process.stderr.write(`  rate limited, waiting ${backoff / 1000}s...\n`);
      await sleep(backoff);
      continue;
    }

    if (res.status >= 500) {
      if (attempt === retries) throw new Error(`OpenDota returned ${res.status} for ${path}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (!res.ok) throw new Error(`OpenDota returned ${res.status} for ${path}`);
    return res.json();
  }
  throw new Error(`Gave up after ${retries} retries: ${path}`);
}

export async function remainingQuota() {
  const res = await fetch(`${BASE}/health`);
  return {
    minute: res.headers.get("x-rate-limit-remaining-minute"),
    day: res.headers.get("x-rate-limit-remaining-day")
  };
}
