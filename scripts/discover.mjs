#!/usr/bin/env node
// Finds tournaments you do not have yet.
//
//   npm run discover                    # last 2 months, tier 1 + 2
//   npm run discover -- --months 6      # look further back
//   npm run discover -- --tier premium  # tier 1 only
//   npm run discover -- --fetch         # fetch every new relevant event
//
// Walks OpenDota's pro-match feed backwards from today, groups the matches by
// league, and compares that list against data/generated/. Anything missing is
// reported with the one number that decides whether it is worth having: how
// many of its matches involved a team you already track.
//
// That number is the point. Pro Dota runs hundreds of regional events a year
// and almost none of them contain a TI roster, so "matches you are missing" is
// a bad signal and "matches you are missing that have a tracked team in them"
// is a good one.

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { odFetch } from "./opendota.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "generated");

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Find tournaments that are not in data/generated/ yet.

  npm run discover -- [options]

  --months <N>     how far back to look                    (default 2)
  --tier <t>       premium | professional | both           (default both)
  --min-matches N  ignore events smaller than this          (default 8)
  --fetch          actually fetch the relevant new events
  --all            with --fetch, take everything, not only tracked-team events
`);
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const MONTHS = Number(flag("months", 2)) || 2;
const TIER = String(flag("tier", "both"));
const MIN_MATCHES = Number(flag("min-matches", 8)) || 8;
const DO_FETCH = args.includes("--fetch");
const TAKE_ALL = args.includes("--all");

const CUTOFF = Math.floor(Date.now() / 1000) - MONTHS * 30 * 24 * 3600;

// ---------------------------------------------------------------- what we have
const files = (await readdir(OUT_DIR)).filter((f) => /^league-\d+\.json$/.test(f));
const have = new Set(files.map((f) => Number(f.match(/\d+/)[0])));

// Every team name that appears in anything already fetched. Names rather than
// IDs because that is what the rest of the app keys on, and because a roster
// that changes org keeps showing up under the new name either way.
const tracked = new Set();
for (const f of files) {
  const league = JSON.parse(await readFile(join(OUT_DIR, f), "utf8"));
  for (const t of league.teams ?? []) if (t.name) tracked.add(t.name.toLowerCase());
}
// The event the site is currently showing. Training may only use matches that
// finished before it started, so anything overlapping it is reported but is not
// usable as training for it - it is data for the *next* event.
let target = null;
try {
  const index = JSON.parse(await readFile(join(OUT_DIR, "index.json"), "utf8"));
  const entry = index.find((e) => !e.training);
  if (entry) {
    const l = JSON.parse(await readFile(join(OUT_DIR, `league-${entry.leagueId}.json`), "utf8"));
    target = { name: l.leagueName, firstMatch: l.firstMatch };
  }
} catch { /* no index yet */ }

console.log(`Have ${have.size} events, ${tracked.size} distinct teams.`);
if (target) {
  console.log(`Target : ${target.name}, started ${new Date(target.firstMatch * 1000).toISOString().slice(0, 10)}.`);
}
console.log(`Scanning pro matches back to ${new Date(CUTOFF * 1000).toISOString().slice(0, 10)}...\n`);

// ------------------------------------------------------------- what is out there
// /proMatches returns 100 at a time, newest first, paged with less_than_match_id.
const seen = new Map(); // leagueid -> { name, matches, tracked, first, last }
let cursor = null;
let scanned = 0;
let pages = 0;

while (pages < 400) {
  const page = await odFetch(`/proMatches${cursor ? `?less_than_match_id=${cursor}` : ""}`);
  if (!page.length) break;
  pages += 1;

  let reachedCutoff = false;
  for (const m of page) {
    scanned += 1;
    if (m.start_time < CUTOFF) { reachedCutoff = true; continue; }
    if (!m.leagueid) continue;
    const e = seen.get(m.leagueid) ?? {
      name: m.league_name ?? `league ${m.leagueid}`,
      matches: 0, tracked: 0, first: m.start_time, last: m.start_time
    };
    e.matches += 1;
    const a = (m.radiant_name ?? "").toLowerCase();
    const b = (m.dire_name ?? "").toLowerCase();
    if (tracked.has(a) || tracked.has(b)) e.tracked += 1;
    e.first = Math.min(e.first, m.start_time);
    e.last = Math.max(e.last, m.start_time);
    seen.set(m.leagueid, e);
  }

  cursor = page[page.length - 1].match_id;
  if (process.stdout.isTTY) {
    process.stdout.write(`  ${scanned} matches, ${seen.size} events...\r`);
  }
  if (reachedCutoff) break;
}
if (process.stdout.isTTY) process.stdout.write("".padEnd(50) + "\r");

// ------------------------------------------------------------------------ tiers
const leagues = await odFetch("/leagues");
const tierOf = new Map(leagues.map((l) => [l.leagueid, l.tier]));
const wanted = (t) => (TIER === "both" ? t === "premium" || t === "professional" : t === TIER);

const rows = [...seen.entries()]
  .map(([id, e]) => ({ id, tier: tierOf.get(id) ?? "-", ...e }))
  .filter((r) => wanted(r.tier))
  .filter((r) => r.matches >= MIN_MATCHES)
  .sort((a, b) => b.tracked - a.tracked || b.matches - a.matches);

const missing = rows.filter((r) => !have.has(r.id));
const relevant = missing.filter((r) => r.tracked > 0);

const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const table = (list) => {
  for (const r of list) {
    const mark = have.has(r.id) ? "have" : r.tracked > 0 ? "NEW " : "  - ";
    const late = target && r.last >= target.firstMatch ? " [after cutoff]" : "";
    console.log(
      `  ${mark} ${String(r.id).padEnd(7)} ${String(r.tier).padEnd(13)}` +
      `${String(r.matches).padStart(4)} matches ${String(r.tracked).padStart(4)} tracked  ` +
      `${day(r.first)}..${day(r.last)}  ${r.name}${late}`
    );
  }
};

console.log(`Scanned ${scanned} pro matches over ${pages} pages.`);
console.log(`${rows.length} events at the requested tier; ${missing.length} not fetched.\n`);

if (relevant.length) {
  console.log(`Missing, with teams you track (worth fetching):`);
  table(relevant);
  if (target && relevant.some((r) => r.last >= target.firstMatch)) {
    console.log(`\n  [after cutoff] means the event overlaps or follows ${target.name}.`);
    console.log(`  Fetching it is still right - npm run train excludes it automatically,`);
    console.log(`  and it becomes training data the moment you point the site at a newer event.`);
  }
} else {
  console.log("Nothing missing that involves a team you track.");
}

const irrelevant = missing.filter((r) => r.tracked === 0);
if (irrelevant.length) {
  console.log(`\nMissing, no tracked team (skip unless you want wider coverage):`);
  table(irrelevant.slice(0, 15));
  if (irrelevant.length > 15) console.log(`  ... and ${irrelevant.length - 15} more`);
}

// ------------------------------------------------------------------------ fetch
const toFetch = TAKE_ALL ? missing : relevant;
if (!DO_FETCH) {
  if (toFetch.length) {
    console.log(`\nFetch them with:\n  npm run discover -- --months ${MONTHS} --fetch`);
    console.log(`Or one at a time:`);
    for (const r of toFetch.slice(0, 5)) console.log(`  npm run fetch -- ${r.id} --training`);
  }
  process.exit(0);
}

console.log(`\nFetching ${toFetch.length} event(s) as training data...\n`);
for (const r of toFetch) {
  console.log(`--- ${r.id}  ${r.name}`);
  const code = await new Promise((resolve) => {
    spawn(process.execPath, [join(ROOT, "scripts", "fetch-league.mjs"), String(r.id), "--training"],
      { stdio: "inherit" }).on("close", resolve);
  });
  if (code !== 0) console.log(`    failed (exit ${code}) - skipped`);
}
console.log(`\nDone. Rebuild the model with:\n  npm run train -- 19719\n  npm run build`);
