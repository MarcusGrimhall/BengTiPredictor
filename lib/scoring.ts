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
  kills: "Kills", deaths: "Deaths", creeps: "Last hits", gpm: "GPM",
  towers: "Towers", roshan: "Roshan kills", tormentor: "Tormentor kills",
  courier: "Courier kills", firstBlood: "First Blood",
  teamfight: "Teamfight participation", stuns: "Stun duration",
  wards: "Observer wards", stacks: "Camps stacked", runes: "Runes",
  smokes: "Smokes used", madstones: "Madstones collected"
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

/** Converts a per-game raw value into fantasy points for that stat. */
export function statToPoints(stat: StatKey, rawPerGame: number): number {
  const { per, base = 0 } = POINT_VALUES[stat];
  return base + per * rawPerGame;
}

export function statsForColor(color: EmblemColor): StatKey[] {
  return STAT_KEYS.filter((key) => STAT_COLORS[key] === color);
}
