#!/usr/bin/env node
// Builds the pre-event training sample for a tournament.
//
//   npm run train -- 19719          # The International 2026
//
// The rule this enforces: a projection for an event may only use matches played
// BEFORE that event started. Fitting on the thing you are predicting flatters
// the model and tells you nothing about whether it works.
//
// Roster and roles come from the target event - who is on which team, playing
// what position, is known when fantasy locks. Everything else - the per-game
// stat lines the projection is built from - comes only from earlier events,
// fetched with `npm run fetch -- <id> --training`.

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "generated");

const targetId = process.argv.slice(2).find((a) => /^\d+$/.test(a));
if (!targetId) {
  console.error("Usage: npm run train -- <targetLeagueId>");
  console.error("Fetch the training events first: npm run fetch -- <id> --training");
  process.exit(1);
}

const read = async (name) => JSON.parse(await readFile(join(OUT_DIR, name), "utf8"));

const target = await read(`league-${targetId}.json`);
const index = await read("index.json");

if (target.firstMatch == null) {
  console.error(`league-${targetId}.json has no firstMatch timestamp - re-run: npm run fetch -- ${targetId}`);
  process.exit(1);
}

const cutoff = target.firstMatch;
console.log(`Target : ${target.leagueName} (${targetId})`);
console.log(`Cutoff : ${new Date(cutoff * 1000).toISOString()} - only earlier matches may be used\n`);

const sources = [];
const skipped = [];
for (const entry of index.filter((e) => e.training)) {
  const league = await read(`league-${entry.leagueId}.json`);
  if (league.lastMatch == null) {
    skipped.push(`${league.leagueName} (no timestamps - re-fetch it)`);
    continue;
  }
  if (league.lastMatch >= cutoff) {
    skipped.push(`${league.leagueName} (runs into the target event)`);
    continue;
  }
  sources.push(league);
}

if (!sources.length) {
  console.error("No usable training events. Fetch some with --training first.");
  process.exit(1);
}
sources.sort((a, b) => a.firstMatch - b.firstMatch);

// Roster from the target event: account id -> who they are at the event.
const roster = new Map();
for (const p of target.players) {
  if (p.accountId) roster.set(p.accountId, p);
}

const statOrder = target.statOrder;
const merged = new Map();

for (const league of sources) {
  // Stat column order can differ between fetches; map it onto the target's.
  const order = league.statOrder ?? league.availableStats;
  const remap = statOrder.map((stat) => order.indexOf(stat));

  for (const p of league.players) {
    const who = p.accountId && roster.get(p.accountId);
    if (!who) continue; // not at the target event - irrelevant to this projection

    if (!merged.has(p.accountId)) {
      merged.set(p.accountId, {
        accountId: p.accountId,
        // Identity is the target event's, not the training event's: rosters move.
        name: who.name,
        teamId: who.teamId,
        teamName: who.teamName,
        role: who.role,
        games: 0,
        wins: 0,
        samples: [],
        sampleMatches: [],
        sampleSeries: [],
        sampleHeroes: [],
        sampleTitles: [],
        sourceLeagues: []
      });
    }
    const agg = merged.get(p.accountId);
    p.samples.forEach((row, i) => {
      agg.samples.push(remap.map((k) => (k === -1 ? 0 : row[k] ?? 0)));
      agg.sampleMatches.push(p.sampleMatches?.[i] ?? 0);
      // Series ids are only unique within a league; namespace them so two
      // events cannot collide and merge two unrelated series into one.
      const sid = p.sampleSeries?.[i] ?? 0;
      agg.sampleSeries.push(sid ? league.leagueId * 1e7 + sid : -(p.sampleMatches?.[i] ?? i));
      agg.sampleHeroes.push(p.sampleHeroes?.[i] ?? 0);
      agg.sampleTitles.push(p.sampleTitles?.[i] ?? 0);
    });
    agg.games += p.games;
    agg.wins += Math.round((p.winRate ?? 0) * p.games);
    agg.sourceLeagues.push(league.leagueId);
  }
}

const players = [...merged.values()]
  .map((p) => ({
    ...p,
    winRate: p.games ? Number((p.wins / p.games).toFixed(3)) : 0,
    perGame: Object.fromEntries(
      statOrder.map((stat, i) => [
        stat,
        Number((p.samples.reduce((sum, row) => sum + (row[i] ?? 0), 0) / (p.samples.length || 1)).toFixed(3))
      ])
    )
  }))
  .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));

const covered = new Set(players.map((p) => p.accountId));
const missing = target.players.filter((p) => !p.accountId || !covered.has(p.accountId));

const payload = {
  targetLeagueId: Number(targetId),
  targetLeagueName: target.leagueName,
  builtAt: new Date().toISOString(),
  cutoff,
  statOrder,
  unavailableStats: target.unavailableStats,
  sources: sources.map((l) => ({
    leagueId: l.leagueId,
    leagueName: l.leagueName,
    firstMatch: l.firstMatch,
    lastMatch: l.lastMatch,
    maps: l.matchesUsed
  })),
  players,
  coverage: {
    atTarget: target.players.length,
    withHistory: players.length,
    missing: missing.map((p) => `${p.name} (${p.teamName})`)
  }
};

const outFile = join(OUT_DIR, `training-${targetId}.json`);
await writeFile(outFile, JSON.stringify(payload, null, 2));

console.log(`Sources (${sources.length}):`);
for (const l of payload.sources) {
  console.log(`  ${String(l.leagueId).padEnd(6)} ${new Date(l.firstMatch * 1000).toISOString().slice(0, 10)}` +
    ` .. ${new Date(l.lastMatch * 1000).toISOString().slice(0, 10)}  ${String(l.maps).padStart(4)} maps  ${l.leagueName}`);
}
if (skipped.length) {
  console.log(`\nSkipped (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
}
const rows = players.reduce((n, p) => n + p.samples.length, 0);
console.log(`\nMerged : ${players.length} of ${target.players.length} players at the target event`);
console.log(`         ${rows} pre-event game samples, ${(rows / (players.length || 1)).toFixed(1)} per player`);
if (missing.length) {
  console.log(`\nNo pre-event history (${missing.length}):`);
  for (const m of payload.coverage.missing.slice(0, 20)) console.log(`  ${m}`);
  if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);
}
console.log(`\nWrote  : data/generated/training-${targetId}.json`);
