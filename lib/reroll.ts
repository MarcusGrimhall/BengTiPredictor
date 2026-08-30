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
// IMPORTANT - what is assumed rather than known:
//   * TOKEN COSTS. Valve does not publish them and no guide lists them, so the
//     costs below are placeholders. Correct them in ACTION_COSTS.
//   * TIER_WEIGHTS and TRAIT_WEIGHTS. The roll distributions are not published
//     either. These are reasonable guesses, not measured values.
// Everything else - banner rules, scoring, the uniqueness constraint - is exact.

import { seededRandom } from "./rng";
import { Emblem, Tier, Trait, hasDuplicateStats } from "./fantasy";
import { EmblemColor, Role, StatKey, BANNER_SLOTS, statsForColor } from "./scoring";
import { STAGE_TOKENS } from "./stages";

/** Probability of each tier on a fresh quality roll. ASSUMPTION - see above. */
export const TIER_WEIGHTS: Record<Tier, number> = {
  I: 0.40, II: 0.28, III: 0.18, IV: 0.10, V: 0.04
};

/** Probability of each trait on a fresh trait roll. ASSUMPTION - see above. */
export const TRAIT_WEIGHTS: Record<Trait, number> = {
  none: 0.40, fractal: 0.12, benevolent: 0.12, vampiric: 0.12, unique: 0.12, friendly: 0.12
};

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

/** Placeholder token costs. Replace with the real menu prices. */
export const ACTION_COSTS: Record<string, number> = {
  "stat-random": 1, "stat-first": 2, "stat-last": 2, "stat-all": 4,
  "tier-random": 1, "tier-first": 2, "tier-last": 2, "tier-all": 4,
  "trait-random": 1, "trait-first": 2, "trait-last": 2, "trait-all": 4,
  "qualityUp-any": 3, "qualityUpTwoDownOne-any": 4
};

const TIERS_ORDER: Tier[] = ["I", "II", "III", "IV", "V"];

function pickWeighted<T extends string>(weights: Record<T, number>, roll: number): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let threshold = roll * total;
  for (const [key, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Every action offered for a role, given how many slots the stage has. */
export function actionCatalogue(role: Role, slots: number): RerollAction[] {
  const colors = Array.from(new Set(BANNER_SLOTS[role].slice(0, slots)));
  const actions: RerollAction[] = [];

  const targets: Array<{ key: RerollTarget; word: string }> = [
    { key: "stat", word: "stat" },
    { key: "tier", word: "quality" },
    { key: "trait", word: "trait" }
  ];
  const scopes: Array<{ key: RerollScope; word: string }> = [
    { key: "random", word: "a random" },
    { key: "first", word: "the first" },
    { key: "last", word: "the last" },
    { key: "all", word: "all" }
  ];

  for (const color of colors) {
    const count = BANNER_SLOTS[role].slice(0, slots).filter((c) => c === color).length;
    for (const target of targets) {
      for (const scope of scopes) {
        // "first" and "last" are the same emblem when a colour has only one.
        if (count < 2 && (scope.key === "last" || scope.key === "all")) continue;
        actions.push({
          id: `${target.key}-${scope.key}-${color}`,
          label: `Reroll ${target.word} · ${scope.word} ${color} emblem${scope.key === "all" && count > 1 ? "s" : ""}`,
          target: target.key,
          scope: scope.key,
          color,
          cost: ACTION_COSTS[`${target.key}-${scope.key}`] ?? 1
        });
      }
    }
  }

  actions.push({
    id: "qualityUp-any",
    label: "Wildcard · randomly increase one quality",
    target: "qualityUp", scope: "random", color: "any",
    cost: ACTION_COSTS["qualityUp-any"] ?? 3
  });
  actions.push({
    id: "qualityUpTwoDownOne-any",
    label: "Wildcard · increase two qualities, reduce one",
    target: "qualityUpTwoDownOne", scope: "random", color: "any",
    cost: ACTION_COSTS["qualityUpTwoDownOne-any"] ?? 4
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
    // A quality change lands on a random tier out of the ones still available,
    // not one step. Raising a II can give III, IV or V with equal chance;
    // lowering a IV can give I, II or III. A tier V cannot be raised and a
    // tier I cannot be lowered, which is what makes these near-deterministic
    // on a short banner: with one V and two IIs, only the IIs can go up and
    // only the V is worth bringing down.
    const upCount = action.target === "qualityUp" ? 1 : 2;
    const rank = (i: number) => TIERS_ORDER.indexOf(next[i].tier);

    // Raises go to the lowest tiers on the banner, reductions to the highest.
    const raisable = next
      .map((_, i) => i)
      .filter((i) => next[i].tier !== "V")
      .sort((a, b) => rank(a) - rank(b) || (random() < 0.5 ? -1 : 1));
    for (const pos of raisable.slice(0, upCount)) {
      const above = TIERS_ORDER.slice(rank(pos) + 1);
      next[pos].tier = above[Math.floor(random() * above.length)];
    }

    if (action.target === "qualityUpTwoDownOne") {
      const lowerable = next
        .map((_, i) => i)
        .filter((i) => next[i].tier !== "I")
        .sort((a, b) => rank(b) - rank(a) || (random() < 0.5 ? -1 : 1));
      if (lowerable.length) {
        const pos = lowerable[0];
        const below = TIERS_ORDER.slice(0, rank(pos));
        next[pos].tier = below[Math.floor(random() * below.length)];
      }
    }
    return next;
  }

  for (const slot of slots) {
    if (action.target === "tier") {
      next[slot].tier = pickWeighted(TIER_WEIGHTS, random());
    } else if (action.target === "trait") {
      next[slot].trait = pickWeighted(TRAIT_WEIGHTS, random());
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
      const total = Object.values(TIER_WEIGHTS).reduce((a, b) => a + b, 0);
      return TIERS_ORDER.map((tier) => [{ ...sofar[slot], tier }, TIER_WEIGHTS[tier] / total]);
    }
    if (action.target === "trait") {
      const total = Object.values(TRAIT_WEIGHTS).reduce((a, b) => a + b, 0);
      return (Object.keys(TRAIT_WEIGHTS) as Trait[])
        .map((trait) => [{ ...sofar[slot], trait }, TRAIT_WEIGHTS[trait] / total]);
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
      tier: pickWeighted(TIER_WEIGHTS, random()),
      trait: pickWeighted(TRAIT_WEIGHTS, random())
    };
  });
}
