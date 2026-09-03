// Reroll simulation.
//
// You start a stage with a randomly rolled banner and a pool of tokens: 40 for
// the group stage (3 emblems), then 30 fresh ones for the main event (the first
// 3 carry over and 2 new slots are added). Unused group stage tokens expire.
//
// The reroll menu lets you target the stat, the quality (tier) or the trait, and
// scope it to all / the first / the last / a random emblem of one colour. There
// are also two wildcards that move qualities around.
//
// Every option costs the same: one of your rerolls. There is no price list -
// forty rerolls for the group stage, thirty for the playoffs, and taking any
// option spends one. So "can I afford this" is never the question; "is this
// worth one of my forty" always is.
//
// Quality odds use the measured 5:4:3:2:1 tier weights from 195 client rolls
// (163 informative draws). Trait odds are still assumed uniform.
// Everything else - banner rules, scoring, the uniqueness constraint, and the
// rule that a reroll never returns what it replaced - is exact.

import { seededRandom } from "./rng";
import { Emblem, Tier, Trait, hasDuplicateStats } from "./fantasy";
import { EmblemColor, Role, StatKey, BANNER_SLOTS, statsForColor } from "./scoring";
import { STAGE_TOKENS } from "./stages";

/**
 * A reroll never gives back what it replaced.
 *
 * Rerolling the quality of a tier II lands on I, III, IV or V - four outcomes,
 * not five. The measured base weights are renormalised over those four tiers.
 * Trait weights remain unpublished and are treated as uniform.
 */
export const TIERS_ALL: Tier[] = ["I", "II", "III", "IV", "V"];

/**
 * Measured crafting weights, Tier I through V: 5:4:3:2:1.
 *
 * The free fit over 163 informative client rolls was
 * 32.8 / 28.5 / 22.1 / 11.7 / 5.0 percent. The small-integer rule below fits
 * that sample (likelihood-ratio p=0.75), while uniform odds are rejected at
 * p<1e-8. See ASSUMPTIONS.md for provenance and uncertainty.
 */
export const QUALITY_WEIGHTS: Record<Tier, number> = {
  I: 5,
  II: 4,
  III: 3,
  IV: 2,
  V: 1
};

/** Every tier except the one held; probabilities come from QUALITY_WEIGHTS. */
export function tierOptions(current: Tier): Tier[] {
  return TIERS_ALL.filter((t) => t !== current);
}

/** Normalised weighted outcomes over any allowed set of tiers. */
export function weightedTierOutcomes(allowed: Tier[]): Array<{ tier: Tier; probability: number }> {
  const total = allowed.reduce((sum, tier) => sum + QUALITY_WEIGHTS[tier], 0);
  if (total <= 0) return [];
  return allowed.map((tier) => ({ tier, probability: QUALITY_WEIGHTS[tier] / total }));
}

/** Conditional quality distribution for a reroll from one specific tier. */
export function tierOutcomes(current: Tier): Array<{ tier: Tier; probability: number }> {
  return qualityOutcomes(current, "reroll");
}

export type QualityDirection = "reroll" | "increase" | "decrease";

/**
 * Quality odds are conditional on both the current tier and the operation:
 * reroll excludes the current tier, increase keeps only higher tiers, and
 * decrease keeps only lower tiers. The same measured weights are renormalised
 * inside the resulting legal set.
 */
export function qualityOutcomes(
  current: Tier,
  direction: QualityDirection
): Array<{ tier: Tier; probability: number }> {
  const rank = TIERS_ALL.indexOf(current);
  const allowed = direction === "increase"
    ? TIERS_ALL.slice(rank + 1)
    : direction === "decrease"
      ? TIERS_ALL.slice(0, rank)
      : tierOptions(current);
  return weightedTierOutcomes(allowed);
}

/** Uniform over every trait except the one held. */
export function traitOptions(current: Trait, all: Trait[]): Trait[] {
  return all.filter((t) => t !== current);
}

