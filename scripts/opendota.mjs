// Shared OpenDota client: throttling, retry and error handling.
// The free tier allows 60 calls/minute and 3000/day with no API key.
// Set OPENDOTA_API_KEY in the environment for a paid key (raises the cap).

const BASE = "https://api.opendota.com/api";
const KEY = process.env.OPENDOTA_API_KEY || "";

// 60/min => 1000ms between calls leaves margin. With a key we can go faster.
const MIN_INTERVAL_MS = KEY ? 200 : 1100;
let lastCall = 0;
let queue = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function odFetch(path, options = {}) {
  // Promise.all callers used to wake together and burst through the limiter.
  const pending = queue.then(() => request(path, options));
  queue = pending.catch(() => {});
  return pending;
}

async function request(path, { retries = 4 } = {}) {

  const url = `${BASE}${path}${KEY ? (path.includes("?") ? "&" : "?") + "api_key=" + KEY : ""}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res;
    try {
      res = await fetch(url, { headers: { "user-agent": "BengTiPredictor" }, signal: AbortSignal.timeout(30000) });
    } catch (err) {
      if (attempt === retries) throw new Error(`Network error on ${path}: ${err.message}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (res.status === 429) {
      if (res.headers.get("x-rate-limit-remaining-day") === "0") throw new Error("OpenDota daily quota exhausted; cached work is retained. Resume after quota reset.");
      const retry = res.headers.get("retry-after");
      const requested = retry ? (/^\d+(\.\d+)?$/.test(retry) ? Number(retry)*1000 : Date.parse(retry)-Date.now()) : 0;
      const backoff = Math.max(Number.isFinite(requested) ? requested : 0, Math.min(60000, 2000*2**attempt));
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
