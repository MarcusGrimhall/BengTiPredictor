// The TI main event bracket, which has the same shape every year:
// eight teams, double elimination, Bo3 throughout with a Bo5 grand final.
//
// We simulate it from the teams' Elo ratings to get the one number the
// fantasy side is missing: how many maps each team is expected to play.
// A player only scores in games their team actually plays, so this is what
// turns a per-game projection into a tournament projection.

import { buildStructure, simulate, TeamRatings } from "./bracket";
import { DEFAULT_ELO } from "./elo";
import type { TeamEntry } from "./data";

export const TI_MAIN_EVENT_TEAMS = 8;

export type MapsProjection = {
  mapsByTeam: Record<string, number>;
  seriesByTeam: Record<string, number>;
  championByTeam: Record<string, number>;
  seeds: string[];
};

/** Seeds strongest against weakest, the way a bracket is normally drawn. */
export function seedByRating(teams: TeamEntry[], count: number): string[] {
  const pool = [...teams]
    .filter((t) => t.elo != null)
    .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
    .slice(0, count);
  const ordered: string[] = [];
  for (let i = 0; i < pool.length / 2; i += 1) {
    ordered.push(pool[i].name, pool[pool.length - 1 - i].name);
  }
  return ordered.slice(0, count);
}

export function projectMainEvent(teams: TeamEntry[], runs = 20000): MapsProjection {
  const seeds = seedByRating(teams, TI_MAIN_EVENT_TEAMS);
  const empty: MapsProjection = { mapsByTeam: {}, seriesByTeam: {}, championByTeam: {}, seeds };
  if (seeds.length < TI_MAIN_EVENT_TEAMS) return empty;

  const ratings: TeamRatings = Object.fromEntries(
    teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO])
  );
  const structure = buildStructure(TI_MAIN_EVENT_TEAMS, "double");
  const sim = simulate(structure, seeds, {}, ratings, runs);

  const mapsByTeam: Record<string, number> = {};
  const seriesByTeam: Record<string, number> = {};
  const championByTeam: Record<string, number> = {};
  for (const [team, outlook] of Object.entries(sim.teams)) {
    mapsByTeam[team] = Number(outlook.maps.toFixed(2));
    seriesByTeam[team] = Number(outlook.series.toFixed(2));
    championByTeam[team] = outlook.champion;
  }
  return { mapsByTeam, seriesByTeam, championByTeam, seeds };
}