export type RerollTarget = "stat" | "tier" | "trait" | "qualityUp" | "qualityUpTwoDownOne" | "skip";
export type RerollScope = "all" | "first" | "last" | "random";

export type RerollAction = {
  id: string;
  label: string;
  target: RerollTarget;
  scope: RerollScope;
  /** Restrict to emblems of this colour, or "any" for the wildcards. */
  color: EmblemColor | "any";
  cost: number;
};

/**
 * Every option costs one reroll. There is no menu of prices - a wildcard that
 * moves three emblems costs exactly what rerolling one stat costs.
 */
export const REROLL_COST = 1;

const ROLLABLE_TRAITS: Trait[] = ["fractal", "benevolent", "vampiric", "unique", "friendly"];

/** Uniform pick. */
function pick<T>(options: T[], roll: number): T {
  return options[Math.min(options.length - 1, Math.floor(roll * options.length))];
}

/** Pick a tier from the measured weights, renormalised over the allowed tiers. */
function pickWeightedTier(allowed: Tier[], roll: number): Tier {
  const outcomes = weightedTierOutcomes(allowed);
  let remaining = roll;
  for (const { tier, probability } of outcomes) {
    if (remaining < probability) return tier;
    remaining -= probability;
  }
  return outcomes[outcomes.length - 1]?.tier ?? allowed[allowed.length - 1];
}

/** Every action offered for a role, given how many slots the stage has. */
export function actionCatalogue(role: Role, slots: number): RerollAction[] {
  const colors = Array.from(new Set(BANNER_SLOTS[role].slice(0, slots)));
  const granular: Record<EmblemColor, RerollTarget> = {
    red: "tier", blue: "trait", green: "stat"
  };
  const actions: RerollAction[] = [];
  for (const color of colors) {
    const detailed = granular[color];
    for (const target of ["stat", "tier", "trait"] as RerollTarget[]) {
      const scopes: RerollScope[] = target === detailed
        ? ["all", "first", "last", "random"]
        : ["all"];
      for (const scope of scopes) {
        const word = target === "tier" ? "quality" : target;
        const scopeWord = scope === "random" ? "one random" : scope === "all" ? "all" : `the ${scope}`;
        actions.push({
          id: `${target}-${scope}-${color}`,
          label: `Reroll ${word} · ${scopeWord} ${color} emblem${scope === "all" ? "s" : ""}`,
          target, scope, color, cost: REROLL_COST
        });
      }
    }
  }

  actions.push({
    id: "qualityUp-any",
    label: "Wildcard · randomly increase one quality",
    target: "qualityUp", scope: "random", color: "any",
    cost: REROLL_COST
  });
  actions.push({
    id: "qualityUpTwoDownOne-any",
    label: "Wildcard · increase two qualities, reduce one",
    target: "qualityUpTwoDownOne", scope: "random", color: "any",
    cost: REROLL_COST
  });

  return actions;
}

function targetSlots(
  banner: Emblem[],
  role: Role,
  action: RerollAction,
  random: () => number
): number[] {
  const indices = banner
    .map((_, i) => i)
    .filter((i) => action.color === "any" || BANNER_SLOTS[role][i] === action.color);
  if (!indices.length) return [];
  switch (action.scope) {
    case "all": return indices;
    case "first": return [indices[0]];
    case "last": return [indices[indices.length - 1]];
    default: return [indices[Math.floor(random() * indices.length)]];
  }
}

