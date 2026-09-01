// Trusting a measurement as far as it has been shown to go.
//
// The ranking predicts what an entry will produce from what it has produced.
// That is only sound where the stat is a property of the player. Measured over
// five Internationals (`npm run persistence`), it plainly is for some stats and
// plainly is not for others: GPM comes back at 0.93 for a core, Tormentor at
// 0.00 for a support. Ranking on the second is ranking on who happened to get
// the last hit.
//
// So each stat is trusted in proportion to how far it repeats. A player's
// estimate is pulled toward the field average by the amount the measurement is
// unreliable - the standard regression-to-the-mean correction, with the weight
// measured rather than picked.
//
//   estimate = fieldMean + reliability x (observed - fieldMean)
//
// At reliability 1 the observation stands. At 0 every entry is the field
// average, which is the honest answer when a stat says nothing about who will
// produce it next.
//
// Two things this deliberately does NOT do.
//
// It does not touch game-to-game spread. Only the player's LEVEL is shrunk;
// each game keeps its distance from that player's own mean, so the floor and
// ceiling the risk slider reads still come from real variation. Shrinking the
// spread as well would make everyone look falsely consistent.
//
// It does not shrink the description. `/information` reports what entries
// actually produced and must stay raw - shrinkage belongs on the prediction,
// not on the record of what happened.

import { PlayerEntry } from "./fantasy";
import { Role, StatKey, STAT_KEYS } from "./scoring";

export type Reliability = {
  builtAt?: string;
  method?: string;
  roles: Partial<Record<Role, Partial<Record<StatKey, number>>>>;
};

/**
 * Shrinks every entry's stat level toward the field average for its role.
 *
 * Applied at PLAYER level, before pairs are built. That matters: a duo is the
 * average of two players and is therefore a more reliable measurement than
 * either, so applying a player-level weight to an already-averaged pair would
 * shrink it twice.
 *
 * A stat with no measured reliability is left alone rather than guessed at.
 * Returns new entries; the input is not mutated.
 */
export function shrinkEntries(entries: PlayerEntry[], table: Reliability | null): PlayerEntry[] {
  if (!table?.roles) return entries;

  const out = entries.map((e) => ({
    ...e,
    perGame: { ...e.perGame },
    gameLines: e.gameLines?.map((l) => ({ ...l }))
  })) as PlayerEntry[];

  const roles = [...new Set(out.map((e) => e.role))] as Role[];
  for (const role of roles) {
    const weights = table.roles[role];
    if (!weights) continue;
    const pool = out.filter((e) => e.role === role);
    if (pool.length < 2) continue;

    for (const stat of STAT_KEYS) {
      const w = weights[stat];
      // Unmeasured, or already fully trusted: nothing to do.
      if (w === undefined || w >= 1) continue;
      const weight = Math.max(0, Math.min(1, w));

      const fieldMean =
        pool.reduce((sum, e) => sum + (e.perGame[stat] ?? 0), 0) / pool.length;

      for (const entry of pool) {
        const observed = entry.perGame[stat] ?? 0;
        const target = fieldMean + weight * (observed - fieldMean);
        const delta = target - observed;
        if (delta === 0) continue;

        const lines = entry.gameLines;
        if (lines?.length) {
          // Shift each game by the same amount, so the player's own spread
          // survives, then clamp: no raw stat can be negative.
          for (const line of lines) line[stat] = Math.max(0, (line[stat] ?? 0) + delta);
          // Re-read the mean off the clamped games so perGame and gameLines
          // cannot disagree - clamping makes the shift slightly non-linear.
          entry.perGame[stat] =
            lines.reduce((sum, l) => sum + (l[stat] ?? 0), 0) / lines.length;
        } else {
          entry.perGame[stat] = Math.max(0, target);
        }
      }
    }
  }
  return out;
}
