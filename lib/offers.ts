// Deciding what to do with the three options in front of you.
//
// The mechanic, from the in-game rules:
//
//   * three unique reroll options are available at any time;
//   * they are the SAME three for every war banner - you choose which banner to
//     apply one to;
//   * using one costs a single reroll, changes only the banner you picked, and
//     REPLACES ALL THREE OPTIONS.
//
// The last point is what shapes the decision. The options do not refresh on
// their own: spending is the only way to see different ones. So declining is
// not "wait for a better deal", it is "stop rerolling" - and conversely, taking
// a mildly bad option is sometimes right, because it is the price of a reshuffle
// when you still have rerolls to spend.
//
// That trade has no closed form, so it is simulated forward: deal random
// options, play the rest out, average. The future is genuinely random and there
// is nothing to enumerate about it.

import { Emblem, hasDuplicateStats } from "./fantasy";
import { Role } from "./scoring";
import { RerollAction, applyAction } from "./reroll";
import { seededRandom } from "./rng";

/** An option, and the banner you would apply it to. */
export type RosterOffer = { role: Role; action: RerollAction };

export type OfferDecision = {
  role: Role;
  action: RerollAction;
  /** Expected value if you take this now and play the rest out. */
  takeValue: number;
  /** Expected value if you decline everything this round and play on. */
  skipValue: number;
  /** takeValue - skipValue. Positive means take it. */
  edge: number;
  /** Value right now, before anything. */
  current: number;
};

export type OfferPlan = {
  decisions: OfferDecision[];
  skipValue: number;
  current: number;
  /** Rounds the plan looked ahead. */
  rounds: number;
  runs: number;
};

const ROLES: Role[] = ["core", "mid", "support"];

/**
 * Deals `count` distinct options.
 *
 * One deal serves all three banners, so options are drawn from the catalogue
 * once rather than per role. A scope that only makes sense on one banner - "all
 * blue emblems" on a Core banner with no blue - simply cannot be applied there.
 */
function deal(
  catalogue: RerollAction[],
  count: number,
  random: () => number
): RerollAction[] {
  if (catalogue.length <= count) return [...catalogue];
  const picked: RerollAction[] = [];
  const used = new Set<number>();
  while (picked.length < count) {
    const i = Math.floor(random() * catalogue.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(catalogue[i]);
  }
  return picked;
}

/** Banners an option can actually be applied to. */
function applicable(
  action: RerollAction,
  catalogues: Record<Role, RerollAction[]>
): Role[] {
  return ROLES.filter((role) => catalogues[role].some((a) => a.id === action.id));
}

/**
 * Plays the remaining rounds out against random deals.
 *
 * The policy is greedy: take the best offer on the table if it beats standing
 * pat, otherwise skip. Greedy understates the value of waiting - a perfect
 * policy would sometimes decline a small gain to keep tokens for a better deal
 * - so the skip figure this produces is a floor rather than an exact answer.
 */
/**
 * Plays the remaining rerolls out against random deals.
 *
 * The policy: apply the best (option, banner) pair on the table if it gains
 * anything, and otherwise stop. Stopping is right more often than it looks,
 * because a banner that is already good has more to lose than to win.
 *
 * It is greedy in one specific way - it never pays a small loss to reshuffle -
 * so the figures it produces are a floor. A perfect player would occasionally
 * burn a reroll on the least-bad option to see three new ones.
 */
function playOut(
  banners: Record<Role, Emblem[]>,
  catalogue: RerollAction[],
  catalogues: Record<Role, RerollAction[]>,
  valueOf: (role: Role, b: Emblem[]) => number,
  rerolls: number,
  random: () => number
): number {
  const hand = { ...banners };
  const value = { core: 0, mid: 0, support: 0 } as Record<Role, number>;
  for (const role of ROLES) value[role] = valueOf(role, hand[role]);
  let left = rerolls;

  while (left > 0) {
    const options = deal(catalogue, 3, random);
    let best: { role: Role; banner: Emblem[]; value: number; gain: number } | null = null;

    for (const action of options) {
      for (const role of applicable(action, catalogues)) {
        const rolled = applyAction(hand[role], role, action, random);
        if (hasDuplicateStats(rolled)) continue;
        const v = valueOf(role, rolled);
        const gain = v - value[role];
        if (gain > 0 && (!best || gain > best.gain)) {
          best = { role, banner: rolled, value: v, gain };
        }
      }
    }

    // Nothing on the table helps, and the only way to see new options is to
    // spend one making a banner worse. Stop.
    if (!best) break;
    hand[best.role] = best.banner;
    value[best.role] = best.value;
    left -= 1;
  }

  return ROLES.reduce((sum, role) => sum + value[role], 0);
}

/**
 * Values every offer on the table against the option of declining.
 *
 * `rounds` is how many more deals are expected before the card locks. With one
 * token per reroll and forty tokens that is forty; with dearer actions it is
 * fewer. It is the caller's estimate because the token costs are not published.
 */
/**
 * Values every (option, banner) pair against stopping.
 *
 * Declining here means declining for good: the options only change when one is
 * used, so there is no waiting them out. That makes the comparison a clean one
 * - this pair, or the banner you already hold.
 */
export function planOffers(
  banners: Record<Role, Emblem[]>,
  options: RerollAction[],
  catalogue: RerollAction[],
  catalogues: Record<Role, RerollAction[]>,
  valueOf: (role: Role, b: Emblem[]) => number,
  rerolls: number,
  runs = 200,
  seed = "offers"
): OfferPlan {
  const current = ROLES.reduce((sum, role) => sum + valueOf(role, banners[role]), 0);

  // Stopping now: the banners are what they are.
  const skipValue = current;

  const decisions: OfferDecision[] = [];
  for (const action of options) {
    for (const role of applicable(action, catalogues)) {
      let total = 0;
      for (let run = 0; run < runs; run += 1) {
        const random = seededRandom(`${seed}:${role}:${action.id}:${run}`);
        const rolled = applyAction(banners[role], role, action, random);
        const after = hasDuplicateStats(rolled) ? banners[role] : rolled;
        total += playOut(
          { ...banners, [role]: after }, catalogue, catalogues, valueOf,
          Math.max(0, rerolls - 1), random
        );
      }
      const takeValue = total / runs;
      decisions.push({ role, action, takeValue, skipValue, edge: takeValue - skipValue, current });
    }
  }

  decisions.sort((a, b) => b.edge - a.edge);
  return { decisions, skipValue, current, rounds: rerolls, runs };
}
