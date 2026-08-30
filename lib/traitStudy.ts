// Measuring what a trait is actually worth.
//
// A trait's printed effect is not its value. Vampiric says +50% to itself and
// -10% to its neighbours, but what that comes to depends on which emblem it
// sits on and how much that emblem was contributing in the first place. Put it
// on your biggest earner and the -10% falls on two small ones; put it on a
// small one and you have paid the penalty for nothing.
//
// Fractal and Friendly are worse than that: alone they are worth exactly zero,
// because their conditions are never met by a single emblem. They only pay as
// part of a plan - five different tiers, or three Friendly on one banner - and
// that plan costs reroll tokens to build.
//
// So this measures each trait the only way that means anything: put it on a
// real banner, in every slot, against real players, and see what comes out.

import { Emblem, PlayerEntry, Trait, TRAITS, matchScores } from "./fantasy";
import { Role } from "./scoring";

export type TraitSlotValue = {
  trait: Trait;
  /** Relative gain with the trait in each slot, against the same banner without it. */
  bySlot: number[];
  /** Best slot for this trait, and what it is worth there. */
  bestSlot: number;
  best: number;
};

/** Mean total banked across a set of entries under one banner. */
export function meanBanked(entries: PlayerEntry[], banner: Emblem[]): number {
  if (!entries.length) return 0;
  return entries.reduce(
    (sum, e) => sum + matchScores(e, banner).reduce((a, b) => a + b, 0),
    0
  ) / entries.length;
}

/**
 * What each trait is worth on this banner, in every slot.
 *
 * Values are relative to the identical banner with no traits at all, so they
 * are comparable across roles and stages.
 */
export function traitValues(entries: PlayerEntry[], banner: Emblem[]): TraitSlotValue[] {
  const plain = banner.map((e) => ({ ...e, trait: "none" as Trait }));
  const base = meanBanked(entries, plain);
  if (!base) return [];

  return TRAITS.filter((t) => t !== "none").map((trait) => {
    const bySlot = plain.map((_, i) =>
      meanBanked(entries, plain.map((e, j) => (j === i ? { ...e, trait } : e))) / base - 1
    );
    let bestSlot = 0;
    for (let i = 1; i < bySlot.length; i += 1) if (bySlot[i] > bySlot[bestSlot]) bestSlot = i;
    return { trait, bySlot, bestSlot, best: bySlot[bestSlot] };
  });
}

/**
 * The two traits that only pay in combination, measured as a plan.
 *
 * Three Friendly on one banner turns all three into +50%. Fractal needs all
 * five tiers different, which is a real constraint on what you can keep.
 */
export function comboValues(entries: PlayerEntry[], banner: Emblem[]): Array<{
  label: string;
  detail: string;
  value: number;
}> {
  const plain = banner.map((e) => ({ ...e, trait: "none" as Trait }));
  const base = meanBanked(entries, plain);
  if (!base) return [];

  const out: Array<{ label: string; detail: string; value: number }> = [];

  if (plain.length >= 3) {
    const three = plain.map((e, i) => (i < 3 ? { ...e, trait: "friendly" as Trait } : e));
    out.push({
      label: "Three Friendly",
      detail: "all three turn on at +50% each",
      value: meanBanked(entries, three) / base - 1
    });
  }

  const tiers = ["I", "II", "III", "IV", "V"] as const;
  const spread = plain.map((e, i) => ({ ...e, tier: tiers[i % tiers.length] }));
  const spreadBase = meanBanked(entries, spread);
  if (spreadBase) {
    const withFractal = spread.map((e, i) => (i === 0 ? { ...e, trait: "fractal" as Trait } : e));
    out.push({
      label: "Fractal + five different tiers",
      detail: "costs you control over every tier on the banner",
      value: meanBanked(entries, withFractal) / spreadBase - 1
    });
  }

  const twoUnique = plain.map((e, i) => (i < 2 ? { ...e, trait: "unique" as Trait } : e));
  const oneUnique = plain.map((e, i) => (i < 1 ? { ...e, trait: "unique" as Trait } : e));
  out.push({
    label: "Two Unique instead of one",
    detail: "the second cancels the first - both stop paying",
    value: meanBanked(entries, twoUnique) / meanBanked(entries, oneUnique) - 1
  });

  return out;
}

export type EntryRecord = {
  entry: PlayerEntry;
  role: Role;
  /** Best single match (two best games of one series). */
  bestMatch: number;
  /** Mean per match. */
  mean: number;
  /** Total banked over the stage. */
  total: number;
  matches: number;
};

/** Per-entry records under a given banner, for the leaderboards. */
export function entryRecords(entries: PlayerEntry[], bannerFor: (role: Role) => Emblem[]): EntryRecord[] {
  return entries.map((entry) => {
    const scores = matchScores(entry, bannerFor(entry.role));
    const total = scores.reduce((a, b) => a + b, 0);
    return {
      entry,
      role: entry.role,
      bestMatch: scores.length ? scores[scores.length - 1] : 0,
      mean: scores.length ? total / scores.length : 0,
      total,
      matches: scores.length
    };
  });
}