/** Applies one reroll action, returning a new banner. Never mutates the input. */
export function applyAction(
  banner: Emblem[],
  role: Role,
  action: RerollAction,
  random: () => number
): Emblem[] {
  const next = banner.map((e) => ({ ...e }));
  const slots = targetSlots(next, role, action, random);

  if (action.target === "qualityUp" || action.target === "qualityUpTwoDownOne") {
    // You do only what is possible, and what is possible is often forced.
    //
    // A tier V cannot be raised and a tier I cannot be lowered, so the wildcard
    // works out which emblems it CAN act on - from the tiers as they are, before
    // anything moves - and chooses uniformly among those eligible targets.
    //
    //   I  III  V      raise 2, lower 1  ->  raise the I and the III, lower the V
    //   III III  V     raise 2, lower 1  ->  raise both IIIs, lower the V
    //   V   V  II      raise 2, lower 1  ->  only the II can rise, so raise 1, lower 1
    //   I   I   I      raise 2, lower 1  ->  nothing can fall, so raise 2
    //
    // Where the new tier lands is then random among the ones still open: a
    // raised II can become III, IV or V; a lowered IV can become I, II or III.
    const upCount = action.target === "qualityUp" ? 1 : 2;
    const order = next.map((_, i) => i);
    const takeRandom = (pool: number[], count: number): number[] => {
      const remaining = [...pool];
      const chosen: number[] = [];
      while (chosen.length < count && remaining.length) {
        chosen.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
      }
      return chosen;
    };

    // Decided on the original banner, so a raise cannot change what gets lowered.
    const raiseTargets = takeRandom(order.filter((i) => next[i].tier !== "V"), upCount);
    const lowerTarget = action.target === "qualityUpTwoDownOne"
      ? takeRandom(order.filter((i) => next[i].tier !== "I" && !raiseTargets.includes(i)), 1)[0]
        // If every lowerable emblem is already being raised, the reduction has
        // to fall on one of them.
        ?? takeRandom(order.filter((i) => next[i].tier !== "I"), 1)[0]
      : undefined;

    for (const i of raiseTargets) {
      const above = qualityOutcomes(next[i].tier, "increase").map(({ tier }) => tier);
      next[i].tier = pickWeightedTier(above, random());
    }
    if (lowerTarget !== undefined) {
      const below = qualityOutcomes(next[lowerTarget].tier, "decrease").map(({ tier }) => tier);
      if (below.length) next[lowerTarget].tier = pickWeightedTier(below, random());
    }
    return next;
  }

  for (const slot of slots) {
    if (action.target === "tier") {
      next[slot].tier = pickWeightedTier(tierOptions(next[slot].tier), random());
    } else if (action.target === "trait") {
      next[slot].trait = pick(traitOptions(next[slot].trait, ROLLABLE_TRAITS), random());
    } else {
      // A stat already on the banner cannot be rolled again.
      const taken = new Set(next.filter((_, i) => i !== slot).map((e) => e.stat));
      const pool = statsForColor(BANNER_SLOTS[role][slot]).filter((s) => !taken.has(s));
      if (pool.length) next[slot].stat = pool[Math.floor(random() * pool.length)];
    }
  }
  return next;
}

/**
 * Every outcome a reroll can produce, with its exact probability.
 *
 * Rerolls have small outcome spaces. Rerolling one emblem's quality has five
 * outcomes; its stat has at most five; its trait six. Even "all three red
 * qualities" is 5^3 = 125. So the whole distribution can be enumerated rather
 * than sampled, which makes the numbers exact instead of approximate and means
 * the page is doing arithmetic rather than running a simulation.
 *
 * Returns null when the space is too large to enumerate, and the caller falls
 * back to sampling.
 */
