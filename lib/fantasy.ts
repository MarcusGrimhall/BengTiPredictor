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
  /** Tier's share of the bonus, in percent. */
  tierBonus: number;
  /** Traits' share, in percent. Negative next to a Vampiric. */
  traitBonus: number;
  /** 1 + tier + traits, all added together. */
  multiplier: number;
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
/**
 * Trait bonuses, as percentages that ADD to the tier bonus.
 *
 * Everything on an emblem stacks additively onto one multiplier. A tier V is
 * +150% and a Unique is +30%, so together they are +180% - a x2.80 multiplier,
 * not x2.50 x 1.30 = x3.25.
 *
 * That matters for more than the size of the numbers. Multiplying makes a big
 * bonus on an already-big emblem compound, which pushed the optimiser towards
 * stacking everything on one slot. Adding does not, so spreading a Benevolent
 * onto a high-earning neighbour competes much better than it used to.
 */
export function traitBonuses(emblems: Emblem[]): number[] {
  const bonus = emblems.map(() => 0);
  const allTiersDifferent = new Set(emblems.map((e) => e.tier)).size === emblems.length;
  const uniqueCount = emblems.filter((e) => e.trait === "unique").length;
  const friendlyCount = emblems.filter((e) => e.trait === "friendly").length;

  emblems.forEach((emblem, index) => {
    if (emblem.trait === "fractal" && allTiersDifferent) bonus[index] += 0.6;
    if (emblem.trait === "unique" && uniqueCount === 1) bonus[index] += 0.3;
    if (emblem.trait === "friendly" && friendlyCount >= 3) bonus[index] += 0.5;

    if (emblem.trait === "benevolent") {
      emblems.forEach((_, target) => {
        if (isAdjacent(index, target)) bonus[target] += 0.2;
      });
    }

    if (emblem.trait === "vampiric") {
      bonus[index] += 0.5;
      emblems.forEach((_, target) => {
        if (isAdjacent(index, target)) bonus[target] -= 0.1;
      });
    }
  });

  return bonus;
}

/**
 * The full multiplier on each emblem: 1 + tier bonus + trait bonuses.
 *
 * Never below zero - a stack of Vampiric penalties cannot turn an emblem into
 * a negative contribution.
 */
export function emblemMultipliers(emblems: Emblem[]): number[] {
  const traits = traitBonuses(emblems);
  return emblems.map((e, i) => Math.max(0, 1 + TIER_BONUSES[e.tier] / 100 + traits[i]));
}

export function contributions(player: PlayerEntry, emblems: Emblem[]): Contribution[] {
  const traits = traitBonuses(emblems);
  const multipliers = emblemMultipliers(emblems);
  return emblems.map((emblem, index) => {
    const rawPerGame = player.perGame[emblem.stat] ?? 0;
    const basePoints = statToPoints(emblem.stat, rawPerGame);
    return {
      emblem,
      rawPerGame,
      basePoints,
      /** Tier's share of the bonus, as a percentage. */
      tierBonus: TIER_BONUSES[emblem.tier],
      /** Traits' share, which can be negative next to a Vampiric. */
      traitBonus: traits[index] * 100,
      /** 1 + tier + traits, all added. */
      multiplier: multipliers[index],
      points: basePoints * multipliers[index]
    };
  });
}

export function scorePlayer(player: PlayerEntry, emblems: Emblem[]): number {
  return contributions(player, emblems).reduce((sum, c) => sum + c.points, 0);
}

/**
 * The same breakdown, but per **series** - the unit everything else in `Ranked`
 * is quoted in.
 *
 * `contributions` describes one average game. A series pays the sum of its two
 * best games, so its numbers are a little over half the size, and putting the
 * two side by side is what made the emblem bars on the calculator add up to
 * 42% of the headline instead of 100%.
 *
 * The two counted games are chosen by the series total, exactly as
 * `matchScores` chooses them, and then each emblem's share of those two games
 * is added up. So these sum to the mean of `matchScores` by construction, and
 * a stat that happens to spike in the games that decide a series is credited
 * for it rather than averaged away.
 *
 * Falls back to the per-game breakdown when the entry has no games at all.
 */
