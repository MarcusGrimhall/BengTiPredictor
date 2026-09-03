// The TI main event bracket, which has the same shape every year:
// eight teams, double elimination, Bo3 throughout with a Bo5 grand final.
//
// We simulate it from the teams' Elo ratings to get the one number the
// fantasy side is missing: how many maps each team is expected to play.
// A player only scores in games their team actually plays, so this is what
// turns a per-game projection into a tournament projection.

import { atLeastSeries, buildStructure, simulate, TeamRatings } from "./bracket";
import { DEFAULT_ELO } from "./elo";
import type { TeamEntry } from "./data";

export const TI_MAIN_EVENT_TEAMS = 8;

/**
 * Neutral fantasy volume when the user, rather than Elo, chooses a team they
 * trust to finish top four. In the standard eight-team double-elimination TI
 * bracket the four finishing paths contain 4, 5, 4 and 4 series: 4.25 each on
 * average. Applying the same number to every team deliberately removes our
 * opinion about which team advances while preserving the value of four shots
 * at a best-series score.
 */
export const TOP_FOUR_PLAYOFF_SERIES = 4.25;

export function topFourSeriesByTeam(teams: TeamEntry[]): Record<string, number> {
  return Object.fromEntries(
    teams.filter((team) => team.name).map((team) => [team.name, TOP_FOUR_PLAYOFF_SERIES])
  );
}

export type MapsProjection = {
  mapsByTeam: Record<string, number>;
  seriesByTeam: Record<string, number>;
  championByTeam: Record<string, number>;
  /** Probability of playing exactly k series, per team. Indexed by k. */
  seriesDistribution: Record<string, number[]>;
  /** Probability of playing at least 2, 3 and 4 series, per team. */
  atLeastByTeam: Record<string, { two: number; three: number; four: number }>;
  /** Per-team map totals the conditional titles depend on. */
  outlookByTeam: Record<string, { maps: number; mapsLost: number; decidingMaps: number }>;
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
  const empty: MapsProjection = {
    mapsByTeam: {}, seriesByTeam: {}, championByTeam: {},
    seriesDistribution: {}, outlookByTeam: {}, atLeastByTeam: {}, seeds
  };
  if (seeds.length < TI_MAIN_EVENT_TEAMS) return empty;

  const ratings: TeamRatings = Object.fromEntries(
    teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO])
  );
  const structure = buildStructure(TI_MAIN_EVENT_TEAMS, "double");
  const sim = simulate(structure, seeds, {}, ratings, runs);

  const mapsByTeam: Record<string, number> = {};
  const seriesByTeam: Record<string, number> = {};
  const championByTeam: Record<string, number> = {};
  const seriesDistribution: Record<string, number[]> = {};
  const outlookByTeam: Record<string, { maps: number; mapsLost: number; decidingMaps: number }> = {};
  const atLeastByTeam: Record<string, { two: number; three: number; four: number }> = {};
  for (const [team, outlook] of Object.entries(sim.teams)) {
    atLeastByTeam[team] = {
      two: atLeastSeries(outlook.seriesDistribution, 2),
      three: atLeastSeries(outlook.seriesDistribution, 3),
      four: atLeastSeries(outlook.seriesDistribution, 4)
    };
    outlookByTeam[team] = {
      maps: outlook.maps, mapsLost: outlook.mapsLost, decidingMaps: outlook.decidingMaps
    };
    mapsByTeam[team] = Number(outlook.maps.toFixed(2));
    seriesByTeam[team] = Number(outlook.series.toFixed(2));
    championByTeam[team] = outlook.champion;
    seriesDistribution[team] = outlook.seriesDistribution;
  }
  return {
    mapsByTeam, seriesByTeam, championByTeam,
    seriesDistribution, outlookByTeam, atLeastByTeam, seeds
  };
}
