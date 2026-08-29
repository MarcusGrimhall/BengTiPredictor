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
  seriesPerTeam = GROUP_STAGE_SHAPE.seriesPerTeam
): Record<string, number> {
  return Object.fromEntries(teams.filter((t) => t.name).map((t) => [t.name, seriesPerTeam]));
}

/**
 * Expected maps per team over the group stage, from Elo alone. Shown for
 * context only - the fantasy projection counts series.
 */
export function projectGroupStage(
  teams: TeamEntry[],
  seriesPerTeam = GROUP_STAGE_SHAPE.seriesPerTeam
): Record<string, number> {
  const rated = teams.filter((t) => t.name);
  const maps: Record<string, number> = {};

  for (const team of rated) {
    const others = rated.filter((t) => t.name !== team.name);
    if (!others.length) continue;
    const perSeries =
      others.reduce(
        (sum, other) =>
          sum + expectedBo3Maps(
            mapWinProbability(team.elo ?? DEFAULT_ELO, other.elo ?? DEFAULT_ELO)
          ),
        0
      ) / others.length;
    maps[team.name] = Number((perSeries * seriesPerTeam).toFixed(2));
  }
  return maps;
}
