// Trainer titles: one shared Prefix and one shared Suffix for the whole roster.
//
// Both are multipliers on top of the emblem score, and both are conditional:
// a Prefix pays when the player is on a hero of the right group, a Suffix pays
// when a game event happens. So the value of a title is
//
//     expected multiplier = 1 + bonus% x P(condition fires)
//
// and picking one is a question about frequency, not about the headline number.
// The Lucky pays 21% but only on games whose duration ends in the digit 8;
// the Underdog pays 6% but on every game the team loses.
//
// Bonuses and conditions are transcribed from the reference project's glossary.
// The trigger rates are measured here from the matches actually fetched.

import type { PlayerEntry } from "./fantasy";

export type PrefixKey =
  | "crimson" | "cerulean" | "emerald" | "royal"
  | "golden" | "elemental" | "otherworldly" | "heroic";

export type SuffixKey =
  | "tormented" | "flayedTwins" | "patient" | "underdog"
  | "decisive" | "clutch" | "lucky" | "cruel";

/** Whether a condition can be measured from public match data at all. */
export type Measurability = "measured" | "needsHeroGroups" | "unavailable";

export const PREFIXES: Record<PrefixKey, { label: string; bonus: number; condition: string }> = {
  crimson:      { label: "Crimson",      bonus: 6,  condition: "when playing a red hero" },
  cerulean:     { label: "Cerulean",     bonus: 11, condition: "when playing a blue hero" },
  emerald:      { label: "Emerald",      bonus: 6,  condition: "when playing a green hero" },
  royal:        { label: "Royal",        bonus: 10, condition: "when playing a purple hero" },
  golden:       { label: "Golden",       bonus: 8,  condition: "when playing a yellow or brown hero" },
  elemental:    { label: "Elemental",    bonus: 8,  condition: "when playing a water, fire or ice hero" },
  otherworldly: { label: "Otherworldly", bonus: 7,  condition: "when playing an undead, demon or spirit hero" },
  heroic:       { label: "Heroic",       bonus: 9,  condition: "when playing a masked or cloaked hero" }
};

export const SUFFIXES: Record<SuffixKey, {
  label: string;
  bonus: number;
  condition: string;
  measurability: Measurability;
  why?: string;
}> = {
  tormented: {
    label: "the Tormented", bonus: 23,
    condition: "if any roster player dies to a Tormentor",
    measurability: "unavailable",
    why: "deaths are not attributed to the Tormentor in public match data"
  },
  flayedTwins: {
    label: "the Flayed Twins Acolyte", bonus: 9,
    condition: "if first blood happens before the starting horn",
    measurability: "unavailable",
    why: "the horn is not a timestamped event; pre-horn kills cannot be separated"
  },
  patient: {
    label: "the Patient", bonus: 23,
    condition: "if first blood does not happen before 10:00",
    measurability: "measured"
  },
  underdog: {
    label: "the Underdog", bonus: 6,
    condition: "if that player's team loses",
    measurability: "measured"
  },
  decisive: {
    label: "the Decisive", bonus: 24,
    condition: "if the game ends before 25:00",
    measurability: "measured"
  },
  clutch: {
    label: "the Clutch", bonus: 16,
    condition: "in the last possible game of a match",
    measurability: "measured"
  },
  lucky: {
    label: "the Lucky", bonus: 21,
    condition: "if the game duration ends in the digit 8",
    measurability: "measured"
  },
  cruel: {
    label: "the Cruel", bonus: 13,
    condition: "if a player is killed at their own fountain",
    measurability: "unavailable",
    why: "kill locations are not exposed, so fountain kills cannot be identified"
  }
};

/**
 * Bit positions of the measurable suffix conditions, as stored per game by the
 * fetch script. Keep in sync with scripts/extract.mjs.
 */
export const SUFFIX_BITS: Partial<Record<SuffixKey, number>> = {
  lucky: 1,
  decisive: 2,
  patient: 4,
  underdog: 8,
  clutch: 16
};

export const MEASURABLE_SUFFIXES = Object.keys(SUFFIX_BITS) as SuffixKey[];

/**
 * How often a suffix condition fired across an entry's own games.
 *
 * Returns null when the suffix cannot be measured at all, so the caller can say
 * "unknown" rather than quietly showing zero.
 */
export function suffixTriggerRate(player: PlayerEntry, suffix: SuffixKey): number | null {
  const bit = SUFFIX_BITS[suffix];
  const flags = player.gameTitles;
  if (bit === undefined || !flags?.length) return null;
  const hits = flags.reduce((n, mask) => n + ((mask & bit) ? 1 : 0), 0);
  return hits / flags.length;
}

/**
 * Expected multiplier from a suffix: 1 + bonus x how often it fires.
 *
 * A title that never fires is worth exactly 1, which is the point - the
 * headline percentage says nothing without the frequency beside it.
 */
export function suffixValue(player: PlayerEntry, suffix: SuffixKey): {
  rate: number | null;
  multiplier: number;
  bonus: number;
} {
  const { bonus } = SUFFIXES[suffix];
  const rate = suffixTriggerRate(player, suffix);
  return { rate, multiplier: rate === null ? 1 : 1 + (bonus / 100) * rate, bonus };
}

/**
 * Hero groups for the Prefixes.
 *
 * Valve classifies every hero into colour and theme groups for the Compendium.
 * That classification is not in any public API - OpenDota's hero constants
 * carry only primary attribute, attack type and roles - so this table has to be
 * supplied by hand. Until it is, Prefix values are reported as unknown rather
 * than guessed.
 *
 * Fill it as `{ [heroId]: ["crimson", "otherworldly"] }`; a hero can belong to
 * several groups, which is why the reference project's per-player rates sum to
 * more than 100%.
 */
export const HERO_GROUPS: Record<number, PrefixKey[]> = {};

export const heroGroupsKnown = () => Object.keys(HERO_GROUPS).length > 0;

/** How often an entry played a hero in the prefix's group. Null if unknown. */
export function prefixTriggerRate(player: PlayerEntry, prefix: PrefixKey): number | null {
  if (!heroGroupsKnown()) return null;
  const heroes = player.gameHeroes;
  if (!heroes?.length) return null;
  const hits = heroes.reduce((n, id) => n + ((HERO_GROUPS[id] ?? []).includes(prefix) ? 1 : 0), 0);
  return hits / heroes.length;
}

export function prefixValue(player: PlayerEntry, prefix: PrefixKey): {
  rate: number | null;
  multiplier: number;
  bonus: number;
} {
  const { bonus } = PREFIXES[prefix];
  const rate = prefixTriggerRate(player, prefix);
  return { rate, multiplier: rate === null ? 1 : 1 + (bonus / 100) * rate, bonus };
}
