#!/usr/bin/env node
// Discover earlier league participation by account ID, including old teams.
// This is a source inventory, not a pre-lock roster attestation or data gate.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, optionalJson, ROOT } from "./exact-data.mjs";
import { odFetch } from "./opendota.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args[at + 1];
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run discover-sources -- --target ID --config pre-lock.json [--days 365] [--write]
       npm run discover-sources -- --target ID --observed-proxy --cutoff UNIX [--days 365] [--write]

The second form uses post-event observed accounts only for a diagnostic. It
cannot certify a pre-event roster. OpenDota Explorer is queried read-only.`);
  process.exit(0);
}

const targetId = Number(flag("--target"));
const days = Number(flag("--days") ?? 365);
const configPath = flag("--config");
const observedProxy = args.includes("--observed-proxy");
if (!Number.isSafeInteger(targetId) || targetId <= 0 || !Number.isSafeInteger(days)
    || days < 1 || days > 730 || Number(Boolean(configPath)) + Number(observedProxy) !== 1) {
  throw new Error("Provide a target, 1–730 days, and exactly one of --config or --observed-proxy. See --help.");
}

let cutoff, players, rosterPolicy;
if (configPath) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config.targetLeagueId !== targetId || !Array.isArray(config.roster)) {
    throw new Error("Config target/roster mismatch");
  }
  if (config.stage !== "groupStage" || !Number.isSafeInteger(config.rosterKnownAt)
      || config.rosterKnownAt > config.cutoff || !config.rosterSource?.trim()) {
    throw new Error("Group pre-lock roster evidence and rosterKnownAt are required");
  }
  cutoff = config.cutoff;
  players = config.roster;
  rosterPolicy = "supplied-pre-lock-manifest; evidence still requires review";
} else {
  cutoff = Number(flag("--cutoff"));
  const target = JSON.parse(await readFile(join(ROOT, "data/generated", `league-${targetId}.json`), "utf8"));
  players = target.players;
  rosterPolicy = "post-event observed-account proxy; not a pre-lock roster";
}
if (!Number.isSafeInteger(cutoff) || cutoff <= 0) throw new Error("Explicit Unix cutoff required");
const accountIds = [...new Set(players.map((p) => p.accountId))].sort((a, b) => a - b);
if (!accountIds.length || accountIds.length !== players.length
    || accountIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error("Invalid roster account IDs");
}
const since = cutoff - days * 86400;
const query = async (sql) => {
  const response = await odFetch(`/explorer?sql=${encodeURIComponent(sql)}`);
  if (!Array.isArray(response.rows)) throw new Error("OpenDota Explorer returned no rows array");
  return response.rows;
};

const participation = await query(`
  SELECT m.leagueid, l.name, l.tier,
    COUNT(DISTINCT m.match_id) AS roster_maps,
    COUNT(DISTINCT p.account_id) AS roster_players,
    ARRAY_AGG(DISTINCT p.account_id ORDER BY p.account_id) AS account_ids
  FROM player_matches p
  JOIN matches m ON m.match_id = p.match_id
  LEFT JOIN leagues l ON l.leagueid = m.leagueid
  WHERE p.account_id IN (${accountIds.join(",")})
    AND m.leagueid > 0 AND m.leagueid <> ${targetId}
    AND m.start_time >= ${since}
    AND m.start_time + m.duration < ${cutoff}
  GROUP BY m.leagueid, l.name, l.tier
  ORDER BY roster_players DESC, roster_maps DESC
`);
const leagueIds = participation.map((row) => Number(row.leagueid));
if (leagueIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
  throw new Error("OpenDota returned an invalid league ID");
}
const eventSpans = leagueIds.length ? await query(`
  SELECT leagueid, COUNT(*) AS event_maps,
    MIN(start_time) AS first_match,
    MAX(start_time + duration) AS last_end
  FROM matches WHERE leagueid IN (${leagueIds.join(",")})
  GROUP BY leagueid
`) : [];
const spans = new Map(eventSpans.map((row) => [Number(row.leagueid), row]));

const events = [];
for (const row of participation) {
  const leagueId = Number(row.leagueid);
  const span = spans.get(leagueId);
  const audit = await optionalJson(join(ROOT, "data/audits", `league-${leagueId}.json`));
  const manifest = await optionalJson(join(ROOT, "data/cache/leagues", `${leagueId}.json`));
  const tier = row.tier ?? null;
  const lastEnd = Number(span?.last_end);
  events.push({ leagueId, name: row.name ?? null, tier,
    rosterMaps: Number(row.roster_maps), rosterPlayers: Number(row.roster_players),
    accountIds: (row.account_ids ?? []).map(Number),
    eventMaps: span ? Number(span.event_maps) : null,
    firstMatch: span ? Number(span.first_match) : null,
    lastEnd: span ? lastEnd : null,
    tierCandidate: tier === "premium" || tier === "professional",
    completedBeforeCutoff: Number.isFinite(lastEnd) && lastEnd < cutoff,
    cachedManifest: Boolean(manifest), exactGate: audit?.gate?.pass ?? null });
}
events.sort((a, b) => b.rosterPlayers - a.rosterPlayers || b.rosterMaps - a.rosterMaps);
const report = { targetLeagueId: targetId, rosterPolicy, cutoff, since, days,
  discoveredAt: new Date().toISOString(), accountCount: accountIds.length, accountIds,
  scope: "OpenDota matches linked to supplied account IDs; organizer and roster evidence still need review",
  events };
if (args.includes("--write")) {
  const path = join(ROOT, "data/audits", `source-events-${targetId}.json`);
  await atomicJson(path, report);
  console.log(`Saved ${path}`);
}
const eligible = events.filter((e) => e.tierCandidate && e.completedBeforeCutoff);
const missing = eligible.filter((e) => !e.cachedManifest);
console.log(`${accountIds.length} accounts; ${events.length} linked leagues; ${eligible.length} completed premium/professional candidates; ${missing.length} without cached match manifests.`);
for (const e of missing) {
  console.log(`${String(e.leagueId).padEnd(7)} ${String(e.rosterPlayers).padStart(2)} players ${String(e.rosterMaps).padStart(3)} maps  ${e.name}`);
}
console.log(`Roster policy: ${rosterPolicy}. No source was fetched or trained.`);
