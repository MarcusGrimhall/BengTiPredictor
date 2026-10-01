import { emblemMultipliers, type Emblem } from "./fantasy";
import { STAT_KEYS, statToPoints, type Role, type StatKey } from "./scoring";
import { optimizeJointEntry, type FantasyObjective, type ScenarioCandidate } from "./jointFantasy";
import { planOffers } from "./offers";
import type { RerollAction } from "./reroll";

export type TitleRule = { bonus: number; condition: string; evidence: "verified" | "assumed" | "unknown" };
export type SeasonRules = { version: string; prefix: Record<string, TitleRule>; suffix: Record<string, TitleRule> };
export type FantasyRosterPlayer = { accountId: number; teamId: number; role: Role };
export type FantasyMap = {
  seriesId: number;
  teamIds: [number, number];
  players: { accountId: number; teamId: number; stats: Record<StatKey, number>; titleTriggers?: Record<string, boolean | null> }[];
};
export type FantasyFuture = { maps: FantasyMap[] };
export type FantasyState = {
  roster: FantasyRosterPlayer[];
  banners: Record<Role, Emblem[]>;
  prefix?: string;
  suffix?: string;
  titleRules: SeasonRules;
  unknownTitleProbabilities?: Record<string, number>;
};

export function validateFuture(future: FantasyFuture): void {
  if (!future.maps.length) throw new Error("Future has no maps");
  const seriesTeams = new Map<number, string>();
  for (const map of future.maps) {
    if (!Number.isSafeInteger(map.seriesId) || map.teamIds.length !== 2 || map.teamIds[0] === map.teamIds[1]
      || map.players.length !== 10 || new Set(map.players.map(p => p.accountId)).size !== 10)
      throw new Error(`Invalid future map in series ${map.seriesId}`);
    const pair = [...map.teamIds].sort((a,b) => a-b).join(":");
    const previous = seriesTeams.get(map.seriesId);
    if (previous && previous !== pair) throw new Error(`Series ${map.seriesId} changes teams`);
    seriesTeams.set(map.seriesId, pair);
    for (const teamId of map.teamIds) if (map.players.filter(p => p.teamId === teamId).length !== 5)
      throw new Error(`Future map lacks five players for team ${teamId}`);
    for (const row of map.players) for (const stat of STAT_KEYS) {
      const value = row.stats[stat];
      if (!Number.isFinite(value) || (value < 0 && stat !== "stuns") || (stat === "teamfight" && value > 1))
        throw new Error(`Invalid future ${stat} for ${row.accountId}`);
    }
  }
}

function titleFactor(state: FantasyState, triggers: Record<string, boolean | null> | undefined) {
  let bonus = 0;
  for (const [kind, key] of [["prefix", state.prefix], ["suffix", state.suffix]] as const) {
    if (!key) continue;
    const rule = state.titleRules[kind][key];
    if (!rule || !Number.isFinite(rule.bonus) || rule.bonus < 0) throw new Error(`Unknown ${kind} rule ${key}`);
    const observed = triggers?.[`${kind}:${key}`];
    const probability = observed === true ? 1 : observed === false ? 0 : state.unknownTitleProbabilities?.[`${kind}:${key}`];
    if (!(probability !== undefined && probability >= 0 && probability <= 1))
      throw new Error(`Unresolved title condition ${kind}:${key}`);
    bonus += rule.bonus * probability;
  }
  return 1 + bonus / 100;
}

/** Apply the actual player → pair → top-two maps → best-series chain. */
function scoreRole(state: FantasyState, future: FantasyFuture, role: Role, ids: number[]): number {
  const multipliers = emblemMultipliers(state.banners[role]);
  const teamId = state.roster.find(p => p.accountId === ids[0])?.teamId;
  const series = new Map<number, number[]>();
  for (const map of future.maps) {
    if (!teamId || !map.teamIds.includes(teamId)) continue;
    const rows = ids.map(id => map.players.find(p => p.accountId === id));
    if (rows.some(row => !row || row.teamId !== teamId)) throw new Error(`Missing or misplaced selected player in series ${map.seriesId}`);
    const score = rows.reduce((sum, row) => sum + state.banners[role].reduce((part, emblem, index) =>
      part + statToPoints(emblem.stat, row!.stats[emblem.stat]) * multipliers[index], 0)
      * titleFactor(state, row!.titleTriggers), 0) / ids.length;
    if (!Number.isFinite(score)) throw new Error(`Nonfinite fantasy map score in series ${map.seriesId}`);
    const games = series.get(map.seriesId) ?? [];
    games.push(score); series.set(map.seriesId, games);
  }
  const scores = [...series.values()].map(games => games.sort((a,b) => b-a).slice(0,2).reduce((a,b) => a+b,0));
  return scores.length ? Math.max(...scores) : 0;
}

