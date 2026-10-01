// Primary-model facts. Legacy descriptive extraction lives in extract.mjs.
// A field is either measured under ASSUMPTIONS.md's adopted semantics or null.
import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { RAW_STATS } from "./extract.mjs";
import { sourceSeriesId } from "./series-corrections.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EXACT_SCHEMA = 1;
export const REPLAY_FIELDS = {
  teamfight: "teamfight_participation", tormentor: "tormentors_killed",
  madstones: "madstones_collected", lotuses: "lotuses_collected", watchers: "watchers_captured"
};
export const MIN_COVERAGE = 0.9;
// One-sided binomial tail for a subgroup's missing-match count, under the
// maximum tolerated missingness. Avoid calling 2/10 missing "systematic".
export function missingnessTail(n, missing, p = 1 - MIN_COVERAGE) {
  let logTerm = n*Math.log1p(-p), tail = missing === 0 ? Math.exp(logTerm) : 0;
  for (let k = 1; k <= n; k++) {
    logTerm += Math.log(n-k+1)-Math.log(k)+Math.log(p)-Math.log1p(-p);
    if (k >= missing) tail += Math.exp(logTerm);
  }
  return Math.min(1,tail);
}
const scalarFields = {
  kills: "kills", deaths: "deaths", gpm: "gold_per_min", towers: "towers_killed",
  courier: "courier_kills", firstBlood: "firstblood_claimed", stuns: "stuns",
  wards: "obs_placed", stacks: "camps_stacked", runes: "rune_pickups"
};
const count = (v) => Number.isSafeInteger(v) && v >= 0;
export const digest = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
export async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
export async function optionalJson(path) {
  try { return await readJson(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, path);
}

export function replayErrors(replay, match) {
  const errors = [];
  const players = replay?.match?.players;
  if (replay?.match?.matchId !== match.match_id) errors.push("replay match identity mismatch");
  if (!Array.isArray(players) || players.length !== 10) return [...errors, "replay requires ten players"];
  const ids = players.map((p) => p.accountId);
  if (ids.some((id) => !count(id) || id === 0) || new Set(ids).size !== 10) errors.push("replay player identities invalid");
  const raw = new Map((match.players ?? []).map((p) => [p.account_id, p]));
  for (const p of players) {
    const other = raw.get(p.accountId);
    if (!other || (p.playerSlot != null && p.playerSlot !== other.player_slot)
      || (p.heroId != null && p.heroId !== other.hero_id)) errors.push(`replay identity mismatch: ${p.accountId}`);
    for (const [stat, field] of Object.entries(REPLAY_FIELDS)) {
      const v = p.stats?.[field];
      if (stat === "teamfight" ? !(Number.isFinite(v) && v >= 0 && v <= 1) : !count(v)) {
        errors.push(`replay ${p.accountId}: invalid or missing ${field}`);
      }
    }
  }
  return errors;
}

export function exactMatch(match, replay = null) {
  const errors = [];
  const players = match.players ?? [];
  if (!count(match.match_id) || !match.match_id) errors.push("invalid match id");
  if (!count(match.leagueid) || !match.leagueid) errors.push("invalid league id");
  if (!count(match.start_time) || !match.start_time || !count(match.duration) || !match.duration) errors.push("invalid match time/duration");
  if (players.length !== 10) errors.push("expected ten players");
  const ids = players.map((p) => p.account_id);
  if (ids.some((id) => !count(id) || id === 0) || new Set(ids).size !== 10) errors.push("duplicate/missing player identities");
  const slots = players.map((p) => p.player_slot);
  if (new Set(slots).size !== 10 || slots.some((s) => ![0,1,2,3,4,128,129,130,131,132].includes(s))) errors.push("invalid player slots");
  const radiant = match.radiant_team_id ?? match.radiant_team?.team_id;
  const dire = match.dire_team_id ?? match.dire_team?.team_id;
  if (!count(radiant) || !radiant || !count(dire) || !dire || radiant === dire) errors.push("missing/invalid teams");
  if (typeof match.radiant_win !== "boolean") errors.push("missing match result");
  const parsed = players.length === 10 && players.every((p) => Number.isFinite(p.teamfight_participation));
  if (!parsed) errors.push("OpenDota parse incomplete");
  const overlayErrors = replay ? replayErrors(replay, match) : ["no replay overlay"];
  // No partial identity joins: one malformed overlay invalidates that source.
  // Missing fields remain auditable individually when identities are correct.
  const identityOK = replay && !overlayErrors.some((e) => /identit|ten players/.test(e));
  const byId = new Map(identityOK ? replay.match.players.map((p) => [p.accountId, p.stats]) : []);
  const rows = players.map((p) => {
    const stats = Object.fromEntries(RAW_STATS.map((s) => [s, null]));
    const provenance = {};
    const invalid = [];
    const put = (stat, v, source) => {
      if (!Number.isFinite(v) || (v < 0 && stat !== "stuns") || (stat !== "stuns" && stat !== "teamfight" && !count(v))
        || (stat === "teamfight" && v > 1) || (stat === "firstBlood" && v > 1)) {
        if (v != null) invalid.push(stat);
        return;
      }
      stats[stat] = v; provenance[stat] = source;
    };
    for (const [s, f] of Object.entries(scalarFields)) put(s, p[f], `opendota:${f}`);
    put("creeps", count(p.last_hits) && count(p.denies) ? p.last_hits + p.denies : null, "opendota:last_hits+denies");
    // Sparse dictionary absence means zero ONLY inside an observed parsed
    // dictionary. A missing dictionary is missing evidence, never zero.
    for (const [s, dict, key] of [["roshan", "killed", "npc_dota_roshan"], ["smokes", "item_uses", "smoke_of_deceit"]]) {
      if (parsed && p[dict] && typeof p[dict] === "object" && !Array.isArray(p[dict])) {
        put(s, Object.hasOwn(p[dict], key) ? p[dict][key] : 0, `opendota:${dict}.${key}`);
      }
    }
    for (const [s, f] of Object.entries(REPLAY_FIELDS)) put(s, byId.get(p.account_id)?.[f], `replay:${f}`);
    const missing = RAW_STATS.filter((s) => stats[s] === null);
    return {
      accountId: p.account_id, playerSlot: p.player_slot, heroId: p.hero_id,
      teamId: p.player_slot < 128 ? radiant : dire,
      // Lane position is explicitly uncertain, not a verified fantasy role.
      laneRole: p.lane_role ?? null, roleSource: "opendota-lane-heuristic",
      stats, provenance, missing, invalid, complete: missing.length === 0
    };
  });
  return {
    schemaVersion: EXACT_SCHEMA, matchId: match.match_id, leagueId: match.leagueid,
    startTime: match.start_time, endTime: match.start_time + match.duration,
    duration: match.duration, patch: match.patch ?? null,
    seriesId: sourceSeriesId(match), seriesType: match.series_type,
    radiant, dire, radiantWin: match.radiant_win, parsed,
    replayPresent: Boolean(replay), replayErrors: overlayErrors,
    exact: errors.length === 0 && overlayErrors.length === 0 && rows.length === 10 && rows.every((r) => r.complete),
    errors, players: rows, sourceHash: digest({ match, replay: replay?.match ?? null })
  };
}

// Include raw files omitted by min-games filtering in generated summaries.
// The acquired league manifest is the denominator where available.
export async function auditLeague(leagueId, { root = ROOT, cutoff = Infinity, stage = "all" } = {}) {
  const began = performance.now();
  const league = await readJson(join(root, "data/generated", `league-${leagueId}.json`));
  const manifest = await optionalJson(join(root, "data/cache/leagues", `${leagueId}.json`));
  const rawDir = join(root, "data/cache/matches");
  const rawById = new Map();
  const corrupt = [];
  for (const file of await readdir(rawDir)) {
    if (!/^\d+\.json$/.test(file)) continue;
    try {
      const m = await readJson(join(rawDir, file));
      if (m.leagueid === Number(leagueId)) rawById.set(Number(file.slice(0, -5)), m);
    } catch { corrupt.push(file); }
  }
  const listed = manifest?.matches?.map((m) => m.match_id) ?? league.matchIds
    ?? [...new Set(league.players.flatMap((p) => p.sampleMatches ?? []))];
  const allIds = [...new Set([...listed, ...rawById.keys()])].sort((a,b) => a-b);
  const records = [], excluded = [];
  const boundary = league.stages?.boundary;
  for (const id of allIds) {
    const raw = rawById.get(id);
    if (!raw) { excluded.push({ matchId: id, reasons: ["raw match missing"] }); continue; }
    if (raw.start_time >= cutoff) continue;
    if (stage !== "all" && !boundary) throw new Error(`${leagueId}: no verified stage boundary available`);
    const matchStage = boundary && raw.start_time >= boundary ? "playoffs" : "groupStage";
    if (stage !== "all" && stage !== matchStage) continue;
    let replay;
    try { replay = await optionalJson(join(root, "data/cache/replay-fantasy/matches", `${id}.json`)); }
    catch { replay = null; }
    const fact = exactMatch(raw, replay);
    if (fact.matchId !== id) fact.errors.push("raw filename/match id mismatch");
    if (!(fact.endTime < cutoff)) fact.errors.push("match had not finished before lock");
    fact.exact &&= fact.errors.length === 0;
    fact.stage = matchStage;
    records.push(fact);
    if (!fact.exact) excluded.push({ matchId: id, reasons: [...fact.errors, ...fact.replayErrors, ...new Set(fact.players.flatMap((p) => p.missing))] });
  }
  const denominatorKnown = Boolean(manifest || league.matchIds);
  const expected = cutoff === Infinity && stage === "all"
    ? Math.max(league.matchesTotal ?? 0, allIds.length) : records.length + excluded.filter((e) => !rawById.has(e.matchId)).length;
  const exact = records.filter((m) => m.exact);
  const rows = records.flatMap((m) => m.players);
  const fields = Object.fromEntries(RAW_STATS.map((stat) => {
    const known = rows.filter((p) => p.stats[stat] !== null);
    return [stat, { observed: known.length, missing: expected * 10 - known.length,
      zero: known.filter((p) => p.stats[stat] === 0).length,
      sources: [...new Set(known.map((p) => p.provenance[stat]))] }];
  }));
  const strata = (keyOf) => {
    const groups = {};
    for (const m of records) for (const key of keyOf(m)) {
      groups[key] ??= { matches: 0, exact: 0 };
      groups[key].matches++; groups[key].exact += Number(m.exact);
    }
    return groups;
  };
  const byTeam = strata((m) => [m.radiant, m.dire]);
  const byStage = strata((m) => [m.stage]);
  const byPatch = strata((m) => [m.patch ?? "unknown"]);
  const byWeek = strata((m) => [Math.floor(m.startTime / (86400 * 7))]);
  const distributions = {};
  for (const m of records) for (const p of m.players) for (const stat of RAW_STATS) {
    const value = p.stats[stat]; if (value === null) continue;
    const week = String(Math.floor(m.startTime/(86400*7)));
    distributions[week] ??= {};
    const bucket = distributions[week][stat] ??= { n:0, mean:0, m2:0, zeros:0 };
    bucket.n++; const delta=value-bucket.mean;bucket.mean+=delta/bucket.n;bucket.m2+=delta*(value-bucket.mean);
    bucket.zeros+=Number(value===0);
  }
  const discontinuities = [];
  const weeks = Object.keys(distributions).sort((a,b)=>Number(a)-Number(b));
  for (let i=1;i<weeks.length;i++) for (const stat of RAW_STATS) {
    const a=distributions[weeks[i-1]][stat],b=distributions[weeks[i]][stat];
    if (!a || !b || Math.min(a.n,b.n)<100) continue;
    const se=Math.sqrt(a.m2/(a.n-1)/a.n+b.m2/(b.n-1)/b.n);
    if (Math.abs(b.mean-a.mean)>6*se && (Math.max(a.mean,b.mean)>2*Math.min(a.mean,b.mean))) {
      discontinuities.push({stat,fromWeek:weeks[i-1],toWeek:weeks[i],before:a.mean,after:b.mean,
        explanation:"Unreviewed change; may reflect roster/patch composition, not necessarily a counter error"});
    }
  }
  const series = new Map();
  for (const m of records) {
    const key = String(m.seriesId);
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(m);
  }
  const malformedSeries = [];
  for (const [id, maps] of series) {
    if (new Set(maps.map((m) => [m.radiant,m.dire].sort().join(":"))).size > 1 || maps.length > 5) malformedSeries.push(id);
  }
  const coverage = expected ? exact.length / expected : 0;
  const reasons = [];
  if (coverage < MIN_COVERAGE) reasons.push(`exact match coverage ${(coverage * 100).toFixed(1)}% < 90%`);
  if (!denominatorKnown) reasons.push("expected-match manifest not captured; refresh league metadata to establish denominator");
  if (malformedSeries.length) reasons.push("malformed series");
  if (listed.length !== new Set(listed).size) reasons.push("duplicate matches in manifest");
  const strataGroups = { team: byTeam, stage: byStage, patch: byPatch, week: byWeek };
  const comparisons = Object.values(strataGroups).reduce((sum,g) => sum+Object.keys(g).length,0);
  const missingnessWarnings = [];
  for (const [kind, groups] of Object.entries(strataGroups)) {
    for (const [key, n] of Object.entries(groups)) if (n.matches >= 10 && n.exact / n.matches < MIN_COVERAGE) {
      const p = missingnessTail(n.matches,n.matches-n.exact);
      missingnessWarnings.push({ kind, key, ...n, binomialTail: p });
      if (p < 0.01/Math.max(1,comparisons)) reasons.push(`${kind} ${key}: excess missingness (${n.exact}/${n.matches}; multiplicity-adjusted test)`);
    }
  }
  const report = {
    schemaVersion: EXACT_SCHEMA, leagueId: Number(leagueId), league: league.leagueName, stage,
    cutoff: Number.isFinite(cutoff) ? cutoff : null, expectedMatches: expected,
    denominatorSource: manifest ? "acquired API manifest" : league.matchIds ? "generated manifest" : "legacy count plus raw cache (unverified)",
    retrievedMatches: records.length, parsedMatches: records.filter((m) => m.parsed).length,
    exactUsableMatches: exact.length, excludedMatches: expected - exact.length,
    playerGames: rows.length, completePlayerGames: rows.filter((r) => r.complete).length,
    retainedPlayerGames: exact.length * 10, coverage,
    replayCoverage: records.filter((m) => m.replayPresent).length,
    legacyReplayCacheIsNotExact: true,
    duplicateMatches: listed.length - new Set(listed).size,
    duplicatePlayers: records.filter((m) => m.errors.includes("duplicate/missing player identities")).map((m) => m.matchId),
    impossibleValues: records.flatMap((m) => m.players.filter((p) => p.invalid.length).map((p) => ({ matchId: m.matchId, accountId: p.accountId, fields: p.invalid }))),
    missingnessWarnings,
    malformedSeries, corruptCacheFiles: corrupt, fields, byTeam, byStage, byPatch, byWeek,
    teams: league.teams.map((t) => ({ id: t.id, name: t.name, roster: t.roster ?? null })),
    rosterRoleUncertainty: league.players.map((p) => ({ accountId: p.accountId, teamId: p.teamId, role: p.role, source: "post-event lane inference; requires pre-lock roster confirmation" })),
    timestamps: { first: records.length ? Math.min(...records.map((m) => m.startTime)) : null, lastEnd: records.length ? Math.max(...records.map((m) => m.endTime)) : null },
    suspiciousZeros: RAW_STATS.filter((s) => fields[s].observed > 0 && fields[s].zero === fields[s].observed),
    distributionsByWeek: distributions, discontinuities,
    distributionReview: "Unadjusted week shifts are diagnostic; roster/patch mix can explain them. They do not establish a source bug or justify a correction.",
    gate: { pass: reasons.length === 0, threshold: MIN_COVERAGE, reasons }, excluded,
    elapsedSeconds: (performance.now() - began) / 1000
  };
  return { report, records };
}
