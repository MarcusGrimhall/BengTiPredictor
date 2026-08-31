// What every team actually produced on every stat.
//
// The emblem tables tell you what a stat pays. They do not tell you how much of
// it a given duo produces, or how far apart the field is on it. A stat where
// the best duo doubles the average is worth chasing; one where everyone lands
// within 10% of each other is a slot you can fill with whatever is cheapest.
//
// So this measures, per stat, what each entry banked from that stat alone -
// one emblem, tier III, no traits - averaged per match. Same scoring path as
// the rest of the app, so the numbers are directly comparable to a banner
// total.

import { Emblem, PlayerEntry, matchScores } from "./fantasy";
import { Role, StatKey } from "./scoring";

/**
 * One entry, named once per role rather than once per stat.
 *
 * Name, team, series count and the strong-team flag are properties of the
 * ENTRY, not of the stat being plotted - they are identical across all sixteen
 * rows. Repeating them inline cost 2.1 MB of the Information page's 5.2 MB
 * payload, so they live here and the points index into it.
 */
export type SpreadEntry = {
  /** Entry name, already resolved to pro names. */
  name: string;
  team: string;
  /** How many series this entry played. Same for every stat. */
  series: number;
  /** True for the four teams that went deepest - the "good teams" marker. */
  strong: boolean;
};

export type StatPoint = {
  /** Index into the role's `entries` array. */
  entry: number;
  /** Mean per-series points from this stat alone, at base rate. */
  value: number;
  /** Their single best series. */
  best: number;
};

/** Keeps a payload sane when a window pools many tournaments. */
export const MAX_POINTS = 40;

export type StatSpread = {
  stat: StatKey;
  /** The strongest entries, capped. `total` says how many there were. */
  points: StatPoint[];
  total: number;
  /**
   * Two different "highest" figures, and conflating them is easy:
   *
   *   bestAverage  the best entry's mean across their series
   *   bestSeries   the single biggest series anybody produced
   *
   * The second is always the larger and is what somebody actually saw on a
   * scoreboard; the first is what you would expect from picking that entry.
   */
  highest: number;
  highestName: string;
  bestSeries: number;
  bestSeriesName: string;
  /** Mean across the field. */
  average: number;
  /** Best entry among the four deepest teams. */
  strongBest: number;
  strongBestName: string;
  /** Mean across the four deepest teams only. */
  strongAverage: number;
};

/** One decimal is past anything the chart renders; the rest is payload. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A role's spread: the entries once, then one row per stat indexing into them. */
export type RoleSpread = { entries: SpreadEntry[]; rows: StatSpread[] };

/**
 * Per-stat spread for one role.
 *
 * `strongTeams` is the set treated as the good teams. It is chosen by rating
 * rather than by result, so the comparison answers "do stronger teams produce
 * more of this" rather than the circular "did the teams that did well do
 * well". Where the ratings are not trustworthy for an event, the caller falls
 * back to final placement and says so.
 */
export function statSpread(
  entries: PlayerEntry[],
  role: Role,
  stats: StatKey[],
  strongTeams: Set<string>
): RoleSpread {
  const pool = entries.filter((e) => e.role === role);
  if (!pool.length) return { entries: [], rows: [] };

  // Series count comes from the same matchScores path the points do, so it is
  // taken from the first stat rather than assumed - every stat yields the same
  // number of series for an entry.
  const probe: Emblem[] = [{ stat: stats[0], tier: "I", trait: "none" }];
  const roster: SpreadEntry[] = pool.map((entry) => ({
    name: entry.name,
    team: entry.teamName,
    series: matchScores(entry, probe).length,
    strong: strongTeams.has(entry.teamName)
  }));

  const rows = stats.map((stat) => {
    // Tier I is the lowest the type allows; its +10% is divided back out below
    // so what is reported is the raw stat value with no emblem bonus at all.
    const emblem: Emblem[] = [{ stat, tier: "I", trait: "none" }];
    const tierI = 1.1;
    const points: StatPoint[] = pool.map((entry, i) => {
      const scores = matchScores(entry, emblem).map((v) => v / tierI);
      const value = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return {
        entry: i,
        value: r1(value),
        best: r1(scores.length ? Math.max(...scores) : 0)
      };
    }).sort((a, b) => b.value - a.value);

    // A window can pool a dozen tournaments; the tail of that is not worth
    // shipping, and the chart is about the shape of the top of the field.
    const kept = points.slice(0, MAX_POINTS);
    const values = points.map((p) => p.value);
    const strong = points.filter((p) => roster[p.entry].strong);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    const byBest = [...points].sort((a, b) => b.best - a.best);

    return {
      stat,
      points: kept,
      total: points.length,
      highest: r1(values[0] ?? 0),
      highestName: points[0] ? roster[points[0].entry].name : "",
      bestSeries: r1(byBest[0]?.best ?? 0),
      bestSeriesName: byBest[0] ? roster[byBest[0].entry].name : "",
      average: r1(mean(values)),
      strongBest: r1(strong[0]?.value ?? 0),
      strongBestName: strong[0] ? roster[strong[0].entry].name : "",
      strongAverage: r1(mean(strong.map((p) => p.value)))
    };
  });

  return { entries: roster, rows };
}
