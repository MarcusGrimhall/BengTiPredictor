// The emblem, tier and trait engine.
//
// A banner holds five emblems. Each emblem points at a stat, has a tier
// (a percentage bonus) and may carry a trait affecting itself or its
// neighbours. The final score is the sum of all five contributions.

import { Role, StatKey, statToPoints } from "./scoring";

export type Tier = "I" | "II" | "III" | "IV" | "V";
export type Trait = "none" | "fractal" | "benevolent" | "vampiric" | "unique" | "friendly";

export const TIER_BONUSES: Record<Tier, number> = { I: 10, II: 30, III: 60, IV: 100, V: 150 };
export const TIERS = Object.keys(TIER_BONUSES) as Tier[];

export const TRAIT_DESCRIPTIONS: Record<Trait, string> = {
  none: "No trait",
  fractal: "+60% to this emblem if all five tiers are different",
  benevolent: "+20% to adjacent emblems",
  vampiric: "+50% to this emblem, -10% to adjacent emblems",
  unique: "+30% to this emblem if it is the only Unique on the banner",
  friendly: "+50% to this emblem if the banner has at least three Friendly"
};
export const TRAITS = Object.keys(TRAIT_DESCRIPTIONS) as Trait[];

export type Emblem = { stat: StatKey; tier: Tier; trait: Trait };

export type PlayerEntry = {
  id: string;
  name: string;
  teamName: string;
  role: Role;
  games: number;
  winRate: number;
  perGame: Record<StatKey, number>;
  /** Raw stat line for every individual game the player appeared in. */
  gameLines: Record<StatKey, number>[];
  /** Series each game belongs to, same order as gameLines. */
  gameSeries?: number[];
  /** Match id of each game, same order. Used to add up a pair game by game. */
  gameMatches?: number[];
  /** Hero played in each game, same order. Drives the Prefix trigger rates. */
  gameHeroes?: number[];
  /** Bitmask of the Suffix conditions that fired in each game, same order. */
  gameTitles?: number[];
  /** For a Core or Support pair, the two players it is made of. */
  members?: string[];
};

export type Contribution = {
  emblem: Emblem;
  rawPerGame: number;
  basePoints: number;
  tierFactor: number;
  traitFactor: number;
  points: number;
};

const isAdjacent = (a: number, b: number) => Math.abs(a - b) === 1;

/**
 * A banner can never show the same stat twice - the game only pays out for
 * distinct stats, so three Last Hits emblems is not a legal banner.
 */
export function hasDuplicateStats(emblems: Emblem[]): boolean {
  return new Set(emblems.map((e) => e.stat)).size !== emblems.length;
}

/** The stats still free for `slot`, given what the rest of the banner uses. */
export function availableStats(
  emblems: Emblem[],
  slot: number,
  slotOptions: StatKey[][]
): StatKey[] {
  const taken = new Set(emblems.filter((_, i) => i !== slot).map((e) => e.stat));
  return slotOptions[slot].filter((stat) => !taken.has(stat));
}

/**
 * Traits multiply on top of the tier bonus, and several traits on the same
 * banner can hit the same emblem. So every factor is computed for the whole
 * banner first, before any emblem is scored.
 */
export function traitFactors(emblems: Emblem[]): number[] {
  const factors = emblems.map(() => 1);
  const allTiersDifferent = new Set(emblems.map((e) => e.tier)).size === emblems.length;
  const uniqueCount = emblems.filter((e) => e.trait === "unique").length;
  const friendlyCount = emblems.filter((e) => e.trait === "friendly").length;

  emblems.forEach((emblem, index) => {
    if (emblem.trait === "fractal" && allTiersDifferent) factors[index] *= 1.6;
    if (emblem.trait === "unique" && uniqueCount === 1) factors[index] *= 1.3;
    if (emblem.trait === "friendly" && friendlyCount >= 3) factors[index] *= 1.5;

    if (emblem.trait === "benevolent") {
      emblems.forEach((_, target) => {
        if (isAdjacent(index, target)) factors[target] *= 1.2;
      });
    }

    if (emblem.trait === "vampiric") {
      factors[index] *= 1.5;
      emblems.forEach((_, target) => {
        if (isAdjacent(index, target)) factors[target] *= 0.9;
      });
    }
  });

  return factors;
}

