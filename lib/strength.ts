// Adjusting a projection for who the player will actually be facing.
//
// A player's past scores were earned against whatever opposition they happened
// to draw. At TI they face a harder field, so a player whose numbers came from
// beating weak teams should be discounted, and one who earned them against the
// best should not.
//
// The size of that effect is measured, not assumed. Regressing each map's score
// against the Elo gap in that match - normalised by the player's own mean, so
// "good players are on good teams" cannot leak in - over 2,910 player-games
// from TI 2025 and TI 2026:
//
//     score / own mean  =  1 + 0.0184 x (Elo edge / 100)
//     n = 2910,  SE 0.0045,  t = 4.05,  r = 0.075
//
// So a 200-point Elo advantage is worth about 3.7% on a per-map score. The
// effect is real - t of 4 is not noise - but it is small, and the honest
// reading is that matchup quality moves a fantasy score much less than who the
// player is. A naive bucket average suggests +10%, but most of that is the
// confound: strong teams have good players on them.

import { DEFAULT_ELO } from "./elo";
import type { TeamEntry } from "./data";

/** Fitted score multiplier per 100 points of Elo advantage. */
export const STRENGTH_PER_100_ELO = 0.0184;

/** Standard error of the fit, for anyone wanting to know how firm it is. */
export const STRENGTH_STANDARD_ERROR = 0.0045;

/** Beyond this the fit is extrapolating past the data it was measured on. */
const MAX_EDGE = 400;

/**
 * Score multiplier for a team facing a field of a given average strength.
 *
 * `edge` is the team's Elo minus the mean Elo of the opposition it will face.
 */
export function strengthMultiplier(edge: number): number {
  const clamped = Math.max(-MAX_EDGE, Math.min(MAX_EDGE, edge));
  return 1 + STRENGTH_PER_100_ELO * (clamped / 100);
}

/**
 * Per-team score multipliers for an event.
 *
 * Each team is compared against the mean rating of the field it is entering.
 * A team that is 200 points clear of the field gets about +3.7%; one 200 points
 * behind gets about -3.7%.
 */
export function strengthByTeam(teams: TeamEntry[]): Record<string, number> {
  const rated = teams.filter((t) => t.name);
  if (rated.length < 2) return {};
  const field = rated.reduce((sum, t) => sum + (t.elo ?? DEFAULT_ELO), 0) / rated.length;
  return Object.fromEntries(
    rated.map((t) => [t.name, strengthMultiplier((t.elo ?? DEFAULT_ELO) - field)])
  );
}

/**
 * Team strength going into an event: an Elo rating built from the matches
 * before it, and nothing else.
 *
 * A win rate will not do. Beating a bottom seed and beating the eventual
 * champion count the same in a win rate, so a team that drew an easy schedule
 * outranks one that played everybody. Elo prices each result by who it was
 * against, which is the whole point of using it.
 *
 * The other two candidates are worse. The stored rating is measured now, so for
 * an older event it has been reshaped by a year of matches that had not
 * happened yet. Final placement makes any "do strong teams produce more of X"
 * comparison circular - of course the teams that won did well.
 *
 * Ratings start level and update after every map, so a team's number is the sum
 * of who it beat and who beat it across the pre-event season.
 */
export const PRE_EVENT_K = 24;
export const PRE_EVENT_START = 1300;

export type TeamStrength = {
  rating: number;
  maps: number;
  /** Mean rating of the opposition faced - how hard the schedule was. */
  schedule: number;
};

export function preEventStrength(
  results: Array<{ radiant: number; dire: number; radiantWin: boolean }>,
  teamNames: Record<number, string>,
  minMaps = 15
): Record<string, TeamStrength> {
  const rating = new Map<number, number>();
  const maps = new Map<number, number>();
  const facedTotal = new Map<number, number>();
  const get = (id: number) => rating.get(id) ?? PRE_EVENT_START;

  for (const r of results) {
    const ra = get(r.radiant);
    const rb = get(r.dire);
    const expectedA = 1 / (1 + 10 ** ((rb - ra) / 400));
    const scoreA = r.radiantWin ? 1 : 0;

    rating.set(r.radiant, ra + PRE_EVENT_K * (scoreA - expectedA));
    rating.set(r.dire, rb + PRE_EVENT_K * ((1 - scoreA) - (1 - expectedA)));

    for (const [id, faced] of [[r.radiant, rb], [r.dire, ra]] as const) {
      maps.set(id, (maps.get(id) ?? 0) + 1);
      facedTotal.set(id, (facedTotal.get(id) ?? 0) + faced);
    }
  }

  const out: Record<string, TeamStrength> = {};
  for (const [id, value] of rating) {
    const name = teamNames[id];
    const played = maps.get(id) ?? 0;
    // A handful of maps is not a rating; those teams are left out rather than
    // allowed to top the table on a hot start.
    if (!name || played < minMaps) continue;
    out[name] = {
      rating: Math.round(value),
      maps: played,
      schedule: Math.round((facedTotal.get(id) ?? 0) / played)
    };
  }
  return out;
}
