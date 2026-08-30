// Generic tournament bracket.
//
// The structure is generated rather than hardcoded, for any team count
// (4, 8, 16, 32) in single or double elimination, so the tool works for
// any tournament.

import { seededRandom } from "./rng";
import { DEFAULT_ELO, expectedMaps, mapWinProbability, seriesWinProbability } from "./elo";

export type Format = "single" | "double";
export type BracketSide = "upper" | "lower" | "final";

/** Where a match slot gets its team from. */
export type Slot =
  | { kind: "seed"; index: number }
  | { kind: "winner"; match: string }
  | { kind: "loser"; match: string };

export type MatchNode = {
  id: string;
  side: BracketSide;
  round: number;
  label: string;
  bestOf: number;
  slots: [Slot, Slot];
};

/** Team name -> OpenDota Elo rating. */
export type TeamRatings = Record<string, number>;

/** Series length per round. TI plays Bo3 throughout with a Bo5 grand final. */
export type SeriesFormat = { default: number; grandFinal: number };
export const TI_FORMAT: SeriesFormat = { default: 3, grandFinal: 5 };

const log2 = (n: number) => Math.round(Math.log2(n));

/**
 * Builds the match graph. Teams are filled in by seed index, so the same
 * structure works regardless of which teams the user picks.
 */
export function buildStructure(
  teamCount: number,
  format: Format,
  series: SeriesFormat = TI_FORMAT
): MatchNode[] {
  if (teamCount < 2 || (teamCount & (teamCount - 1)) !== 0) {
    throw new Error("Team count must be a power of two (4, 8, 16, 32).");
  }

  const n = log2(teamCount);
  const matches: MatchNode[] = [];
  const push = (m: MatchNode) => { matches.push(m); return m.id; };

  // --- Upper bracket ---
  const upperRounds: string[][] = [];
  for (let round = 1; round <= n; round += 1) {
    const count = teamCount / 2 ** round;
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const slots: [Slot, Slot] =
        round === 1
          ? [{ kind: "seed", index: i * 2 }, { kind: "seed", index: i * 2 + 1 }]
          : [
              { kind: "winner", match: upperRounds[round - 2][i * 2] },
              { kind: "winner", match: upperRounds[round - 2][i * 2 + 1] }
            ];
      const isUpperFinal = round === n && format === "double";
      const isSingleFinal = format === "single" && round === n;
      ids.push(push({
        id: `u${round}-${i}`,
        side: "upper",
        round,
        bestOf: isSingleFinal ? series.grandFinal : series.default,
        label: format === "single"
          ? singleLabel(round, n)
          : isUpperFinal ? "Upper Final" : `Upper Round ${round}`,
        slots
      }));
    }
    upperRounds.push(ids);
  }

  if (format === "single") return matches;

  // --- Lower bracket ---
  // Round 1: the losers from UB round 1 play each other.
  let lowerRound = 1;
  let feed: Slot[] = upperRounds[0].map((id) => ({ kind: "loser", match: id }));
  let ids: string[] = [];
  for (let i = 0; i < feed.length / 2; i += 1) {
    ids.push(push({
      id: `l${lowerRound}-${i}`,
      side: "lower",
      round: lowerRound,
      bestOf: series.default,
      label: `Lower Round ${lowerRound}`,
      slots: [feed[i * 2], feed[i * 2 + 1]]
    }));
  }
  let carried: Slot[] = ids.map((id) => ({ kind: "winner", match: id }));

  for (let round = 2; round <= n; round += 1) {
    // Minor: LB winners face the losers from this UB round.
    // The UB losers are reversed to avoid immediate rematches.
    const ubLosers: Slot[] = [...upperRounds[round - 1]]
      .reverse()
      .map((id) => ({ kind: "loser" as const, match: id }));

    lowerRound += 1;
    ids = carried.map((slot, i) =>
      push({
        id: `l${lowerRound}-${i}`,
        side: "lower",
        round: lowerRound,
        bestOf: series.default,
        label: round === n ? "Lower Final" : `Lower Round ${lowerRound}`,
        slots: [slot, ubLosers[i]]
      })
    );
    carried = ids.map((id) => ({ kind: "winner", match: id }));

    // Major: LB winners play each other, if more than one remains.
    if (carried.length > 1) {
      lowerRound += 1;
      ids = [];
      for (let i = 0; i < carried.length / 2; i += 1) {
        ids.push(push({
          id: `l${lowerRound}-${i}`,
          side: "lower",
          round: lowerRound,
          bestOf: series.default,
          label: `Lower Round ${lowerRound}`,
          slots: [carried[i * 2], carried[i * 2 + 1]]
        }));
      }
      carried = ids.map((id) => ({ kind: "winner", match: id }));
    }
  }

  // --- Grand final ---
  push({
    id: "gf",
    side: "final",
    round: n + 1,
    bestOf: series.grandFinal,
    label: "Grand Final",
    slots: [
      { kind: "winner", match: upperRounds[n - 1][0] },
      carried[0]
    ]
  });

  return matches;
}

