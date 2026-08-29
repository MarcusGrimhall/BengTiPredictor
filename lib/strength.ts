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