export function scoreFuture(state: FantasyState, future: FantasyFuture, selection: Record<Role, number[]>): number {
  validateFuture(future);
  const roster = new Map(state.roster.map(p => [p.accountId, p]));
  const chosen = Object.entries(selection) as [Role, number[]][];
  if (chosen.length !== 3 || new Set(chosen.flatMap(([, ids]) => ids)).size !== 5)
    throw new Error("A complete entry needs five distinct players");
  for (const [role, ids] of chosen) {
    if (ids.length !== (role === "mid" ? 1 : 2) || ids.some(id => roster.get(id)?.role !== role)
      || (role !== "mid" && roster.get(ids[0])?.teamId !== roster.get(ids[1])?.teamId))
      throw new Error(`Invalid ${role} selection`);
  }
  return chosen.reduce((total, [role, ids]) => total + scoreRole(state, future, role, ids), 0);
}

/** All legal same-team role candidates receive scores on identical futures. */
export function candidateFutures(state: FantasyState, futures: FantasyFuture[]): ScenarioCandidate[] {
  if (!futures.length) throw new Error("At least one common future required");
  futures.forEach(validateFuture);
  const candidates: ScenarioCandidate[] = [];
  for (const role of ["core", "mid", "support"] as Role[]) {
    const players = state.roster.filter(p => p.role === role);
    for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length + Number(role === "mid"); j++) {
      if (role !== "mid" && players[i].teamId !== players[j].teamId) continue;
      const ids = role === "mid" ? [players[i].accountId] : [players[i].accountId, players[j].accountId];
      const scores = Float64Array.from(futures, future => scoreRole(state, future, role, ids));
      candidates.push({ id: `${role}:${ids.join(":")}`, role, players: ids, scores });
      if (role === "mid") break;
    }
  }
  return candidates;
}

export function recommendRoster(state: FantasyState, futures: FantasyFuture[], objective: FantasyObjective) {
  if (objective !== "mean" && Object.keys(state.unknownTitleProbabilities ?? {}).length)
    throw new Error("Tail objectives require sampled title triggers in each future");
  return optimizeJointEntry(candidateFutures(state, futures), objective);
}

/** Additive mean terminal value for the existing shared-token offer planner.
 * The fixed entry stays fixed through crafting; use a new adapter after a
 * roster change. Tail objectives are deliberately excluded: CVaR is joint.
 */
export function fixedEntryMeanRoleValue(state: FantasyState, futures: FantasyFuture[], selection: Record<Role, number[]>) {
  if (!futures.length) throw new Error("At least one common future required");
  futures.forEach(validateFuture);
  scoreFuture(state, futures[0], selection); // Validate complete legal entry.
  const cache = new Map<string, number>();
  return (role: Role, banner: Emblem[]) => {
    const key = `${role}:${JSON.stringify(banner)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const changed = { ...state, banners: { ...state.banners, [role]: banner } };
    const value = futures.reduce((sum, future) => sum + scoreRole(changed, future, role, selection[role]), 0) / futures.length;
    cache.set(key, value);
    return value;
  };
}

/** Mean-objective advice for the user's current fixed roster, three offers and
 * shared token budget. Beyond two tokens the existing planner is approximate.
 */
export function adviseCurrentOffersMean(state: FantasyState, futures: FantasyFuture[], selection: Record<Role, number[]>,
  offers: RerollAction[], catalogue: RerollAction[], catalogues: Record<Role,RerollAction[]>, tokens: number,
  runs = 200, seed = "scenario-offers") {
  const value = fixedEntryMeanRoleValue(state, futures, selection);
  return planOffers(state.banners, offers, catalogue, catalogues, value, tokens, runs, seed);
}
