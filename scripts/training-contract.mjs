import { RAW_STATS } from "./extract.mjs";

export function validatePreparation(config) {
  const errors = [];
  if (!Number.isSafeInteger(config.targetLeagueId) || config.targetLeagueId <= 0) errors.push("targetLeagueId must be a positive integer");
  if (!["groupStage", "playoffs"].includes(config.stage)) errors.push("stage must be groupStage or playoffs");
  if (!(Number.isSafeInteger(config.cutoff) && config.cutoff > 0)) errors.push("explicit pre-lock cutoff (Unix seconds) required");
  if (!(Number.isSafeInteger(config.rosterKnownAt) && config.rosterKnownAt > 0 && config.rosterKnownAt <= config.cutoff)) errors.push("rosterKnownAt must be at or before lock");
  if (!config.rosterSource?.trim()) errors.push("rosterSource evidence required");
  if (!Array.isArray(config.sourceLeagueIds) || !config.sourceLeagueIds.length || new Set(config.sourceLeagueIds).size !== config.sourceLeagueIds.length
    || config.sourceLeagueIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) errors.push("distinct sourceLeagueIds required");
  if (config.stage === "groupStage" && config.sourceLeagueIds?.includes(config.targetLeagueId)) errors.push("Group training cannot include target TI");
  if (!Array.isArray(config.roster) || !config.roster.length) errors.push("pre-lock roster required");
  const seen = new Set(), teams = new Map();
  for (const p of config.roster ?? []) {
    if (!Number.isSafeInteger(p.accountId) || p.accountId <= 0 || seen.has(p.accountId)) errors.push(`invalid or duplicate roster account ${p.accountId}`);
    seen.add(p.accountId);
    if (!p.name || !p.teamName || !Number.isSafeInteger(p.teamId) || p.teamId <= 0) errors.push(`missing roster identity ${p.accountId}`);
    if (!["core", "mid", "support"].includes(p.role)) errors.push(`unknown role ${p.accountId}`);
    const squad = teams.get(p.teamId) ?? []; squad.push(p); teams.set(p.teamId, squad);
  }
  for (const [id, squad] of teams) {
    if (squad.length !== 5 || squad.filter((p) => p.role === "core").length !== 2
      || squad.filter((p) => p.role === "mid").length !== 1 || squad.filter((p) => p.role === "support").length !== 2) errors.push(`team ${id} must have a confirmed 2/1/2 roster`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}

export function buildExactTraining(config, records) {
  validatePreparation(config);
  const matches = new Set();
  for (const m of records) {
    if (!m.exact || m.players.length !== 10 || !(m.endTime < config.cutoff)) throw new Error(`Incomplete or post-lock match ${m.matchId}`);
    if (!config.sourceLeagueIds.includes(m.leagueId)) throw new Error(`Unselected source ${m.leagueId}`);
    if (m.leagueId === config.targetLeagueId && (config.stage !== "playoffs" || m.stage !== "groupStage")) throw new Error("Target-stage leakage");
    if (matches.has(m.matchId)) throw new Error(`Duplicate match ${m.matchId}`);
    matches.add(m.matchId);
    for (const p of m.players) if (RAW_STATS.some((s) => !Number.isFinite(p.stats[s]))) throw new Error(`Incomplete vector ${m.matchId}/${p.accountId}`);
  }
  const players = config.roster.map((p) => ({ ...p, samples: [], sampleMatches: [], sampleTimes: [], sampleEndTimes: [],
    sampleSeries: [], sampleHeroes: [], sampleLeagues: [], sampleTeams: [], sampleLaneRoles: [], samplePatches: [], sourceLeagues: [], wins: 0 }));
  const byId = new Map(players.map((p) => [p.accountId, p]));
  // Preserve each original row and its identity exactly once; weight at model
  // fitting/resampling time, never by manufacturing match ids or repeated rows.
  for (const m of [...records].sort((a,b) => a.startTime-b.startTime || a.matchId-b.matchId)) for (const row of m.players) {
    const p = byId.get(row.accountId); if (!p) continue;
    p.samples.push(RAW_STATS.map((s) => row.stats[s])); p.sampleMatches.push(m.matchId);
    p.sampleTimes.push(m.startTime); p.sampleEndTimes.push(m.endTime);
    // Match ids and series ids are not multiplied: separate league context is retained.
    p.sampleSeries.push(m.seriesId); p.sampleHeroes.push(row.heroId); p.sampleLeagues.push(m.leagueId);
    p.sampleTeams.push(row.teamId); p.sampleLaneRoles.push(row.laneRole); p.samplePatches.push(m.patch);
    p.wins += Number((row.teamId === m.radiant) === m.radiantWin);
  }
  for (const p of players) {
    p.games = p.samples.length; p.winRate = p.games ? p.wins/p.games : 0;
    p.perGame = Object.fromEntries(RAW_STATS.map((s,i) => [s,p.games ? p.samples.reduce((sum,r) => sum+r[i],0)/p.games : null]));
    p.sourceLeagues = [...new Set(p.sampleLeagues)]; delete p.wins;
  }
  const inadequate = players.filter((p) => p.games < 20);
  if (inadequate.length) throw new Error(`Insufficient exact history (minimum 20 maps/player): ${inadequate.map((p) => `${p.name}: ${p.games}`).join(", ")}`);
  return { schemaVersion: 1, dataPolicy: "complete-exact", targetLeagueId: config.targetLeagueId,
    targetLeagueName: config.targetLeagueName ?? String(config.targetLeagueId), stage: config.stage,
    cutoff: config.cutoff, rosterKnownAt: config.rosterKnownAt, rosterSource: config.rosterSource,
    statOrder: [...RAW_STATS], unavailableStats: [], players,
    coverage: { atTarget: players.length, withHistory: players.length, missing: [] } };
}
