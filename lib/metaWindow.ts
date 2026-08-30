// Pooling several tournaments into one sample.
//
// Looking at a single event answers "what happened there". Looking at the last
// six months of professional play answers "what is the game like now", which is
// the more useful question when picking a banner - a stat is worth however much
// of it players currently produce, and that moves with the patch.
//
// Entries are merged by identity across events. Series ids are only unique
// within a tournament, so they are namespaced on the way in; without that, two
// unrelated series from different events would be collapsed into one.

import { PlayerEntry } from "./fantasy";
import type { StatKey } from "./scoring";

export type WindowSource = {
  leagueId: number;
  leagueName: string;
  date: number;
  maps: number;
  entries: PlayerEntry[];
};

/**
 * The distinct windows there are, given the events on hand.
 *
 * A window is only ever "the most recent k tournaments" - asking for seven
 * months and asking for eight gives the same sample if no event sits between
 * them. So one spread is precomputed per possible k, and any month the user
 * types resolves to the smallest k that reaches back that far. That makes the
 * control continuous without precomputing a spread for every integer.
 */
export function windowCuts(sources: Array<{ date: number }>): number[] {
  return [...new Set(sources.map((s) => s.date))].sort((a, b) => b - a);
}

/** Months of history a cut represents, relative to the newest event. */
export function monthsOf(cut: number, newest: number): number {
  return Math.max(1, Math.round((newest - cut) / (30 * 86400)) + 1);
}

/**
 * Merges every event inside the window into one set of entries.
 *
 * An entry keeps the team it had most recently, since that is who it would be
 * picked as today, but its games come from wherever it played them.
 */
export function poolWindow(sources: WindowSource[], cutoff: number): {
  entries: PlayerEntry[];
  events: WindowSource[];
} {
  const events = sources.filter((s) => s.date >= cutoff).sort((a, b) => a.date - b.date);

  const merged = new Map<string, PlayerEntry>();
  for (const event of events) {
    for (const entry of event.entries) {
      const existing = merged.get(entry.id);
      // Series ids repeat across tournaments; namespace them by league.
      const series = (entry.gameSeries ?? entry.gameLines.map((_, i) => i))
        .map((sid) => event.leagueId * 1e7 + sid);

      if (!existing) {
        merged.set(entry.id, {
          ...entry,
          gameLines: [...entry.gameLines],
          gameSeries: series,
          gameMatches: entry.gameMatches ? [...entry.gameMatches] : undefined,
          games: entry.gameLines.length
        });
        continue;
      }
      existing.gameLines.push(...entry.gameLines);
      existing.gameSeries!.push(...series);
      if (existing.gameMatches && entry.gameMatches) existing.gameMatches.push(...entry.gameMatches);
      existing.games = existing.gameLines.length;
      // Later events win the team name - who they play for now.
      existing.teamName = entry.teamName;
      existing.name = entry.name;
    }
  }

  return { entries: [...merged.values()], events };
}

/** Per-stat averages recomputed over the pooled games. */
export function pooledPerGame(entry: PlayerEntry, stats: StatKey[]): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>;
  const n = entry.gameLines.length || 1;
  for (const stat of stats) {
    out[stat] = entry.gameLines.reduce((sum, line) => sum + (line[stat] ?? 0), 0) / n;
  }
  return out;
}
