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
 * Fallback group stage shape: 16 teams playing about five and a half Bo3 series
 * each, which is what TI 2025 and TI 2026 both ran.
 *
 * It is only a fallback. The format is not stable across events - measured
 * series per team across five Internationals:
 *
 *   TI 2022   20 teams   9.3      TI 2025   16 teams   5.5
 *   TI 2023   20 teams   5.0      TI 2026   16 teams   5.5
 *   TI 2024   16 teams   5.9
 *
 * TI 2022 ran nearly twice the group stage of TI 2023. So anything projecting a
 * group stage should read the shape off the event it is projecting, and use
 * this only when there is nothing to read.
 */
export const GROUP_STAGE_SHAPE = {
  teams: 16,
  bestOf: 3,
  seriesPerTeam: 5.5
} as const;