export function seriesContributions(player: PlayerEntry, emblems: Emblem[]): Contribution[] {
  const perGame = contributions(player, emblems);
  const lines = player.gameLines ?? [];
  if (!lines.length) return perGame;

  const multipliers = emblemMultipliers(emblems);
  // Per game: what each emblem paid, and what raw stat it was paid on.
  const games = lines.map((line) => {
    const raw = emblems.map((e) => line[e.stat] ?? 0);
    const points = emblems.map((e, i) => statToPoints(e.stat, raw[i]) * multipliers[i]);
    return { raw, points, total: points.reduce((a, b) => a + b, 0) };
  });

  const series = player.gameSeries;
  const buckets = new Map<number, typeof games>();
  games.forEach((game, i) => {
    // No series information means every game is its own series, which is what
    // matchScores degrades to as well.
    const key = series?.length === games.length ? series[i] : -i - 1;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(game);
    else buckets.set(key, [game]);
  });

  const rawTotals = emblems.map(() => 0);
  const pointTotals = emblems.map(() => 0);
  for (const bucket of buckets.values()) {
    const counted = [...bucket].sort((a, b) => b.total - a.total).slice(0, 2);
    for (const game of counted) {
      emblems.forEach((_, i) => {
        rawTotals[i] += game.raw[i];
        pointTotals[i] += game.points[i];
      });
    }
  }

  const n = buckets.size;
  return emblems.map((emblem, i) => ({
    ...perGame[i],
    // Raw units and base points counted in an average series, not in a game.
    rawPerGame: rawTotals[i] / n,
    basePoints: multipliers[i] === 0 ? 0 : pointTotals[i] / n / multipliers[i],
    points: pointTotals[i] / n
  }));
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
  const multipliers = emblemMultipliers(emblems);
  return (player.gameLines ?? []).map((line) =>
    emblems.reduce((sum, emblem, index) => {
      const base = statToPoints(emblem.stat, line[emblem.stat] ?? 0);
      return sum + base * multipliers[index];
    }, 0)
  );
}

/**
 * Scores every series the player played, ascending.
 *
 * This is the unit fantasy actually pays out on. A series scores as the **sum of
 * its two highest games** - in a Bo3 you take the best two and add them, and the
 * third game only matters if it displaces one of the first two. A series of one
 * game scores that game alone.
 *
 * Note the two different combinations, which are easy to conflate:
 *   - the two players in a Core or Support slot are AVERAGED;
 *   - the two counted games of a series are SUMMED.
 *
 * Summing the games is why the projection counts series rather than maps. A
 * third game adds nothing unless it beats one of the first two, so paying a
 * team for playing one would be wrong.
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
    totals.push(games.slice(0, 2).reduce((sum, x) => sum + x, 0));
  }
  return totals.sort((a, b) => a - b);
}

/** Kept for callers that want the raw per-map distribution. */
export function scoreDistribution(player: PlayerEntry, emblems: Emblem[]): number[] {
  return gameScores(player, emblems).sort((a, b) => a - b);
}

/**
 * What a role banks over a whole period.
 *
 * Only the **single best series** counts. Playing four series does not bank
 * four series' worth - it gives you four attempts at one number, and the
 * highest of them is your score. That makes depth worth far less than a
 * per-series total would suggest: a team playing six series instead of three
 * does not double anything, it gets three more draws at the same distribution.
 *
 * With `chances`, this returns the expected best of that many draws from the
 * player's own series scores, which is what a projection needs. Without it, the
 * best series they actually had.
 */
export function periodScore(
  player: PlayerEntry,
  emblems: Emblem[],
  chances?: number
): number {
  const series = matchScores(player, emblems);
  if (!series.length) return 0;
  if (chances === undefined) return series[series.length - 1];
  return expectedBestOf(series, chances);
}

/**
 * Expected maximum of `n` draws from a sorted sample.
 *
 * P(max <= x) = P(one draw <= x)^n, so for the i-th of m sorted values the
 * chance it is the maximum is (i/m)^n - ((i-1)/m)^n. Exact for the sample,
 * and it is the same order-statistics idea the reroll planner uses.
 */
