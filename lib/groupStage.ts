// Projecting how many maps a team plays in the group stage.
//
// The playoff bracket can be simulated properly - it is a fixed shape and every
// result feeds the next round. The group stage cannot, and it is worth being
// clear about why.
//
// Measured across TI 2025 and TI 2026 the group stage is 16 teams playing 44
// Bo3 series, four to six each depending on how the standings fall. Two things
// drive a team's map count:
//
//   1. How many series it plays (4, 5 or 6). Results-driven, and the dominant
//      term - it spans a factor of 1.5 on its own.
//   2. How long each series runs (2 or 3 maps). Elo can speak to this: evenly
//      matched sides go to a third map more often.
//
// Only the second is predictable from ratings, so this projection is much
// flatter than reality: it lands every team between about 12 and 14 maps where
// the truth ran 10 to 17. That is a real limitation, not a tuning problem.
//
// The saving grace is that it barely matters for ranking. In the group stage
// every team plays roughly the same number of maps, so the multiplier is nearly
// constant across players and the ranking is driven by per-game scoring. In the
// playoffs the spread is 4 to 16 maps and the multiplier decides everything -
// which is exactly where the bracket simulation takes over.

import { DEFAULT_ELO, mapWinProbability } from "./elo";
import { GROUP_STAGE_SHAPE } from "./stages";
import type { TeamEntry } from "./data";

/**
 * Series per team in this event's group stage, read off the event itself.
 *
 * The format is not stable across Internationals - TI 2022 ran 9.3 series per
 * team against TI 2023's 5.0 - so a hardcoded constant is wrong more often than
 * it is right. Falls back to the constant only when the event carries no stage
 * data at all, which is the case for one that has not been played.
 */
export function groupSeriesPerTeam(teams: TeamEntry[]): number {
  const played = teams
    .map((t) => t.stages?.groupStage?.series ?? 0)
    .filter((n) => n > 0);
  if (!played.length) return GROUP_STAGE_SHAPE.seriesPerTeam;
  return played.reduce((a, b) => a + b, 0) / played.length;
}

/** Maps per team in this event's group stage, read off the event itself. */
export function groupMapsPerTeam(teams: TeamEntry[]): number | null {
  const played = teams.map((t) => t.stages?.groupStage?.maps ?? 0).filter((n) => n > 0);
  if (!played.length) return null;
  return played.reduce((a, b) => a + b, 0) / played.length;
}

/**
 * Maps per series in this event's group stage.
 *
 * Not every International runs Bo3 groups. TI 2022 played 183 maps over 93
 * series - 1.97 each, so Bo2 - while TI 2026 played 2.48, which is Bo3 going to
 * a third game about half the time. Reading it off the event covers both
 * without needing to know which format was used.
 */
export function groupMapsPerSeries(teams: TeamEntry[]): number | null {
  let maps = 0;
  let series = 0;
  for (const t of teams) {
    maps += t.stages?.groupStage?.maps ?? 0;
    series += t.stages?.groupStage?.series ?? 0;
  }
  return series > 0 ? maps / series : null;
}

/** Expected maps in a best-of-3: always 2, plus a third when it is not a sweep. */
export function expectedBo3Maps(mapProb: number): number {
  return 2 + 2 * mapProb * (1 - mapProb);
}

/**
 * Expected **series** per team over the group stage.
 *
 * This is what a fantasy value is multiplied by, and it is the honest answer:
 * flat. How many series a team plays (four to six) falls out of the standings,
 * and no rating predicts that. Every team gets the field average.
 *
 * That is not a cop-out - it is the correct model given what is knowable, and
 * it means the group stage board is decided by per-match scoring rather than by
 * a volume estimate nobody can make.
 */
export function projectGroupStageSeries(
  teams: TeamEntry[],
  seriesPerTeam = groupSeriesPerTeam(teams)
): Record<string, number> {
  return Object.fromEntries(teams.filter((t) => t.name).map((t) => [t.name, seriesPerTeam]));
}

/**
 * Expected maps per team over the group stage, from Elo alone. Shown for
 * context only - the fantasy projection counts series.
 */
export function projectGroupStage(
  teams: TeamEntry[],
  seriesPerTeam = groupSeriesPerTeam(teams)
): Record<string, number> {
  const rated = teams.filter((t) => t.name);
  const maps: Record<string, number> = {};
  // If the event tells us its own series length, believe it over the Bo3
  // assumption - the format is not the same every year.
  const observed = groupMapsPerSeries(teams);

  for (const team of rated) {
    const others = rated.filter((t) => t.name !== team.name);
    if (!others.length) continue;
    const modelled =
      others.reduce(
        (sum, other) =>
          sum + expectedBo3Maps(
            mapWinProbability(team.elo ?? DEFAULT_ELO, other.elo ?? DEFAULT_ELO)
          ),
        0
      ) / others.length;
    // Keep the Elo shape - closer sides go longer - but scale it to the
    // length this event's series actually ran.
    const perSeries = observed === null ? modelled : modelled * (observed / 2.5);
    maps[team.name] = Number((perSeries * seriesPerTeam).toFixed(2));
  }
  return maps;
}
