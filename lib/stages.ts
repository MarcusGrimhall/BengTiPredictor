// The two fantasy periods.
//
// TI scores two separate fantasy cards. The group stage card runs over the
// group stage matches only, with three emblems and 40 reroll tokens. The
// playoff card starts fresh over the playoff matches, with five emblems and 30
// new tokens. Group stage points do not carry into the playoff card.
//
// Everything downstream has to respect that split, because the two stages
// differ in every input that matters:
//
//              teams   maps played        who scores
//   groups      16     ~13.5 per team     everyone
//   playoffs     8     4 to 16 per team   only the eight who advanced
//
// Using one stage's numbers for the other is not a rounding error. At TI 2026
// Team Spirit played 14 group maps and 15 playoff maps, while Iron Wing played
// 16 and 5. A projection built on the wrong stage ranks the wrong players.

export type Stage = "groupStage" | "playoffs";

export const STAGES: Stage[] = ["groupStage", "playoffs"];

export const STAGE_LABELS: Record<Stage, string> = {
  groupStage: "Group stage",
  playoffs: "Playoffs"
};

/** Emblems on the card. The playoff card keeps the first three and adds two. */
export const STAGE_SLOTS: Record<Stage, number> = { groupStage: 3, playoffs: 5 };

/** Reroll tokens granted at the start of each stage. Unused tokens expire. */
export const STAGE_TOKENS: Record<Stage, number> = { groupStage: 40, playoffs: 30 };

/** Teams that come out of the group stage and into the bracket. */
export const PLAYOFF_TEAMS = 8;

/**
 * Group stage shape, measured from TI 2025 and TI 2026 - identical in both.
 * 16 teams, 44 Bo3 series, each team playing four to six of them depending on
 * how the standings fall. Used to project a group stage that has not happened
 * yet; a finished one uses the maps that were actually played.
 */
export const GROUP_STAGE_SHAPE = {
  teams: 16,
  series: 44,
  bestOf: 3,
  /** Mean series per team: 2 x 44 / 16. */
  seriesPerTeam: 5.5,
  /** Observed maps per team, for sanity-checking a projection. */
  observedMapsPerTeam: { min: 10, mean: 13.5, max: 17 }
} as const;
