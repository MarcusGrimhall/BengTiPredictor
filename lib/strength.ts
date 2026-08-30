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
 * Team strength going into an event, from results before it.
 *
 * The alternative is a rating measured now, which for an older event is a
 * rating shaped by a year of things that had not happened yet. The alternative
 * to that is final placement, which makes any "do strong teams do more of X"
 * comparison circular - of course the teams that won did well.
 *
 * So strength is taken from the pre-event tournaments the model was fitted on:
 * a team's map win rate across them, shrunk towards even for teams with few
 * games so a 2-0 start does not outrank a season of play.
 */
export function preEventStrength(
  results: Array<{ radiant: number; dire: number; radiantWin: boolean }>,
  teamNames: Record<number, string>,
  prior = 12
): Record<string, { winRate: number; maps: number }> {
  const tally = new Map<number, { won: number; played: number }>();
  const bump = (id: number, won: boolean) => {
    const t = tally.get(id) ?? { won: 0, played: 0 };
    t.played += 1;
    if (won) t.won += 1;
    tally.set(id, t);
  };
  for (const r of results) {
    bump(r.radiant, r.radiantWin);
    bump(r.dire, !r.radiantWin);
  }

  const out: Record<string, { winRate: number; maps: number }> = {};
  for (const [id, t] of tally) {
    const name = teamNames[id];
    if (!name) continue;
    // Shrunk towards 0.5: a team with `prior` fewer maps than that is pulled
    // back accordingly, so a small sample cannot top the table on its own.
    out[name] = {
      winRate: (t.won + prior * 0.5) / (t.played + prior),
      maps: t.played
    };
  }
  return out;
}
