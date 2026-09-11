import rules from "./current-rules.json";
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
// One- and two-token expected values enumerate transitions exactly. Longer horizons use
// rollout under a non-clairvoyant greedy continuation, not an optimal policy.
// finiteHorizon.ts supplies the exact reduced-game reference solver.

import { Emblem, hasDuplicateStats } from "./fantasy";
import { Role } from "./scoring";
import { RerollAction, applyAction, enumerateOutcomes } from "./reroll";
import { seededRandom } from "./rng";
import { exactTwoTokenValues } from "./endgame";

/** An option, and the banner you would apply it to. */
export type RosterOffer = { role: Role; action: RerollAction };

export type OfferDecision = {
  role: Role;
  action: RerollAction;
  /** Expected value if you take this now and play the rest out. */
  takeValue: number;
  /** What the roster is worth if you stop here. Unspent tokens expire. */
  skipValue: number;
  /**
   * The best thing you could do INSTEAD of taking this, on the same budget.
   *
   * Refreshing also costs one token and also ends in a fresh deal, so it is the
   * fair comparison; stopping is only the baseline when no tokens remain.
   */
  baseline: number;
  /** takeValue - baseline. Positive means this option beats the alternative. */
  edge: number;
  /** Value right now, before anything. */
  current: number;
  /**
   * Roster value the instant the option is applied, before any further rolls.
   *
   * This is the damage - or the gain - you actually take on. `takeValue` can
   * hide it completely, because a long budget repairs most mistakes: at the
   * top of the tier ladder every quality reroll is a certain loss now and a
   * wash by the end, and only this field says so.
   */
  immediate: number;
  /** immediate - current. Negative means the option costs you points on the spot. */
  immediateDelta: number;
  /** Share of rolls that improve the roster at once. Zero means it cannot help. */
  improveChance: number;
  /**
   * 10th percentile of where you end up, over the simulated futures.
   *
   * The world where the repair does not come. A mean alone cannot show it,
   * which is what made a guaranteed loss read as neutral.
   */
  downside: number | null;
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
  /** The alternative every option is scored against. See OfferDecision.baseline. */
  baseline: number;
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
export const OPTIONS_DEALT = rules.offersPerDeal;

/**
 * Deals `count` distinct options.
 *
 * One deal serves all three banners, so options are drawn from the catalogue
 * once rather than per role. A scope that only makes sense on one banner - "all
 * blue emblems" on a Core banner with no blue - simply cannot be applied there.
 *
 * The adopted no-repeat assumption excludes all three previous offers from
 * the next deal. This is configured explicitly in current-rules.json.
 */
export function deal(
  catalogue: RerollAction[], count: number, random: () => number,
  previous: RerollAction[] = []
): RerollAction[] {
  const excluded = new Set(rules.excludePreviousDeal ? previous.map((a) => a.id) : []);
  const pool = catalogue.filter((a) => !excluded.has(a.id));
  if (pool.length < count) throw new Error("Offer catalogue cannot supply a legal new deal");
  // Partial Fisher-Yates: exactly count draws, uniform without replacement.
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length-i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
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
export function greedyOffer(
  banners: Record<Role, Emblem[]>, options: RerollAction[],
  catalogues: Record<Role, RerollAction[]>,
  valueOf: (role: Role, b: Emblem[]) => number,
  expectedCache = new Map<string, number>()
): { role: Role; action: RerollAction; gain: number } | null {
  let best: { role: Role; action: RerollAction; gain: number } | null = null;
  for (const action of options) for (const role of applicable(action, catalogues)) {
    const key = `${role}:${action.id}:${JSON.stringify(banners[role])}`;
    let expected = expectedCache.get(key);
    if (expected === undefined) {
      const outcomes = enumerateOutcomes(banners[role], role, action);
      if (!outcomes) throw new Error("Transition too large for exact greedy expectation");
      expected = outcomes.reduce((sum,o) => sum + o.probability * valueOf(role,o.banner),0);
      expectedCache.set(key, expected);
    }
    const gain = expected - valueOf(role, banners[role]);
    if (gain > 0 && (!best || gain > best.gain)) best = { role, action, gain };
  }
  return best;
}

function playOut(
  banners: Record<Role, Emblem[]>, catalogue: RerollAction[],
  catalogues: Record<Role, RerollAction[]>, valueOf: (role: Role, b: Emblem[]) => number,
  rerolls: number, random: () => number, previous: RerollAction[],
  expectedCache: Map<string, number>
): number {
  const hand = { ...banners };
  for (let left = rerolls; left > 0; left--) {
    // One parent draw per step; action-dependent draws cannot desynchronise
    // the future deal streams used for paired candidate comparisons.
    const stepSeed = String(random());
    const options = deal(catalogue, OPTIONS_DEALT, seededRandom(`${stepSeed}:deal`), previous);
    previous = options;
    const best = greedyOffer(hand, options, catalogues, valueOf, expectedCache);
    // Choose on expectations FIRST. Only the chosen action's result is seen.
    if (best) hand[best.role] = applyAction(hand[best.role], best.role, best.action, seededRandom(`${stepSeed}:outcome`));
    // Otherwise the token pays for a refresh; no future outcome is inspected.
  }
  return ROLES.reduce((sum, role) => sum + valueOf(role, hand[role]), 0);
}

/**
 * Values every (option, banner) pair against the best alternative use of the
 * same token.
 *
 * The comparison used to be against standing pat, and that made the numbers
 * unreadable. `takeValue` plays the whole remaining budget forward; `current`
 * spends nothing. Subtracting one from the other therefore measured "is it
 * worth playing at all" and buried the option's own contribution inside it.
 * Measured on an all-tier-I roster worth 32,826, every option scored about
 * +47,000 - and so did a refresh, which by construction changes no banner. The
 * differences that actually decide the pick were 300 points inside a 47,000
 * point number.
 *
 * Refreshing costs one token, ends in a fresh deal and leaves the banners
 * alone, which makes it exactly what taking an option has to beat. Scoring
 * against it puts both sides on the same budget and leaves only the part that
 * depends on the option. Stopping is the baseline only when no tokens remain,
 * since unused tokens expire and are worth nothing kept.
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
  if (!Number.isSafeInteger(rerolls) || rerolls < 0 || rerolls > 60) throw new Error("Invalid shared token budget");
  if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("Positive run count required");
  if (options.length !== OPTIONS_DEALT || new Set(options.map((a) => a.id)).size !== OPTIONS_DEALT) throw new Error("Exactly three unique offers required");
  if (options.some((a) => !catalogue.some((c) => c.id === a.id))) throw new Error("Unknown offer");
  const expectedCache = new Map<string, number>();
  const current = ROLES.reduce((sum, role) => sum + valueOf(role, banners[role]), 0);

  if (rerolls === 0) return { decisions: [], skipValue: current, baseline: current,
    refreshValue: current, refreshEdge: 0, current, rounds: 0, runs: 0 };
  if (rerolls === 1) {
    const decisions: OfferDecision[] = [];
    for (const action of options) for (const role of applicable(action, catalogues)) {
      const outcomes = enumerateOutcomes(banners[role], role, action);
      if (!outcomes) throw new Error("Transition enumeration limit exceeded");
      const rest = current - valueOf(role, banners[role]);
      const values = outcomes.map((o) => ({ value: rest + valueOf(role, o.banner), p: o.probability })).sort((a,b) => a.value-b.value);
      const mean = values.reduce((s,o) => s+o.p*o.value,0);
      let mass = 0, downside = values[0].value;
      for (const o of values) { mass += o.p; downside = o.value; if (mass >= 0.1) break; }
      decisions.push({ role, action, takeValue: mean, skipValue: current, baseline: current,
        edge: mean-current, current, immediate: mean, immediateDelta: mean-current,
        improveChance: values.reduce((s,o) => s+(o.value > current ? o.p : 0),0),
        downside, runsUsed: 0, tied: false });
    }
    decisions.sort((a,b) => b.takeValue-a.takeValue);
    for (const d of decisions.slice(1)) d.tied = Math.abs(d.takeValue-decisions[0].takeValue) < 1e-8;
    return { decisions, skipValue: current, baseline: current, refreshValue: current,
      refreshEdge: 0, current, rounds: 1, runs: 0 };
  }

  if (rerolls === 2) {
    const exact = exactTwoTokenValues(banners, options, catalogue, catalogues, valueOf);
    const baseline = Math.max(current, exact.refresh);
    const decisions: OfferDecision[] = exact.actions.map((a, i) => ({
      role: a.role, action: a.action, takeValue: a.value, skipValue: current,
      baseline, edge: a.value-baseline, current, immediate: a.immediate,
      immediateDelta: a.immediate-current, improveChance: a.improveChance,
      // Integrating expected next-deal values does not produce a terminal
      // outcome quantile. Do not label the spread of conditional means as one.
      downside: null, runsUsed: 0,
      tied: i > 0 && Math.abs(a.value-exact.actions[0].value) < 1e-8
    }));
    return { decisions, skipValue: current, baseline, refreshValue: exact.refresh,
      refreshEdge: exact.refresh-current, current, rounds: 2, runs: 0 };
  }

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
        seededRandom(`${seed}:future:${run}`), options, expectedCache
      );
    }
  }
  const refreshValue = rerolls > 0 ? refreshTotal / runs : current;
  const refreshEdge = refreshValue - current;

  // With tokens in hand you can always refresh instead, so that is what an
  // option competes with. With none left there is nothing to do but stop.
  const baseline = rerolls > 0 ? Math.max(refreshValue, current) : current;

  type Candidate = {
    role: Role; action: RerollAction; total: number; runsUsed: number;
    /** Result per run index, so pairs can be compared run for run. */
    byRun: Map<number, number>;
    /** Roster value straight after the roll, before the budget is played on. */
    immediates: number[];
  };
  const candidates: Candidate[] = [];
  for (const action of options) {
    for (const role of applicable(action, catalogues)) {
      candidates.push({ role, action, total: 0, runsUsed: 0, byRun: new Map(), immediates: [] });
    }
  }
  if (!candidates.length) {
    return {
      decisions: [], skipValue, baseline, refreshValue, refreshEdge,
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
  function playCandidate(c: Candidate, run: number): { immediate: number; final: number } {
    const rollRandom = seededRandom(`${seed}:roll:${c.role}:${c.action.id}:${run}`);
    const futureRandom = seededRandom(`${seed}:future:${run}`);
    const rolled = applyAction(banners[c.role], c.role, c.action, rollRandom);
    const after = hasDuplicateStats(rolled) ? banners[c.role] : rolled;
    // Only this role's banner moved, so the rest of the roster carries over.
    const immediate = current - valueOf(c.role, banners[c.role]) + valueOf(c.role, after);
    return {
      immediate,
      final: playOut(
        { ...banners, [c.role]: after }, catalogue, catalogues, valueOf,
        Math.max(0, rerolls - 1), futureRandom, options, expectedCache
      )
    };
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
        const { immediate, final } = playCandidate(c, runOffset + i);
        c.total += final;
        c.byRun.set(runOffset + i, final);
        c.immediates.push(immediate);
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

  /** 10th percentile of a candidate's play-outs: the world the mean hides. */
  function downsideOf(c: Candidate): number {
    const finals = [...c.byRun.values()].sort((a, b) => a - b);
    if (!finals.length) return current;
    return finals[Math.min(finals.length - 1, Math.floor(0.1 * finals.length))];
  }

  const decisions: OfferDecision[] = candidates.map((c) => {
    const takeValue = c.total / Math.max(1, c.runsUsed);
    const immediate = c.immediates.length
      ? c.immediates.reduce((a, b) => a + b, 0) / c.immediates.length
      : current;
    const improved = c.immediates.filter((v) => v > current).length;
    return {
      role: c.role, action: c.action, takeValue, skipValue, baseline,
      edge: takeValue - baseline, current,
      immediate, immediateDelta: immediate - current,
      improveChance: c.immediates.length ? improved / c.immediates.length : 0,
      downside: downsideOf(c),
      runsUsed: c.runsUsed,
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
    decisions, skipValue, baseline, refreshValue, refreshEdge,
    current, rounds: rerolls, runs
  };
}