export function enumerateOutcomes(
  banner: Emblem[],
  role: Role,
  action: RerollAction,
  limit = 4096
): Array<{ banner: Emblem[]; probability: number }> | null {
  if (action.target === "qualityUp" || action.target === "qualityUpTwoDownOne") {
    return null; // these pick slots at random; enumeration would be a rewrite
  }

  const slots = action.color === "any"
    ? banner.map((_, i) => i)
    : banner.map((_, i) => i).filter((i) => BANNER_SLOTS[role][i] === action.color);
  if (!slots.length) return null;

  let targets: number[];
  switch (action.scope) {
    case "all": targets = slots; break;
    case "first": targets = [slots[0]]; break;
    case "last": targets = [slots[slots.length - 1]]; break;
    default: targets = slots; break; // "random": one of these, each equally likely
  }

  /** Possible values for one slot, with probabilities. */
  const optionsFor = (slot: number, sofar: Emblem[]): Array<[Emblem, number]> => {
    if (action.target === "tier") {
      return tierOutcomes(sofar[slot].tier)
        .map(({ tier, probability }) => [{ ...sofar[slot], tier }, probability]);
    }
    if (action.target === "trait") {
      const options = traitOptions(sofar[slot].trait, ROLLABLE_TRAITS);
      return options.map((trait) => [{ ...sofar[slot], trait }, 1 / options.length]);
    }
    const taken = new Set(sofar.filter((_, i) => i !== slot).map((e) => e.stat));
    const pool = statsForColor(BANNER_SLOTS[role][slot]).filter((x) => !taken.has(x));
    if (!pool.length) return [[sofar[slot], 1]];
    return pool.map((stat) => [{ ...sofar[slot], stat }, 1 / pool.length]);
  };

  const out: Array<{ banner: Emblem[]; probability: number }> = [];

  /** "random" rerolls one of the eligible slots, chosen uniformly. */
  const slotGroups: Array<{ slots: number[]; weight: number }> =
    action.scope === "random"
      ? targets.map((i) => ({ slots: [i], weight: 1 / targets.length }))
      : [{ slots: targets, weight: 1 }];

  for (const group of slotGroups) {
    // Cartesian product over the slots this branch rerolls.
    let states: Array<{ banner: Emblem[]; probability: number }> =
      [{ banner: banner.map((e) => ({ ...e })), probability: group.weight }];

    for (const slot of group.slots) {
      const next: typeof states = [];
      for (const state of states) {
        for (const [emblem, p] of optionsFor(slot, state.banner)) {
          const copy = state.banner.map((e) => ({ ...e }));
          copy[slot] = emblem;
          next.push({ banner: copy, probability: state.probability * p });
        }
      }
      states = next;
      if (states.length > limit) return null;
    }
    out.push(...states);
    if (out.length > limit) return null;
  }

  return out;
}

export type ActionOutcome = {
  action: RerollAction;
  /** Mean banner value one roll from now. */
  mean: number;
  median: number;
  p10: number;
  p90: number;
  /** Share of single rolls that came out better than the current banner. */
  improveChance: number;
  /** mean - current. Negative means a single roll is expected to hurt. */
  delta: number;
  /** delta per token spent. */
  perToken: number;
  /** Sampling runs used. Zero when the outcome space was enumerated exactly. */
  runs: number;
  /** True when every outcome was enumerated rather than sampled. */
  exact: boolean;

  // --- planning all the way to the end of the token budget ---

  /** How many times this action can be bought with the tokens on hand. */
  attempts: number;
  /**
   * curve[k-1] is what the banner is worth when you may roll this action up to
   * k more times and stop as soon as you like. See stoppingCurve.
   */
  curve: number[];
  /** Value of committing the budget to this action. Never below standing pat. */
  planValue: number;
  /** planValue - current. This is the column to rank on. */
  planDelta: number;
  /** Fewest attempts before the plan beats standing pat, or null if it never does. */
  breakEvenAttempts: number | null;
};

/** No sane budget buys more than this many rolls of one action. */
const MAX_ATTEMPTS = 60;

/**
 * Optimal stopping over repeated rolls of the same action.
 *
 * A single roll can be a bad bet while the same roll repeated is a good one.
 * You never get the old emblem back, but you do decide after every roll whether
 * to stop, and that option is what a one-step average throws away. With k
 * attempts left the banner is worth
 *
 *     c_1 = E[X]
 *     c_k = E[max(X, c_(k-1))]
 *
 * where X is the value of the banner after one roll. c_k climbs towards the
 * best outcome the action can reach, so "reroll the one bad red" can be clearly
 * worth it across a 40 token budget even though one roll loses on average.
 * Rolling is worth starting at all exactly when c_attempts beats what you hold.
 *
 * The recursion assumes the outcome distribution stays put as the rest of the
 * banner changes around the rolled slot. That is close to exact for a single
 * slot and loosest for the "all" scopes, which reroll the very emblems the
 * distribution was measured against.
 */