export function contributions(player: PlayerEntry, emblems: Emblem[]): Contribution[] {
  const factors = traitFactors(emblems);
  return emblems.map((emblem, index) => {
    const rawPerGame = player.perGame[emblem.stat] ?? 0;
    const basePoints = statToPoints(emblem.stat, rawPerGame);
    const tierFactor = 1 + TIER_BONUSES[emblem.tier] / 100;
    const traitFactor = factors[index];
    return {
      emblem,
      rawPerGame,
      basePoints,
      tierFactor,
      traitFactor,
      points: basePoints * tierFactor * traitFactor
    };
  });
}

export function scorePlayer(player: PlayerEntry, emblems: Emblem[]): number {
  return contributions(player, emblems).reduce((sum, c) => sum + c.points, 0);
}

/**
 * Scores every individual game, unsorted and in the original order.
 *
 * Order matters here because the caller needs to group these back into series.
 * The correlation between stats within one game is preserved, which a
 * mean-and-stddev model would throw away - a big game tends to have high kills
 * AND high GPM at the same time.
 */
export function gameScores(player: PlayerEntry, emblems: Emblem[]): number[] {
  const factors = traitFactors(emblems);
  return (player.gameLines ?? []).map((line) =>
    emblems.reduce((sum, emblem, index) => {
      const base = statToPoints(emblem.stat, line[emblem.stat] ?? 0);
      return sum + base * (1 + TIER_BONUSES[emblem.tier] / 100) * factors[index];
    }, 0)
  );
}

/**
 * Scores every series the player played, ascending.
 *
 * This is the unit fantasy actually pays out on. A series scores as the
 * **average of its two highest games** - so in a Bo3 you take the best two and
 * average them, and the third game only matters if it displaces one of the
 * first two. A series of one game scores that game.
 *
 * That averaging is why the projection counts series rather than maps. Scoring
 * per map and multiplying by expected maps would reward a team for going the
 * distance, when going the distance is worth nothing on its own.
 *
 * Without series information every game is treated as its own series, which
 * degrades to per-map scoring.
 */
export function matchScores(player: PlayerEntry, emblems: Emblem[]): number[] {
  const scores = gameScores(player, emblems);
  const series = player.gameSeries;

  if (!series || series.length !== scores.length) {
    return [...scores].sort((a, b) => a - b);
  }

  const bySeries = new Map<number, number[]>();
  for (let i = 0; i < scores.length; i += 1) {
    const key = series[i];
    const bucket = bySeries.get(key);
    if (bucket) bucket.push(scores[i]);
    else bySeries.set(key, [scores[i]]);
  }

  const totals: number[] = [];
  for (const games of bySeries.values()) {
    games.sort((a, b) => b - a);
    const best = games.slice(0, 2);
    totals.push(best.reduce((sum, x) => sum + x, 0) / best.length);
  }
  return totals.sort((a, b) => a - b);
}

/** Kept for callers that want the raw per-map distribution. */
export function scoreDistribution(player: PlayerEntry, emblems: Emblem[]): number[] {
  return gameScores(player, emblems).sort((a, b) => a - b);
}

/** How many series the player's sample covers. */
export function seriesCount(player: PlayerEntry): number {
  const series = player.gameSeries;
  if (!series?.length) return player.gameLines?.length ?? 0;
  return new Set(series).size;
}

/** Linear-interpolated percentile from an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

/**
 * The risk slider maps to a percentile of the player's own game distribution.
 *
 *   risk 0   -> 10th percentile: the floor. Who is reliable on a bad day.
 *   risk 50  -> median: the typical game.
 *   risk 100 -> 95th percentile: the ceiling. Who can actually highroll.
 *
 * This is why the ranking changes as you drag: a consistent support wins at
 * low risk, a swingy carry wins at high risk.
 */
export function riskToPercentile(risk: number): number {
  return 10 + (Math.min(100, Math.max(0, risk)) / 100) * 85;
}

