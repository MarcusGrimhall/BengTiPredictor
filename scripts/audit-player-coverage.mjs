#!/usr/bin/env node
// Separate sparse player history from source selection and acquisition gaps.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, exactMatch, optionalJson, readJson, ROOT } from "./exact-data.mjs";

const configPath = process.argv[2];
if (!configPath) throw new Error("Usage: node scripts/audit-player-coverage.mjs <pre-lock-config.json>");
const config = await readJson(configPath);
const discoveryAt = process.argv.indexOf("--discovery");
const discovery = discoveryAt >= 0 ? await readJson(process.argv[discoveryAt + 1]) : null;
const selectionAt = process.argv.indexOf("--selection");
const selection = selectionAt >= 0 ? await readJson(process.argv[selectionAt + 1]) : null;
const sourceBank = new Map((selection?.events ?? []).map(e => [e.leagueId, e.bank]));
const selected = new Set(config.sourceLeagueIds);
const accounts = new Map(config.roster.map(p => [p.accountId, p]));
const byLeague = new Map();
for (const file of await readdir(join(ROOT, "data/cache/matches"))) {
  if (!/^\d+\.json$/.test(file)) continue;
  const raw = await readJson(join(ROOT, "data/cache/matches", file));
  if (raw.start_time + raw.duration >= config.cutoff || !raw.players?.some(p => accounts.has(p.account_id))) continue;
  const replay = await optionalJson(join(ROOT, "data/cache/replay-fantasy/matches", file));
  const fact = exactMatch(raw, replay);
  const group = byLeague.get(raw.leagueid) ?? [];
  group.push({ raw, fact, replayPresent: Boolean(replay) });
  byLeague.set(raw.leagueid, group);
}
const gates = new Map();
for (const id of selected) {
  const audit = await optionalJson(join(ROOT, "data/audits", `league-${id}.json`));
  const manifest = await optionalJson(join(ROOT, "data/cache/leagues", `${id}.json`));
  const rows = byLeague.get(id) ?? [];
  const allRaw = (await optionalJson(join(ROOT, "data/generated", `league-${id}.json`)))?.matchIds ?? [];
  const exactCount = audit?.exactUsableMatches;
  gates.set(id, { pass: audit?.gate?.pass === true, auditedExact: exactCount ?? null,
    expected: manifest?.matches?.length ?? allRaw.length, cachedRosterMaps: rows.length });
}
const players = config.roster.map(p => {
  const buckets = { selectedGateExact: 0, selectedUngatedExact: 0, selectedReplayMissing: 0,
    selectedOtherIncomplete: 0, outsideSelectionExact: 0, outsideSelectionIncomplete: 0 };
  const exactAges = [];
  const sourceTeams = new Map(), sources = new Map();
  for (const [id, maps] of byLeague) for (const {raw, fact, replayPresent} of maps) {
    const row = fact.players.find(r => r.accountId === p.accountId);
    if (!row) continue;
    const key = selected.has(id) ? fact.exact ? gates.get(id)?.pass ? "selectedGateExact" : "selectedUngatedExact"
      : !replayPresent ? "selectedReplayMissing" : "selectedOtherIncomplete"
      : fact.exact ? "outsideSelectionExact" : "outsideSelectionIncomplete";
    buckets[key]++;
    if (key === "selectedGateExact") exactAges.push((config.cutoff - fact.endTime) / 86400);
    sources.set(id, (sources.get(id) ?? 0) + 1);
    sourceTeams.set(row.teamId, (sourceTeams.get(row.teamId) ?? 0) + 1);
  }
  return { accountId: p.accountId, name: p.name, role: p.role, teamId: p.teamId,
    ...buckets, selectedCachedMaps: buckets.selectedGateExact + buckets.selectedUngatedExact + buckets.selectedReplayMissing + buckets.selectedOtherIncomplete,
    exactWindowMaps: Object.fromEntries([30,60,90,180,365].map(days => [days, exactAges.filter(age => age <= days).length])),
    effectiveMaps180Decay60: (() => {
      const weights = exactAges.filter(age => age <= 180).map(age => 2 ** (-age / 60));
      const sum = weights.reduce((a,b)=>a+b,0), square = weights.reduce((a,b)=>a+b*b,0);
      return square ? sum*sum/square : 0;
    })(),
    sourceLeagues: [...sources].map(([leagueId,maps]) => ({leagueId,maps})).sort((a,b)=>b.maps-a.maps),
    discoveredOutsideSelection: (discovery?.events ?? []).filter(e => !selected.has(e.leagueId) && e.accountIds?.includes(p.accountId))
      .map(e => ({leagueId:e.leagueId, bank:sourceBank.get(e.leagueId) ?? "unreviewed", cachedRawMaps:sources.get(e.leagueId) ?? 0})),
    previousTeams: [...sourceTeams].filter(([id])=>id!==p.teamId).map(([teamId,maps])=>({teamId,maps})).sort((a,b)=>b.maps-a.maps) };
});
const report = { targetLeagueId: config.targetLeagueId, cutoff: config.cutoff,
  note: "Counts only cached raw maps before cutoff. Discovered outside-selection leagues prove account participation, not per-player map totals or exactness. Gate status comes from latest saved league audit.",
  selectedSources: Object.fromEntries(gates), players };
const output = join(ROOT, "data/audits", `player-coverage-${config.targetLeagueId}.json`);
await atomicJson(output, report);
console.log(`Wrote ${output}`);
console.table(players.filter(p=>p.selectedGateExact<20).map(p=>({name:p.name,exact:p.selectedGateExact,ungated:p.selectedUngatedExact,replayMissing:p.selectedReplayMissing,outsideExact:p.outsideSelectionExact,previousTeams:p.previousTeams.length})));
