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
// The options do not refresh on their own. Taking none costs nothing and leaves
// them in place; spending a token can either apply one option or refresh all
// three. Both ways of spending are valued here against keeping the current hand.
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
  /** Play-outs this pair actually got. Contenders get more than also-rans. */
  runsUsed: number;
  /**
   * True when this pair cannot be told apart from the leader.
   *
   * Measured as a paired difference over the play-outs the two shared, which is
   * the whole point of giving every candidate the same futures: the difference
   * is a real quantity with its own error bar, not two noisy means subtracted.
   */
  tied: boolean;
};

export type OfferPlan = {
  decisions: OfferDecision[];
  skipValue: number;
  /** Expected final value after paying one token for three new options. */
  refreshValue: number;
  /** refreshValue - current. */
  refreshEdge: number;
  current: number;
  /** Rounds the plan looked ahead. */
  rounds: number;
  runs: number;
};

const ROLES: Role[] = ["core", "mid", "support"];

/**
 * How many options a deal puts in front of you. Always exactly three, plus the
 * standing option to use none of them - never more, never fewer. Exported so
 * the simulator's UI and the play-out below cannot drift apart.
 */
export const OPTIONS_DEALT = 3;

/**
 * Deals `count` distinct options.
 *
 * One deal serves all three banners, so options are drawn from the catalogue
 * once rather than per role. A scope that only makes sense on one banner - "all
 * blue emblems" on a Core banner with no blue - simply cannot be applied there.
 *
 * Distinct WITHIN a deal, but with no memory of the previous one: an option can
 * be dealt again immediately, and with 3 drawn from 38 that happens in about
 * 22% of deals. ASSUMPTIONS.md once listed "the same option cannot be offered
 * twice in a row" as verified; it is now on the assumed list, because the
 * observation behind it was not a careful one and nobody has checked.
 *
 * Do not enforce it without settling what it means first - it could block only
 * the option just used, all three just shown, or only the ones declined, and
 * those are three different rules. If it is real, the simulator currently
 * understates what a reshuffle is worth.
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
 * Plays the remaining rerolls out against random deals.
 *
 * The policy: apply the best (option, banner) pair on the table if it gains
 * anything, and otherwise spends one token to refresh all three. A refresh
 * cannot hurt the banner, so with tokens left it dominates abandoning the
 * remaining budget.
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
    const options = deal(catalogue, OPTIONS_DEALT, random);
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

    // Pay one token to replace all three without changing a banner.
    if (!best) {
      left -= 1;
      continue;
    }
    hand[best.role] = best.banner;
    value[best.role] = best.value;
    left -= 1;
  }

  return ROLES.reduce((sum, role) => sum + value[role], 0);
}

/**
 * Values every (option, banner) pair against taking none.
 *
 * Taking none costs nothing and leaves the same options in place. Paid refresh
 * is valued separately, since it changes no banner before the next deal.
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

  // Taking none: no token is spent and the current three stay on the table.
  const skipValue = current;

  // Refreshing consumes one token, changes no banner and starts from a fresh
  // deal. Use the same future streams candidates meet so the comparison does
  // not depend on one alternative receiving kinder random deals.
  let refreshTotal = 0;
  if (rerolls > 0) {
    for (let run = 0; run < runs; run += 1) {
      refreshTotal += playOut(
        banners, catalogue, catalogues, valueOf, rerolls - 1,
        seededRandom(`${seed}:future:${run}`)
      );
    }
  }
  const refreshValue = rerolls > 0 ? refreshTotal / runs : current;
  const refreshEdge = refreshValue - current;

  type Candidate = {
    role: Role; action: RerollAction; total: number; runsUsed: number;
    /** Result per run index, so pairs can be compared run for run. */
    byRun: Map<number, number>;
  };
  const candidates: Candidate[] = [];
  for (const action of options) {
    for (const role of applicable(action, catalogues)) {
      candidates.push({ role, action, total: 0, runsUsed: 0, byRun: new Map() });
    }
  }
  if (!candidates.length) {
    return {
      decisions: [], skipValue, refreshValue, refreshEdge,
      current, rounds: rerolls, runs
    };
  }

  /**
   * One play-out of one candidate.
   *
   * Two independent streams, on purpose. The action's own roll is part of what
   * is being judged, so it is drawn per candidate. The FUTURE is the shared
   * environment, so it is keyed on the run index alone - every candidate at run
   * 7 meets the same run of deals. Comparing candidates against a common future
   * removes the luck of the draw from the difference between them, which is the
   * quantity being ranked. Without it a candidate can win on a kind future
   * rather than on its merits.
   */
  function playCandidate(c: Candidate, run: number): number {
    const rollRandom = seededRandom(`${seed}:roll:${c.role}:${c.action.id}:${run}`);
    const futureRandom = seededRandom(`${seed}:future:${run}`);
    const rolled = applyAction(banners[c.role], c.role, c.action, rollRandom);
    const after = hasDuplicateStats(rolled) ? banners[c.role] : rolled;
    return playOut(
      { ...banners, [c.role]: after }, catalogue, catalogues, valueOf,
      Math.max(0, rerolls - 1), futureRandom
    );
  }

  /**
   * Sequential halving, rather than an equal split.
   *
   * The old scheme gave every pair the same number of play-outs, including the
   * ones that were plainly behind after ten. With a handful of candidates and a
   * fixed budget, the question is "which is best", not "what is each worth", and
   * for that: run everyone cheaply, drop the worst half, spend what they would
   * have used on the survivors. The winner ends up with several times the
   * play-outs it would have had, and the total work is unchanged.
   */
  const budget = runs * candidates.length;
  const phases = Math.max(1, Math.ceil(Math.log2(candidates.length)));
  let alive = [...candidates];
  let runOffset = 0;

  for (let phase = 0; phase < phases && alive.length > 0; phase += 1) {
    const each = Math.max(1, Math.floor(budget / (phases * alive.length)));
    for (const c of alive) {
      for (let i = 0; i < each; i += 1) {
        const value = playCandidate(c, runOffset + i);
        c.total += value;
        c.byRun.set(runOffset + i, value);
      }
      c.runsUsed += each;
    }
    runOffset += each;
    if (alive.length <= 1) break;
    alive.sort((a, b) => b.total / b.runsUsed - a.total / a.runsUsed);
    alive = alive.slice(0, Math.max(1, Math.ceil(alive.length / 2)));
  }

  // The leader is the pair the search spent most of its budget on, and among
  // equals the one with the highest average.
  const leader = [...candidates].sort(
    (a, b) => b.runsUsed - a.runsUsed ||
      b.total / Math.max(1, b.runsUsed) - a.total / Math.max(1, a.runsUsed)
  )[0];

  /**
   * Can this pair be told apart from the leader?
   *
   * Both met the same futures on the run indices they share, so the difference
   * can be measured run by run and averaged. That paired difference has a much
   * smaller error bar than either mean on its own - which is exactly what common
   * random numbers buy. Anything inside two standard errors of zero is a pair
   * the model cannot separate, and saying so is more honest than ranking it.
   */
  function tiedWithLeader(c: Candidate): boolean {
    if (c === leader) return false;
    const diffs: number[] = [];
    for (const [run, value] of c.byRun) {
      const other = leader.byRun.get(run);
      if (other !== undefined) diffs.push(value - other);
    }
    if (diffs.length < 2) return false;
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const variance =
      diffs.reduce((a, d) => a + (d - mean) * (d - mean), 0) / (diffs.length - 1);
    const standardError = Math.sqrt(variance / diffs.length);
    return Math.abs(mean) < 2 * standardError;
  }

  const decisions: OfferDecision[] = candidates.map((c) => {
    const takeValue = c.total / Math.max(1, c.runsUsed);
    return {
      role: c.role, action: c.action, takeValue, skipValue,
      edge: takeValue - skipValue, current, runsUsed: c.runsUsed,
      tied: tiedWithLeader(c)
    };
  });

  // Order by the search's own verdict, not by the raw mean.
  //
  // Halving leaves survivors with several times the play-outs of the ones it
  // dropped early, so their estimates are not comparable: a pair eliminated on
  // 66 runs can post a flattering average that a pair measured over 343 would
  // never sustain. Depth of evidence comes first, and the mean only separates
  // pairs the search examined equally hard.
  decisions.sort((a, b) => b.runsUsed - a.runsUsed || b.edge - a.edge);
  return {
    decisions, skipValue, refreshValue, refreshEdge,
    current, rounds: rerolls, runs
  };
}