export function stoppingCurve(outcomes: number[], attempts: number): number[] {
  if (!outcomes.length || attempts < 1) return [];
  const sorted = [...outcomes].sort((a, b) => a - b);
  const prefix = new Float64Array(sorted.length + 1);
  for (let i = 0; i < sorted.length; i += 1) prefix[i + 1] = prefix[i] + sorted[i];
  const total = prefix[sorted.length];

  /** E[max(X, threshold)] over the sampled outcomes. */
  const expectedMax = (threshold: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= threshold) lo = mid + 1;
      else hi = mid;
    }
    return (lo * threshold + (total - prefix[lo])) / sorted.length;
  };

  const curve = [total / sorted.length];
  for (let k = 2; k <= attempts; k += 1) curve.push(expectedMax(curve[curve.length - 1]));
  return curve;
}

/**
 * Monte Carlo over one reroll action, reported both one roll ahead and over the
 * whole remaining token budget.
 *
 * `valueOf` scores a banner however the caller wants - normally the projected
 * tournament total of the best player for the role at the chosen risk level,
 * so the advice follows the same risk appetite as the ranking.
 */
export function evaluateAction(
  banner: Emblem[],
  role: Role,
  action: RerollAction,
  valueOf: (banner: Emblem[]) => number,
  runs = 3000,
  tokens: number = STAGE_TOKENS.playoffs,
  seed = "reroll"
): ActionOutcome {
  const current = valueOf(banner);
  const results: number[] = [];
  let better = 0;

  // Exact where the outcome space allows it, sampled only where it does not.
  const exact = enumerateOutcomes(banner, role, action);
  if (exact) {
    // Weighted outcomes are expanded into a flat sample so every downstream
    // percentile and stopping curve works unchanged. 2000 slots is finer than
    // any probability the tables produce.
    const GRAIN = 2000;
    for (const { banner: rolled, probability } of exact) {
      const value = hasDuplicateStats(rolled) ? current : valueOf(rolled);
      const copies = Math.max(1, Math.round(probability * GRAIN));
      for (let i = 0; i < copies; i += 1) results.push(value);
      if (value > current) better += copies;
    }
  } else {
    const random = seededRandom(`${seed}::${action.id}::${JSON.stringify(banner)}::${runs}`);
    for (let i = 0; i < runs; i += 1) {
      const rolled = applyAction(banner, role, action, random);
      // Should never happen, but a duplicate banner is worthless if it does.
      const value = hasDuplicateStats(rolled) ? current : valueOf(rolled);
      results.push(value);
      if (value > current) better += 1;
    }
  }

  results.sort((a, b) => a - b);
  const at = (p: number) => results[Math.min(results.length - 1, Math.floor((p / 100) * results.length))];
  const mean = results.reduce((a, b) => a + b, 0) / results.length;

  const attempts = Math.min(MAX_ATTEMPTS, Math.floor(tokens / Math.max(1, action.cost)));
  const curve = stoppingCurve(results, attempts);
  const planValue = Math.max(current, curve[curve.length - 1] ?? current);
  const breakEven = curve.findIndex((value) => value > current);

  return {
    action,
    mean,
    median: at(50),
    p10: at(10),
    p90: at(90),
    improveChance: better / results.length,
    delta: mean - current,
    perToken: (mean - current) / Math.max(1, action.cost),
    runs: exact ? 0 : runs,
    exact: Boolean(exact),
    attempts,
    curve,
    planValue,
    planDelta: planValue - current,
    breakEvenAttempts: breakEven === -1 ? null : breakEven + 1
  };
}

/**
 * Evaluates several candidate actions and ranks them by what they are worth
 * once the whole budget is played out - not by the next roll alone.
 */
