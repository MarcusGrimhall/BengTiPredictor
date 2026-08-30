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

export type StatPoint = {
  /** Entry name, already resolved to pro names. */
  name: string;
  team: string;
  /** Mean per-match points from this stat alone. */
  value: number;
  /** True for the four teams that went deepest - the "good teams" marker. */
  strong: boolean;
};

export type StatSpread = {
  stat: StatKey;
  points: StatPoint[];
  /** Best single entry. */
  highest: number;
  highestName: string;
  /** Mean across the field. */
  average: number;
  /** Best entry among the four deepest teams. */
  strongBest: number;
  strongBestName: string;
  /** Mean across the four deepest teams only. */
  strongAverage: number;
};

/**
 * Per-stat spread for one role.
 *
 * `strongTeams` is the set treated as the good teams - the four that went
 * deepest. A result rather than a rating, because it is a fact about the event
 * and OpenDota's ratings are unreliable for older tournaments.
 */
export function statSpread(
  entries: PlayerEntry[],
  role: Role,
  stats: StatKey[],
  strongTeams: Set<string>
): StatSpread[] {
  const pool = entries.filter((e) => e.role === role);
  if (!pool.length) return [];

  return stats.map((stat) => {
    const emblem: Emblem[] = [{ stat, tier: "III", trait: "none" }];
    const points: StatPoint[] = pool.map((entry) => {
      const scores = matchScores(entry, emblem);
      const value = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { name: entry.name, team: entry.teamName, value, strong: strongTeams.has(entry.teamName) };
    }).sort((a, b) => b.value - a.value);

    const values = points.map((p) => p.value);
    const strong = points.filter((p) => p.strong);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    return {
      stat,
      points,
      highest: values[0] ?? 0,
      highestName: points[0]?.name ?? "",
      average: mean(values),
      strongBest: strong[0]?.value ?? 0,
      strongBestName: strong[0]?.name ?? "",
      strongAverage: mean(strong.map((p) => p.value))
    };
  });
}
