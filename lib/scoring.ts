// The fantasy scoring model: raw stats -> fantasy points.
//
// POINT_VALUES is points per unit from Valve's official TI 2026 Compendium
// fantasy scale. If the scale changes this is the only file you need to
// touch - data/generated/ stores raw values and never needs re-fetching.

export type StatKey =
  | "kills" | "deaths" | "creeps" | "gpm" | "towers" | "roshan" | "tormentor"
  | "courier" | "firstBlood" | "teamfight" | "stuns" | "wards" | "stacks"
  | "runes" | "smokes" | "madstones";

export type EmblemColor = "red" | "blue" | "green";
export type Role = "core" | "mid" | "support";

export const POINT_VALUES: Record<StatKey, { per: number; base?: number }> = {
  kills: { per: 107 },
  deaths: { per: -195, base: 1950 },   // starts at 1950, subtracted per death
  creeps: { per: 3 },
  gpm: { per: 2 },
  towers: { per: 352 },
  roshan: { per: 1172 },
  tormentor: { per: 879 },
  courier: { per: 703 },
  firstBlood: { per: 1934 },
  teamfight: { per: 2124 },
  stuns: { per: 10 },
  wards: { per: 117 },
  stacks: { per: 234 },
  runes: { per: 141 },
  smokes: { per: 293 },
  madstones: { per: 13 }
};

export const STAT_COLORS: Record<StatKey, EmblemColor> = {
  gpm: "red", deaths: "red", creeps: "red", kills: "red", towers: "red",
  madstones: "red",
  wards: "blue", stacks: "blue", runes: "blue", smokes: "blue",
  teamfight: "green", stuns: "green", tormentor: "green", roshan: "green",
  firstBlood: "green", courier: "green"
};

export const STAT_LABELS: Record<StatKey, string> = {
  kills: "Kills", deaths: "Deaths", creeps: "Creep score", gpm: "GPM",
  towers: "Towers", roshan: "Roshan kills", tormentor: "Tormentor kills",
  courier: "Courier kills", firstBlood: "First Blood",
  teamfight: "Teamfight participation", stuns: "Stun duration",
  wards: "Observer wards", stacks: "Camps stacked", runes: "Runes",
  smokes: "Smokes used", madstones: "Madstones collected"
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
    "Starts at 1950 and subtracts 195 a death, with a floor of zero — ten deaths pays nothing rather than a penalty. Scored per game, then averaged.",
  creeps:
    "Last hits AND denies together — the in-game glossary pays +3 per last hit or deny. Denies are about 2.5% of the total.",
  gpm:
    "Gold per minute, already averaged over the match. The only stat that is a rate rather than a count, so a long game does not inflate it.",
  towers:
    "Whoever lands the last hit on the tower takes all of it. Towers that fall to creeps are credited to nobody.",
  roshan:
    "The killing blow on Roshan, not the team that took it.",
  tormentor:
    "Read from the combat log's kill credit, not the kill announcement. The game credits everyone involved in the kill, which no single-player field reproduces, so this is the closest public data gets.",
  courier:
    "Couriers killed. Couriers that die to creeps or towers count for no one.",
  firstBlood:
    "Once a game, to whoever took the kill rather than the assist. It pays 1934, but it only fires in about a tenth of games.",
  teamfight:
    "The player's share of their team's fighting: kills plus assists, over the number of times the other team died. A fraction between 0 and 1, typically about two thirds.",
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
    "Estimated, not counted: OpenDota records dropped bundles, and a bundle is not a stone — stones from an uncontested camp fly straight to the player and leave no event. Scaled by 2.7, the measured middle of three independent estimates."
};

export const STAT_KEYS = Object.keys(POINT_VALUES) as StatKey[];

// Stats TI fantasy scores but neither OpenDota nor STRATZ exposes at all.
// We mark them unavailable rather than guessing. Madstones used to be on this
// list; it is now derived from madstone_bundle events - see ASSUMPTIONS.md.
export const UNAVAILABLE_STATS = ["Lotuses", "Watchers"];

// The colour of each banner slot, following the TI 2026 layout: five
// emblems per banner, colour decides which stats may be placed there.
export const BANNER_SLOTS: Record<Role, EmblemColor[]> = {
  core: ["red", "green", "red", "green", "red"],
  mid: ["red", "blue", "green", "red", "green"],
  support: ["blue", "green", "blue", "green", "blue"]
};

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
  return Math.max(0, base + per * rawPerGame);
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