export function compareActions(
  banner: Emblem[],
  role: Role,
  actions: RerollAction[],
  valueOf: (banner: Emblem[]) => number,
  runs = 3000,
  tokens: number = STAGE_TOKENS.playoffs
): ActionOutcome[] {
  return actions
    .map((action) => evaluateAction(banner, role, action, valueOf, runs, tokens))
    .sort((a, b) => b.planDelta - a.planDelta || b.perToken - a.perToken);
}

/**
 * Doing nothing. Always on the menu, always free, and often correct.
 *
 * A comparison without it is misleading: every option looks like the best
 * option when the only alternative is another option.
 */
export const SKIP_ACTION: RerollAction = {
  id: "skip",
  label: "Skip — keep the tokens",
  target: "skip",
  scope: "random",
  color: "any",
  cost: 0
};

/**
 * One reroll offer: an action, and which of the three banners it lands on.
 *
 * The token pool is shared across Core, Mid and Support - 40 for the group
 * stage, 30 for the main event, for the whole roster rather than per banner.
 * So the real question is never "is this reroll good" but "is this reroll, on
 * this banner, the best thing to spend the roster's tokens on".
 */
export type RosterOffer = { role: Role; action: RerollAction };

export type RosterOutcome = ActionOutcome & {
  role: Role;
  /** Roster total after the reroll: this role's outcome plus the other two. */
  rosterMean: number;
  /** Roster total once the budget is played out on this option. */
  rosterPlanValue: number;
};

/**
 * Compares reroll offers across all three banners against one shared budget.
 *
 * `valueOf` scores a single role's banner. `others` is what the rest of the
 * roster is already worth, so the numbers shown are roster totals and the
 * three roles are directly comparable.
 *
 * Skip is scored as standing pat: it can never lose, which is exactly why it
 * belongs in the table.
 */
export function compareRosterOffers(
  offers: RosterOffer[],
  banners: Record<Role, Emblem[]>,
  valueOf: (role: Role, banner: Emblem[]) => number,
  tokens: number,
  runs = 800
): RosterOutcome[] {
  const current: Record<string, number> = {};
  for (const role of Object.keys(banners) as Role[]) {
    current[role] = valueOf(role, banners[role]);
  }
  const rosterTotal = Object.values(current).reduce((sum, v) => sum + v, 0);

  const rows: RosterOutcome[] = [];
  for (const { role, action } of offers) {
    if (action.target === "skip") {
      rows.push({
        action, role, mean: current[role], median: current[role],
        p10: current[role], p90: current[role], improveChance: 0, delta: 0,
        perToken: 0, runs: 0, exact: true, attempts: 0, curve: [], planValue: current[role],
        planDelta: 0, breakEvenAttempts: null,
        rosterMean: rosterTotal, rosterPlanValue: rosterTotal
      });
      continue;
    }
    const outcome = evaluateAction(
      banners[role], role, action, (b) => valueOf(role, b), runs, tokens
    );
    const rest = rosterTotal - current[role];
    rows.push({
      ...outcome, role,
      rosterMean: outcome.mean + rest,
      rosterPlanValue: outcome.planValue + rest
    });
  }

  // Best over the whole budget first; skip sits wherever it lands, which is
  // top whenever nothing on offer is worth the tokens.
  return rows.sort((a, b) => b.planDelta - a.planDelta || b.perToken - a.perToken);
}

/** Rolls a fresh random banner, the way a stage starts. */
export function randomBanner(role: Role, slots: number, random: () => number): Emblem[] {
  const used = new Set<StatKey>();
  return BANNER_SLOTS[role].slice(0, slots).map((color) => {
    const pool = statsForColor(color).filter((s) => !used.has(s));
    const stat = pool[Math.floor(random() * pool.length)] ?? statsForColor(color)[0];
    used.add(stat);
    return {
      stat,
      // Fresh emblems are a separate draw from quality rerolls. Until measured
      // otherwise, all five initial qualities are modelled 1:1:1:1:1.
      tier: pick(TIERS_ALL, random()),
      trait: pick(ROLLABLE_TRAITS, random())
    };
  });
}