function singleLabel(round: number, total: number): string {
  const fromEnd = total - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${round}`;
}

export type Selections = Record<string, string | undefined>;

/** Resolves which teams actually stand in each match, given the picks. */
export function resolveBracket(
  structure: MatchNode[],
  seeds: (string | null)[],
  selections: Selections
): Map<string, [string | null, string | null]> {
  const resolved = new Map<string, [string | null, string | null]>();

  const winnerOf = (id: string): string | null => {
    const teams = resolved.get(id);
    const pick = selections[id];
    return teams && pick && teams.includes(pick) ? pick : null;
  };
  const loserOf = (id: string): string | null => {
    const teams = resolved.get(id);
    const won = winnerOf(id);
    if (!teams || !won) return null;
    return teams.find((t) => t && t !== won) ?? null;
  };
  const resolveSlot = (slot: Slot): string | null => {
    if (slot.kind === "seed") return seeds[slot.index] ?? null;
    if (slot.kind === "winner") return winnerOf(slot.match);
    return loserOf(slot.match);
  };

  // structure is built in topological order, so one sweep is enough.
  for (const match of structure) {
    resolved.set(match.id, [resolveSlot(match.slots[0]), resolveSlot(match.slots[1])]);
  }
  return resolved;
}

/**
 * Chance team A wins this match. Derived from OpenDota's Elo ratings and the
 * series length - no hand-tuned parameters, no manual strength input.
 */
export function winProbability(
  ratings: TeamRatings,
  a: string,
  b: string,
  bestOf = 3
): number {
  const mapProb = mapWinProbability(ratings[a] ?? DEFAULT_ELO, ratings[b] ?? DEFAULT_ELO);
  return seriesWinProbability(mapProb, bestOf);
}

/** Expected maps played in this match, used for fantasy volume projections. */
export function matchExpectedMaps(
  ratings: TeamRatings,
  a: string,
  b: string,
  bestOf = 3
): number {
  return expectedMaps(mapWinProbability(ratings[a] ?? DEFAULT_ELO, ratings[b] ?? DEFAULT_ELO), bestOf);
}

export type TeamOutlook = {
  champion: number;
  finalist: number;
  /** Expected number of maps this team plays across the whole bracket. */
  maps: number;
  /** Expected number of series this team plays. */
  series: number;
  /**
   * Expected maps this team LOSES. The Underdog suffix pays on a loss, so a
   * favourite triggers it less often - the bonus is worth least to exactly the
   * team you most want to pick.
   */
  mapsLost: number;
  /**
   * Expected maps that are the last possible game of their series - a Bo3 that
   * reaches game 3, a Bo5 that reaches game 5. The Clutch suffix pays on these,
   * so it is worth most to teams in close series.
   */
  decidingMaps: number;
  /**
   * How often the team played exactly k series, as a probability per k.
   *
   * The mean alone is not enough to simulate a tournament total. Most of the
   * variance in what a player banks is how far their team goes - out in two
   * series or all the way to the grand final - and collapsing that to its
   * average throws the tail away. Anything sampling tournament outcomes should
   * draw from this.
   */
  seriesDistribution: number[];
};

/**
 * Valve's Compendium payout for bracket predictions, indexed by how many of the
 * 14 picks came in. The scale is on the total, not on which match was right, so
 * the marginal value of one more correct pick rises the further you get: the
 * first is worth 120, the fourteenth another 1,080.
 */
/**
 * Chance a team plays at least `k` series, from the simulated distribution.
 *
 * A fantasy entry only scores while its team is still in, so "will they play a
 * third series at all" is often a sharper question than "how many on average".
 * A team with a 4.4 series average that is 50% likely to be out after two is a
 * different bet from one that reliably plays four.
 */
export function atLeastSeries(distribution: number[], k: number): number {
  let total = 0;
  for (let i = k; i < distribution.length; i += 1) total += distribution[i] ?? 0;
  return total;
}

export const PREDICTION_POINTS = [
  0, 120, 360, 720, 1200, 1800, 2520, 3360, 4320, 5400, 6600, 7920, 9360, 10920, 12000
];

export type SimulationResult = {
  expectedCorrect: number;
  /** Expected Compendium points, given the picks made so far. */
  expectedPoints: number;
  /** Every run's winners, when the caller asked to keep them. */
  outcomes?: Selections[];
  teams: Record<string, TeamOutlook>;
  runs: number;
};

/**
 * Monte Carlo over the whole bracket. Seeded so identical picks always give
 * identical numbers - otherwise the result flickers on every re-render.
 *
 * Besides who wins, this tracks how many maps each team plays. That is what
 * the fantasy side needs: a player on a team that goes deep simply gets more
 * games to score in.
 */
/**
 * An ensemble of simulated brackets: for each run, who won each match.
 *
 * This is what lets the page stop simulating. The bracket outcome depends only
 * on the seeding and the ratings, never on which winners you picked - your
 * picks only decide which of those outcomes count as correct. So the ensemble
 * can be generated once, away from the browser, and any pick set scored against
 * it by counting. Scoring 20,000 stored outcomes is a loop over an array; the
 * simulation that produced them is not repeated.
 *
 * Stored as one string per run, one character per match, indexing into `teams`.
 */
export type BracketEnsemble = {
  teams: string[];
  matchIds: string[];
  /** One row per run; row[i] is the index into `teams` that won matchIds[i]. */
  runs: string[];
};

const CODE_START = 48; // '0'

export function buildEnsemble(
  structure: MatchNode[],
  seeds: (string | null)[],
  ratings: TeamRatings,
  runs = 20000
): BracketEnsemble | null {
  if (seeds.some((s) => !s)) return null;
  const teams = seeds.filter(Boolean) as string[];
  if (teams.length > 40) return null; // one char per team index
  const index = new Map(teams.map((t, i) => [t, i]));
  const matchIds = structure.map((m) => m.id);

  const sim = simulate(structure, seeds, {}, ratings, runs, true);
  if (!sim.outcomes) return null;

  return {
    teams,
    matchIds,
    runs: sim.outcomes.map((row) =>
      matchIds.map((id) => {
        const w = row[id];
        const i = w ? index.get(w) : undefined;
        return String.fromCharCode(CODE_START + (i ?? 0));
      }).join("")
    )
  };
}

/**
 * Scores a set of picks against a stored ensemble. No simulation.
 */
export function scoreAgainstEnsemble(
  ensemble: BracketEnsemble,
  selections: Selections
): { expectedCorrect: number; expectedPoints: number; runs: number } {
  const picked = ensemble.matchIds
    .map((id, i) => ({ i, team: selections[id] }))
    .filter((p) => p.team) as Array<{ i: number; team: string }>;

  if (!picked.length) return { expectedCorrect: 0, expectedPoints: 0, runs: ensemble.runs.length };

  const codes = picked.map((p) => ({
    i: p.i,
    code: String.fromCharCode(CODE_START + ensemble.teams.indexOf(p.team))
  }));

  let totalCorrect = 0;
  let totalPoints = 0;
  const kept: Selections[] = [];
  for (const row of ensemble.runs) {
    let correct = 0;
    for (const { i, code } of codes) if (row[i] === code) correct += 1;
    totalCorrect += correct;
    totalPoints += PREDICTION_POINTS[Math.min(correct, PREDICTION_POINTS.length - 1)] ?? 0;
  }
  const n = ensemble.runs.length;
  return { expectedCorrect: totalCorrect / n, expectedPoints: totalPoints / n, runs: n };
}

export function simulate(
  structure: MatchNode[],
  seeds: (string | null)[],
  selections: Selections,
  ratings: TeamRatings,
  runs = 20000,
  keepOutcomes = false
): SimulationResult {
  const picked = Object.entries(selections).filter(([, team]) => team);
  const random = seededRandom(
    `${seeds.join("|")}::${JSON.stringify(selections)}::${JSON.stringify(ratings)}::${runs}`
  );

  const tally: Record<string, TeamOutlook> = {};
  const slot = (team: string | null): TeamOutlook | null => {
    if (!team) return null;
    tally[team] ??= {
      champion: 0, finalist: 0, maps: 0, series: 0,
      mapsLost: 0, decidingMaps: 0, seriesDistribution: []
    };
    return tally[team];
  };
  for (const name of seeds) slot(name);

  let totalCorrect = 0;
  let totalPoints = 0;
  const kept: Selections[] = [];

  for (let run = 0; run < runs; run += 1) {
    const outcomes: Selections = {};
    const resolved = new Map<string, [string | null, string | null]>();
    // Series this team played in THIS run, so the spread survives averaging.
    const seriesThisRun = new Map<string, number>();

    const winnerOf = (id: string) => outcomes[id] ?? null;
    const loserOf = (id: string) => {
      const teams = resolved.get(id);
      const won = winnerOf(id);
      if (!teams || !won) return null;
      return teams.find((t) => t && t !== won) ?? null;
    };
    const resolveSlot = (s: Slot): string | null => {
      if (s.kind === "seed") return seeds[s.index] ?? null;
      if (s.kind === "winner") return winnerOf(s.match);
      return loserOf(s.match);
    };

    for (const match of structure) {
      const pair: [string | null, string | null] = [resolveSlot(match.slots[0]), resolveSlot(match.slots[1])];
      resolved.set(match.id, pair);
      const [a, b] = pair;

      if (a && b) {
        const mapProb = mapWinProbability(ratings[a] ?? DEFAULT_ELO, ratings[b] ?? DEFAULT_ELO);
        // Play the series map by map so the map count is a real draw, not an
        // average. Fantasy variance depends on actually playing 2 or 3 maps.
        const need = Math.ceil(match.bestOf / 2);
        let winsA = 0;
        let winsB = 0;
        while (winsA < need && winsB < need) {
          if (random() < mapProb) winsA += 1; else winsB += 1;
        }
        const played = winsA + winsB;
        outcomes[match.id] = winsA > winsB ? a : b;
        // A series that runs its full length ends on the last possible game.
        const deciding = played === match.bestOf ? 1 : 0;
        for (const [team, lost] of [[a, winsB], [b, winsA]] as const) {
          const entry = slot(team)!;
          entry.maps += played;
          entry.series += 1;
          entry.mapsLost += lost;
          entry.decidingMaps += deciding;
          seriesThisRun.set(team, (seriesThisRun.get(team) ?? 0) + 1);
        }
      } else {
        outcomes[match.id] = a ?? b ?? undefined;
      }
    }

    if (keepOutcomes) kept.push({ ...outcomes });

    for (const [team, count] of seriesThisRun) {
      const dist = tally[team].seriesDistribution;
      dist[count] = (dist[count] ?? 0) + 1;
    }

    let correctThisRun = 0;
    for (const [id, team] of picked) if (outcomes[id] === team) correctThisRun += 1;
    totalCorrect += correctThisRun;
    totalPoints += PREDICTION_POINTS[Math.min(correctThisRun, PREDICTION_POINTS.length - 1)] ?? 0;

    const final = structure[structure.length - 1];
    const champion = outcomes[final.id] ?? null;
    if (champion) slot(champion)!.champion += 1;
    const finalPair = resolved.get(final.id);
    const runnerUp = finalPair?.find((t) => t && t !== champion) ?? null;
    if (runnerUp) tally[runnerUp].finalist += 1;
  }

  for (const key of Object.keys(tally)) {
    tally[key].champion /= runs;
    tally[key].finalist /= runs;
    tally[key].maps /= runs;
    tally[key].series /= runs;
    tally[key].mapsLost /= runs;
    tally[key].decidingMaps /= runs;
    const dist = tally[key].seriesDistribution;
    for (let i = 0; i < dist.length; i += 1) dist[i] = (dist[i] ?? 0) / runs;
  }

  return {
    expectedCorrect: totalCorrect / runs,
    expectedPoints: totalPoints / runs,
    teams: tally,
    runs,
    ...(keepOutcomes ? { outcomes: kept } : {})
  };
}
