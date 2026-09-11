import rules from "./current-rules.json";
// The fantasy scoring model: raw stats -> fantasy points.
//
// POINT_VALUES is points per unit from Valve's official TI 2026 Compendium
// fantasy scale. Values are configured in current-rules.json; source semantics
// and new counter algorithms still require evidence and code.

export type StatKey =
  | "kills" | "deaths" | "creeps" | "gpm" | "towers" | "roshan" | "tormentor"
  | "courier" | "firstBlood" | "teamfight" | "stuns" | "wards" | "stacks"
  | "runes" | "smokes" | "madstones" | "lotuses" | "watchers";

export type EmblemColor = "red" | "blue" | "green";
export type Role = "core" | "mid" | "support";

export const POINT_VALUES = rules.points as Record<StatKey, { per: number; base?: number }>;

export const STAT_COLORS = rules.statColors as Record<StatKey, EmblemColor>;

export const STAT_LABELS: Record<StatKey, string> = {
  kills: "Kills", deaths: "Deaths", creeps: "Creep score", gpm: "GPM",
  towers: "Towers", roshan: "Roshan kills", tormentor: "Tormentor kills",
  courier: "Courier kills", firstBlood: "First Blood",
  teamfight: "Teamfight participation", stuns: "Stun duration",
  wards: "Observer wards", stacks: "Camps stacked", runes: "Runes",
  smokes: "Smokes used", madstones: "Madstones collected",
  lotuses: "Lotuses grabbed", watchers: "Watchers taken"
};

/**
 * What each number actually counts, as opposed to what it is called.
 *
 * Written after checking every field against OpenDota and STRATZ on the same
 * matches. Several of these read the opposite way round to the obvious guess -
 * wards are placed rather than bought, stacks are camps rather than creeps,
 * smokes are used rather than purchased - and each of those is a mistake this
 * project made at some point. See ASSUMPTIONS.md.
 */
export const STAT_DEFINITIONS: Record<StatKey, string> = {
  kills:
    "Hero kills the player took themselves. Assists are not counted here at all.",
  deaths:
    `Starts at ${POINT_VALUES.deaths.base} and changes by ${POINT_VALUES.deaths.per} per death, floored at ${rules.deathsFloor}. Scored per game, then averaged.`,
  creeps:
    `Last hits and denies together, ${POINT_VALUES.creeps.per} points per last hit or deny.`,
  gpm:
    "Gold per minute, already averaged over the match. The only stat that is a rate rather than a count, so a long game does not inflate it.",
  towers:
    "Whoever lands the last hit on the tower takes all of it. Towers that fall to creeps are credited to nobody.",
  roshan:
    "The killing blow on Roshan, not the team that took it.",
  tormentor:
    "Participation credit from the game's m_iTormentorKills replay counter. Older descriptive datasets may contain a last-hit proxy; that proxy is rejected by primary training.",
  courier:
    "Couriers killed. Couriers that die to creeps or towers count for no one.",
  firstBlood:
    `Once a game, to whoever took the kill rather than the assist. It pays ${POINT_VALUES.firstBlood.per} points.`,
  teamfight:
    "The game's end-of-match m_flTeamFightParticipation counter. The primary model requires this replay value; an API reconstruction is not treated as exact.",
  stuns:
    "Seconds of stun applied, summed per hero hit — a three-hero, two-second stun counts as six. That favours wide AoE stuns over single-target ones.",
  wards:
    "Observer wards actually placed, not bought. Sentries are not counted.",
  stacks:
    "Neutral camps stacked — camps, not the creeps inside them.",
  runes:
    "Runes taken, including ones put straight into a bottle. Wisdom runes are the exception and are not counted.",
  smokes:
    "Smokes used, whoever paid for them. A smoke bought and never used is worth nothing.",
  madstones:
    "The game's end-of-match Madstone fantasy counter. Primary training requires the replay counter; older descriptive datasets may contain a bundle-based estimate.",
  lotuses:
    "Lotuses taken by the player, from the game's m_iLotusesTaken replay counter.",
  watchers:
    "Watchers captured by the player, from the game's m_iWatchersTaken replay counter."
};

export const STAT_KEYS = Object.keys(POINT_VALUES) as StatKey[];

// Current rule catalogue has no structurally unsupported scoring columns.
// Dataset-specific missing observations are gated by scripts/exact-data.mjs.
export const UNAVAILABLE_STATS: string[] = [];

// The colour of each banner slot, following the TI 2026 layout: five
// emblems per banner, colour decides which stats may be placed there.
export const BANNER_SLOTS = rules.bannerSlots as Record<Role, EmblemColor[]>;

/**
 * Converts a per-game raw value into fantasy points for that stat.
 *
 * Never below zero. Only Deaths can go negative on the raw scale - it starts at
 * 1950 and subtracts 195 a death, so it crosses zero at exactly ten deaths, and
 * about one player-game in eleven is above that. No emblem pays a penalty: the
 * floor is zero, the same way emblemMultipliers refuses to go negative.
 */
export function statToPoints(stat: StatKey, rawPerGame: number): number {
  const { per, base = 0 } = POINT_VALUES[stat];
  return Math.max(stat === "deaths" ? rules.deathsFloor : 0, base + per * rawPerGame);
}

/**
 * The raw value that would score `points` - the inverse of `statToPoints`.
 *
 * Needed because a pair is scored by averaging its two players' SCORES, while
 * an entry carries raw stat lines. For the fifteen linear stats the two are the
 * same thing and this returns the plain average. Deaths are the exception: they
 * are floored at zero, so averaging two scores and averaging two death counts
 * are different numbers, and this is what keeps the pair on the first of those.
 *
 * Only meaningful for a target the scale can actually produce, which is
 * guaranteed here: the average of two non-negative scores is non-negative.
 */
export function pointsToStat(stat: StatKey, points: number): number {
  const { per, base = 0 } = POINT_VALUES[stat];
  return (points - base) / per;
}

export function statsForColor(color: EmblemColor): StatKey[] {
  return STAT_KEYS.filter((key) => STAT_COLORS[key] === color);
}