export function expectedBestOf(sortedAscending: number[], n: number): number {
  const m = sortedAscending.length;
  if (!m) return 0;
  if (n <= 1) return sortedAscending.reduce((a, b) => a + b, 0) / m;
  let total = 0;
  for (let i = 1; i <= m; i += 1) {
    const weight = (i / m) ** n - ((i - 1) / m) ** n;
    total += weight * sortedAscending[i - 1];
  }
  return total;
}

/** Percentile of the best-of-n distribution, for the risk slider. */
export function periodPercentile(
  player: PlayerEntry,
  emblems: Emblem[],
  chances: number,
  p: number
): number {
  const series = matchScores(player, emblems);
  if (!series.length) return 0;
  const m = series.length;
  // Invert P(max <= x) = (rank/m)^n.
  const target = Math.pow(p / 100, 1 / Math.max(1, chances));
  return percentile(series, target * 100);
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
  /** Score at the selected risk percentile - the period score, not per series. */
  score: number;
  /** Expected best series, the neutral estimate. */
  mean: number;
  median: number;
  floor: number;    // 10th percentile
  ceiling: number;  // 95th percentile
  /** Series the team plays - attempts at a high one, not a multiplier. */
  series: number;
  /** What the entry banks over the period. Equals `score`. */
  total: number;
  /** Per-emblem breakdown of an average series - see `seriesContributions`. */
  contributions: Contribution[];
};

/**
 * Ranks the entries that can actually be picked for a role.
 *
 * A period pays out the entry's **best single series**, so there is no
 * multiplier here. `seriesByTeam` says how many attempts the team gets at a
 * high one, and more attempts help - but as the expected maximum of more draws,
 * which grows slowly, not as a sum.
 *
 * `strengthByTeam` optionally scales a team's scoring for the quality of the
 * field it is entering. Measured rather than assumed, and small - see
 * lib/strength.ts.
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
      const series = Math.max(1, seriesByTeam[player.teamName] ?? dist.length ?? 1);

      // The period pays the best series, so every figure is a percentile of the
      // best-of-`series` distribution rather than of one series.
      const at = (q: number) =>
        dist.length ? percentile(dist, Math.pow(q / 100, 1 / series) * 100) : 0;
      const score = dist.length ? at(p) : scorePlayer(player, emblems) * strength;

      return {
        player,
        score,
        mean: expectedBestOf(dist, series),
        median: at(50),
        floor: at(10),
        ceiling: at(95),
        series,
        total: score,
        // Per series and scaled by strength, so the breakdown is in the same
        // unit as every other number on this row.
        contributions: seriesContributions(player, emblems).map((c) =>
          strength === 1 ? c : { ...c, basePoints: c.basePoints * strength, points: c.points * strength }
        )
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
    // average of both members, so both heroes are kept and the rate is
    // computed over the pair's games.
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
 * Finds the best banner for a role.
 *
 * Two things make this harder than a per-slot sweep, and both bit an earlier
 * version of it:
 *
 *   Friendly is worth exactly nothing on its own. It pays +50%, but only when
 *   three of them share a banner, so hill-climbing one slot at a time never
 *   takes the first step - every single change scores zero. It has to be tried
 *   as a set. On a group stage core banner that miss cost 57%.
 *
 *   Fractal needs every tier on the banner to differ, so it is not a property
 *   of its own slot either. It only becomes worth anything alongside a
 *   particular arrangement of tiers.
 *
 * So the sweep runs the single-slot moves to convergence and then tries the
 * combinations explicitly.
 *
 * `freeTiers` decides which question is being asked. With it, tiers may be
 * raised and the answer is the banner to aim for. Without it, the tiers on the
 * board are kept and only moved between slots, which answers "given what I
 * hold, where should it go".
 */
