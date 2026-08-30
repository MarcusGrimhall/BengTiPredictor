// Deciding between the three offers actually in front of you.
//
// The reroll menu is not a shop. Each round the game deals three options at
// random out of the whole catalogue, you take one or skip, and next round it
// deals three more. The only constraint anyone has established is that the same
// option does not come up twice in a row.
//
// That makes "commit the budget to this option" the wrong question, and it is
// the question the old planner answered. You cannot commit to anything: an
// option you decline may never appear again, and one you want may never appear
// at all. The right question is the one the screen is actually asking -
//
//     is this offer better than declining and seeing what comes next?
//
// which means the value of skipping has to be worked out too, and the value of
// skipping is the value of playing on against a random deal. That has no closed
// form, so it is simulated forward: deal random rounds, play them out, average.
// The future here is genuinely random, so there is nothing to enumerate.

import { Emblem, hasDuplicateStats } from "./fantasy";
import { Role } from "./scoring";
import { RerollAction, applyAction } from "./reroll";
import { seededRandom } from "./rng";

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
 * Deals `count` offers from across all three banners.
 *
 * The token pool is shared, so a deal is not per banner - an offer can land on
 * any of them, and that is why the decision has to be made at roster level.
 */
function deal(
  catalogues: Record<Role, RerollAction[]>,
  tokens: number,
  exclude: string | null,
  count: number,
  random: () => number
): RosterOffer[] {
  const pool: RosterOffer[] = [];
  for (const role of ROLES) {
    for (const action of catalogues[role]) {
      if (action.cost <= tokens && `${role}:${action.id}` !== exclude) pool.push({ role, action });
    }
  }
  if (pool.length <= count) return pool;
  const picked: RosterOffer[] = [];
  const used = new Set<number>();
  while (picked.length < count) {
    const i = Math.floor(random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(pool[i]);
  }
  return picked;
}

/**
 * Plays the remaining rounds out against random deals.
 *
 * The policy is greedy: take the best offer on the table if it beats standing
 * pat, otherwise skip. Greedy understates the value of waiting - a perfect
 * policy would sometimes decline a small gain to keep tokens for a better deal
 * - so the skip figure this produces is a floor rather than an exact answer.
 */
function playOut(
  banners: Record<Role, Emblem[]>,
  catalogues: Record<Role, RerollAction[]>,
  valueOf: (role: Role, b: Emblem[]) => number,
  tokens: number,
  rounds: number,
  lastTaken: string | null,
  random: () => number
): number {
  const hand = { ...banners };
  const value = { core: 0, mid: 0, support: 0 } as Record<Role, number>;
  for (const role of ROLES) value[role] = valueOf(role, hand[role]);
  let left = tokens;
  let last = lastTaken;

  for (let round = 0; round < rounds; round += 1) {
    const offers = deal(catalogues, left, last, 3, random);
    if (!offers.length) break;

    let best: { role: Role; id: string; banner: Emblem[]; value: number; cost: number } | null = null;

    for (const { role, action } of offers) {
      const rolled = applyAction(hand[role], role, action, random);
      if (hasDuplicateStats(rolled)) continue;
      const v = valueOf(role, rolled);
      // Only the affected banner changes, so the roster gain is this role's.
      const gain = v - value[role];
      if (gain > 0 && (!best || gain > best.value - value[best.role])) {
        best = { role, id: `${role}:${action.id}`, banner: rolled, value: v, cost: action.cost };
      }
    }

    if (!best) { last = null; continue; }
    hand[best.role] = best.banner;
    value[best.role] = best.value;
    left -= best.cost;
    last = best.id;
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
export function planOffers(
  banners: Record<Role, Emblem[]>,
  offers: RosterOffer[],
  catalogues: Record<Role, RerollAction[]>,
  valueOf: (role: Role, b: Emblem[]) => number,
  tokens: number,
  rounds: number,
  runs = 200,
  seed = "offers"
): OfferPlan {
  const current = ROLES.reduce((sum, role) => sum + valueOf(role, banners[role]), 0);

  // Declining: the deal moves on and you play the remaining rounds.
  let skipTotal = 0;
  for (let run = 0; run < runs; run += 1) {
    const random = seededRandom(`${seed}:skip:${run}`);
    skipTotal += playOut(banners, catalogues, valueOf, tokens, Math.max(0, rounds - 1), null, random);
  }
  const skipValue = skipTotal / runs;

  const decisions = offers.map(({ role, action }) => {
    if (action.cost > tokens) {
      return { role, action, takeValue: skipValue, skipValue, edge: 0, current };
    }
    let total = 0;
    for (let run = 0; run < runs; run += 1) {
      const random = seededRandom(`${seed}:${role}:${action.id}:${run}`);
      const rolled = applyAction(banners[role], role, action, random);
      const after = hasDuplicateStats(rolled) ? banners[role] : rolled;
      total += playOut(
        { ...banners, [role]: after }, catalogues, valueOf,
        tokens - action.cost, Math.max(0, rounds - 1), `${role}:${action.id}`, random
      );
    }
    const takeValue = total / runs;
    return { role, action, takeValue, skipValue, edge: takeValue - skipValue, current };
  });

  decisions.sort((a, b) => b.edge - a.edge);
  return { decisions, skipValue, current, rounds, runs };
}
