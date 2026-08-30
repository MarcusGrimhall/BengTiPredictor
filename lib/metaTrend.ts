// How much a stat is worth, and how that moves with the patch.
//
// A fantasy stat is not worth a fixed amount. Last hits pay 3 each, but how
// many a core gets in a series depends on how long games run, and that is a
// property of the patch rather than of the player. A fast meta makes last hits
// and GPM worth less and first blood worth more; a slow one does the reverse.
//
// Emblem values are therefore a moving target, and picking a banner from a
// year-old sample is picking for a game that is no longer being played. This
// measures the movement directly: the same stat, scored the same way, across
// every event fetched, in date order.

import { Emblem, PlayerEntry, matchScores } from "./fantasy";
import { Role, StatKey } from "./scoring";

export type StatPeriod = {
  leagueId: number;
  leagueName: string;
  /** Unix seconds of the event's first match. */
  date: number;
  maps: number;
  /** Mean per-series base points, per stat, for entries in this role. */
  byStat: Record<string, number>;
  entries: number;
};

/** Tier I is the lowest an emblem can be; its +10% is divided back out. */
const TIER_I = 1.1;

/**
 * Mean per-series value of each stat, for one role at one event.
 *
 * Base rate throughout - no tier, no trait - so two events are comparable and
 * the only thing moving is how much of the stat players actually produced.
 */
export function statPeriod(
  entries: PlayerEntry[],
  role: Role,
  stats: StatKey[]
): Record<string, number> {
  const pool = entries.filter((e) => e.role === role);
  const out: Record<string, number> = {};
  if (!pool.length) return out;

  for (const stat of stats) {
    const emblem: Emblem[] = [{ stat, tier: "I", trait: "none" }];
    let total = 0;
    let n = 0;
    for (const entry of pool) {
      const series = matchScores(entry, emblem);
      if (!series.length) continue;
      total += series.reduce((a, b) => a + b, 0) / series.length / TIER_I;
      n += 1;
    }
    out[stat] = n ? total / n : 0;
  }
  return out;
}

export type StatTrend = {
  stat: StatKey;
  /** Mean over the selected window. */
  recent: number;
  /** Mean over everything before the window. */
  earlier: number;
  /** recent / earlier - 1. Positive means the stat is paying more lately. */
  change: number;
  /** Events contributing to `recent`. */
  events: number;
};

/**
 * Compares a recent window against everything older.
 *
 * `months` is how far back "recent" reaches from the newest event in the data.
 * A stat whose change is strongly positive is one the current patch rewards
 * more than the game did before it.
 */
export function statTrend(
  periods: StatPeriod[],
  stats: StatKey[],
  months: number
): StatTrend[] {
  if (!periods.length) return [];
  const newest = Math.max(...periods.map((p) => p.date));
  const cutoff = newest - months * 30 * 86400;

  const recent = periods.filter((p) => p.date >= cutoff);
  const earlier = periods.filter((p) => p.date < cutoff);

  // Weighted by maps, so a 231-map event counts for more than a 96-map one.
  const weighted = (set: StatPeriod[], stat: StatKey) => {
    let total = 0;
    let weight = 0;
    for (const p of set) {
      const v = p.byStat[stat];
      if (v === undefined || !p.maps) continue;
      total += v * p.maps;
      weight += p.maps;
    }
    return weight ? total / weight : 0;
  };

  return stats.map((stat) => {
    const r = weighted(recent, stat);
    const e = weighted(earlier, stat);
    return {
      stat,
      recent: r,
      earlier: e,
      change: e > 0 ? r / e - 1 : 0,
      events: recent.length
    };
  }).sort((a, b) => b.recent - a.recent);
}