export function optimizeEmblems(
  players: PlayerEntry[],
  role: Role,
  slotOptions: StatKey[][],
  current: Emblem[],
  risk = 50,
  seriesByTeam: Record<string, number> = {},
  { freeTiers = false }: { freeTiers?: boolean } = {}
): Emblem[] {
  const top = (emblems: Emblem[]) =>
    rankPlayers(players, role, emblems, risk, seriesByTeam)[0]?.total ?? 0;

  let best = [...current];
  let bestScore = top(best);

  const tryIt = (candidate: Emblem[]) => {
    const score = top(candidate);
    if (score > bestScore + 1e-6) {
      best = candidate;
      bestScore = score;
      return true;
    }
    return false;
  };

  let improved = true;
  let guard = 0;

  while (improved && guard < 20) {
    improved = false;
    guard += 1;

    // Stats, one slot at a time. A stat already on the banner is not legal.
    for (let slot = 0; slot < best.length; slot += 1) {
      for (const stat of availableStats(best, slot, slotOptions)) {
        if (stat === best[slot].stat) continue;
        const candidate = [...best];
        candidate[slot] = { ...candidate[slot], stat };
        if (tryIt(candidate)) improved = true;
      }
    }

    // Traits, one slot at a time. A trait's value depends on where it sits.
    for (let slot = 0; slot < best.length; slot += 1) {
      for (const trait of TRAITS) {
        if (trait === best[slot].trait) continue;
        const candidate = [...best];
        candidate[slot] = { ...candidate[slot], trait };
        if (tryIt(candidate)) improved = true;
      }
    }

    // Tiers: raised when the question allows it, otherwise only redistributed.
    if (freeTiers) {
      for (let slot = 0; slot < best.length; slot += 1) {
        for (const tier of TIERS) {
          if (tier === best[slot].tier) continue;
          const candidate = [...best];
          candidate[slot] = { ...candidate[slot], tier };
          if (tryIt(candidate)) improved = true;
        }
      }
    } else {
      for (let a = 0; a < best.length; a += 1) {
        for (let b = a + 1; b < best.length; b += 1) {
          if (best[a].tier === best[b].tier) continue;
          const candidate = [...best];
          candidate[a] = { ...candidate[a], tier: best[b].tier };
          candidate[b] = { ...candidate[b], tier: best[a].tier };
          if (tryIt(candidate)) improved = true;
        }
      }
    }

    // Swapping two stats moves both at once, which a per-slot sweep cannot do.
    for (let a = 0; a < best.length; a += 1) {
      for (let b = a + 1; b < best.length; b += 1) {
        if (!slotOptions[a].includes(best[b].stat)) continue;
        if (!slotOptions[b].includes(best[a].stat)) continue;
        const candidate = [...best];
        candidate[a] = { ...candidate[a], stat: best[b].stat };
        candidate[b] = { ...candidate[b], stat: best[a].stat };
        if (tryIt(candidate)) improved = true;
      }
    }

    // --- combinations, which no single-slot move can reach ---

    // Friendly on every subset of three or more. Each one alone is worth zero.
    for (const subset of subsetsOfAtLeast(best.length, 3)) {
      const candidate = best.map((e, i) =>
        subset.includes(i) ? { ...e, trait: "friendly" as Trait } : e
      );
      if (tryIt(candidate)) improved = true;
    }

    // Two traits at once. Since the bonuses add rather than compound, swapping
    // one slot from Friendly to Benevolent trades its own +50% for +20% on each
    // neighbour - a gain only if the neighbours earn enough, and a move that a
    // one-slot sweep can refuse on the way to a better banner.
    for (let a = 0; a < best.length; a += 1) {
      for (let b = a + 1; b < best.length; b += 1) {
        for (const ta of TRAITS) {
          for (const tb of TRAITS) {
            if (ta === best[a].trait && tb === best[b].trait) continue;
            const candidate = [...best];
            candidate[a] = { ...candidate[a], trait: ta };
            candidate[b] = { ...candidate[b], trait: tb };
            if (tryIt(candidate)) improved = true;
          }
        }
      }
    }

    // Fractal wants every tier different, which is only reachable with free
    // tiers - otherwise the tiers you hold decide whether it can ever pay.
    if (freeTiers && best.length <= TIERS.length) {
      for (let slot = 0; slot < best.length; slot += 1) {
        const candidate = best.map((e, i) => ({
          ...e,
          tier: TIERS[TIERS.length - best.length + i],
          trait: i === slot ? ("fractal" as Trait) : e.trait
        }));
        if (tryIt(candidate)) improved = true;
      }
    }
  }

  return best;
}

/** Index subsets of `n` slots with at least `min` members. */
function subsetsOfAtLeast(n: number, min: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << n; mask += 1) {
    const members: number[] = [];
    for (let i = 0; i < n; i += 1) if (mask & (1 << i)) members.push(i);
    if (members.length >= min) out.push(members);
  }
  return out;
}