export type Ranked = {
  player: PlayerEntry;
  /** Score at the selected risk percentile, per match (two best games). */
  score: number;
  /** Mean per-match score, for reference. */
  mean: number;
  median: number;
  floor: number;    // 10th percentile
  ceiling: number;  // 95th percentile
  /** Expected series the team plays in this stage, 1 if unknown. */
  series: number;
  /** score x series: what the entry is projected to bank over the stage. */
  total: number;
  contributions: Contribution[];
};

/**
 * Ranks the entries that can actually be picked for a role.
 *
 * Values are **per match**, not per map, and the projection multiplies by
 * expected series. That is the unit fantasy pays on.
 *
 * `strengthByTeam` optionally scales a team's per-match score for the quality
 * of the field it is entering. Past numbers were earned against whoever the
 * player happened to draw; a stronger side facing the same field scores a
 * little more. The effect is measured rather than assumed and it is small -
 * see lib/strength.ts - so it moves the board less than who the player is.
 */
export function rankPlayers(
  players: PlayerEntry[],
  role: Role,
  emblems: Emblem[],
  risk = 50,
  seriesByTeam: Record<string, number> = {},
  strengthByTeam: Record<string, number> = {}
): Ranked[] {
  const p = riskToPercentile(risk);
  return players
    .filter((entry) => entry.role === role)
    .map((player) => {
      const raw = matchScores(player, emblems);
      const strength = strengthByTeam[player.teamName] ?? 1;
      const dist = strength === 1 ? raw : raw.map((x) => x * strength);
      const score = dist.length ? percentile(dist, p) : scorePlayer(player, emblems) * strength;
      const series = seriesByTeam[player.teamName] ?? 1;
      return {
        player,
        score,
        mean: dist.length ? dist.reduce((a, b) => a + b, 0) / dist.length : score,
        median: percentile(dist, 50),
        floor: percentile(dist, 10),
        ceiling: percentile(dist, 95),
        series,
        total: score * series,
        contributions: contributions(player, emblems)
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Turns individual players into the entries a banner can actually pick.
 *
 * A TI roster is one **Core pair**, one **Mid**, and one **Support pair**, and
 * both pairs must come from the same team. So Core and Support are ranked as
 * pairs whose stat lines are added together game by game; Mid is ranked as a
 * single player.
 *
 * Games are matched on match id, so a pair only scores the games both players
 * actually played. Where a team's role heuristic produced more than two
 * candidates across the event, the two with the most games are used.
 */
export function buildLineups(players: PlayerEntry[]): PlayerEntry[] {
  const out: PlayerEntry[] = [];
  const byTeam = new Map<string, PlayerEntry[]>();
  for (const p of players) {
    const bucket = byTeam.get(p.teamName);
    if (bucket) bucket.push(p);
    else byTeam.set(p.teamName, [p]);
  }

  for (const [teamName, squad] of byTeam) {
    for (const role of ["core", "support"] as Role[]) {
      const candidates = squad
        .filter((p) => p.role === role)
        .sort((a, b) => (b.gameLines?.length ?? 0) - (a.gameLines?.length ?? 0))
        .slice(0, 2);
      if (candidates.length === 2) out.push(pairUp(candidates[0], candidates[1], teamName, role));
    }
    out.push(...squad.filter((p) => p.role === "mid"));
  }
  return out;
}

/**
 * Combines two team-mates into one pickable entry, game by game.
 *
 * The pair's value is the **average** of the two players, not their sum. That
 * keeps a pair on the same scale as a Mid, so the three roles can be compared
 * and so a title multiplier means the same thing everywhere. It does not
 * reorder anything within a role - every pair is halved by the same factor.
 */
function pairUp(a: PlayerEntry, b: PlayerEntry, teamName: string, role: Role): PlayerEntry {
  // Match ids align the two players exactly. Without them - older generated
  // data - fall back to position: team-mates appear in the same matches in the
  // same order, so index alignment is correct as long as the lengths match.
  const haveIds = Boolean(a.gameMatches?.length && b.gameMatches?.length);
  const keys = haveIds ? a.gameMatches! : a.gameLines.map((_, i) => i);
  const indexOf = new Map<number, number>();
  (haveIds ? b.gameMatches! : b.gameLines.map((_, i) => i)).forEach((key, i) => indexOf.set(key, i));

  const gameLines: Record<StatKey, number>[] = [];
  const gameSeries: number[] = [];
  const gameMatches: number[] = [];
  const gameHeroes: number[] = [];
  const gameTitles: number[] = [];

  keys.forEach((matchId, i) => {
    const j = indexOf.get(matchId);
    if (j === undefined) return; // only one of the pair played this game
    const left = a.gameLines[i];
    const right = b.gameLines[j];
    const combined = {} as Record<StatKey, number>;
    for (const stat of Object.keys(left) as StatKey[]) {
      combined[stat] = ((left[stat] ?? 0) + (right[stat] ?? 0)) / 2;
    }
    gameLines.push(combined);
    gameSeries.push(a.gameSeries?.[i] ?? -matchId);
    gameMatches.push(matchId);
    // Hero is per player, so a pair has two. The Prefix rate for a pair is the
    // average of both members, which is what the reference project does; both
    // heroes are kept so the rate can be computed over the pair's games.
    if (a.gameHeroes?.[i] != null) gameHeroes.push(a.gameHeroes[i]);
    if (b.gameHeroes?.[j] != null) gameHeroes.push(b.gameHeroes[j]);
    // Suffix conditions are game-level and identical for team-mates.
    if (a.gameTitles?.[i] != null) gameTitles.push(a.gameTitles[i]);
  });

  const perGame = {} as Record<StatKey, number>;
  for (const stat of Object.keys(a.perGame) as StatKey[]) {
    perGame[stat] = ((a.perGame[stat] ?? 0) + (b.perGame[stat] ?? 0)) / 2;
  }

  return {
    id: `${a.id}+${b.id}`,
    name: `${a.name} & ${b.name}`,
    teamName,
    role,
    games: gameLines.length,
    winRate: (a.winRate + b.winRate) / 2,
    perGame,
    gameLines,
    gameSeries,
    gameMatches,
    gameHeroes: gameHeroes.length ? gameHeroes : undefined,
    gameTitles: gameTitles.length ? gameTitles : undefined,
    members: [a.name, b.name]
  };
}

/**
 * Finds the best emblem set for a given role and slot colouring. We try
 * every stat allowed in each slot and keep the combination that maximises
 * the top player's score.
 *
 * The search space is small (5 slots x ~5 stats per colour), so a greedy
 * sweep to convergence is enough - no need for full brute force.
 */
export function optimizeEmblems(
  players: PlayerEntry[],
  role: Role,
  slotOptions: StatKey[][],
  current: Emblem[],
  risk = 50,
  mapsByTeam: Record<string, number> = {}
): Emblem[] {
  const top = (emblems: Emblem[]) =>
    rankPlayers(players, role, emblems, risk, mapsByTeam)[0]?.total ?? 0;

  let best = [...current];
  let bestScore = top(best);
  let improved = true;
  let guard = 0;

  while (improved && guard < 20) {
    improved = false;
    guard += 1;

    // Try every legal stat in every slot. A stat already used elsewhere on the
    // banner is not legal, so those candidates are skipped.
    for (let slot = 0; slot < best.length; slot += 1) {
      for (const stat of availableStats(best, slot, slotOptions)) {
        if (stat === best[slot].stat) continue;
        const candidate = [...best];
        candidate[slot] = { ...candidate[slot], stat };
        const score = top(candidate);
        if (score > bestScore + 1e-6) {
          best = candidate;
          bestScore = score;
          improved = true;
        }
      }
    }

    // Swapping two slots keeps every stat legal but changes which tier and
    // trait each one sits on, and traits depend on position. A pure per-slot
    // sweep cannot reach these, so try them explicitly.
    for (let a = 0; a < best.length; a += 1) {
      for (let b = a + 1; b < best.length; b += 1) {
        if (!slotOptions[a].includes(best[b].stat)) continue;
        if (!slotOptions[b].includes(best[a].stat)) continue;
        const candidate = [...best];
        candidate[a] = { ...candidate[a], stat: best[b].stat };
        candidate[b] = { ...candidate[b], stat: best[a].stat };
        const score = top(candidate);
        if (score > bestScore + 1e-6) {
          best = candidate;
          bestScore = score;
          improved = true;
        }
      }
    }
  }

  return best;
}
