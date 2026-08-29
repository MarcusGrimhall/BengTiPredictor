"use client";

import { useEffect, useMemo, useState } from "react";
import { buildStructure, simulate, TeamRatings } from "../lib/bracket";
import { DEFAULT_ELO } from "../lib/elo";
import type { TeamEntry } from "../lib/data";

const BRACKET_KEY = "d2toolkit-bracket-v2";

export type MapsSource = "bracket" | "rating";

export type MainEventMaps = {
  mapsByTeam: Record<string, number>;
  /** Expected series - what a fantasy value is multiplied by. */
  seriesByTeam: Record<string, number>;
  championByTeam: Record<string, number>;
  /** Map totals the conditional titles depend on - see lib/titles.ts. */
  outlookByTeam: Record<string, { maps: number; mapsLost: number; decidingMaps: number }>;
  seeds: string[];
  source: MapsSource;
};

/**
 * Expected maps per team for the main event.
 *
 * Prefers the bracket the user actually built on the Bracket page - at TI the
 * eight teams come out of the group stage, not out of a rating table, so
 * guessing them from Elo is only a fallback.
 *
 * Client-side runs use fewer simulations than the build-time default: expected
 * maps converge far faster than championship odds, and this has to stay
 * responsive while the user drags things around.
 */
export function useMainEventMaps(
  teams: TeamEntry[],
  fallback: MainEventMaps
): MainEventMaps {
  const [seeds, setSeeds] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(BRACKET_KEY) ?? "null");
      const names: unknown = saved?.seeds;
      if (Array.isArray(names) && names.length === 8 && names.every((n) => typeof n === "string")) {
        setSeeds(names as string[]);
      }
    } catch {
      /* fall back to the build-time projection */
    }
  }, []);

  return useMemo(() => {
    if (!seeds) return fallback;

    const known = new Set(teams.map((t) => t.name));
    if (!seeds.every((name) => known.has(name))) return fallback;

    const ratings: TeamRatings = Object.fromEntries(
      teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO])
    );
    const sim = simulate(buildStructure(8, "double"), seeds, {}, ratings, 5000);

    const mapsByTeam: Record<string, number> = {};
    const seriesByTeam: Record<string, number> = {};
    const championByTeam: Record<string, number> = {};
    const outlookByTeam: Record<string, { maps: number; mapsLost: number; decidingMaps: number }> = {};
    for (const [team, outlook] of Object.entries(sim.teams)) {
      mapsByTeam[team] = Number(outlook.maps.toFixed(2));
      seriesByTeam[team] = Number(outlook.series.toFixed(2));
      championByTeam[team] = outlook.champion;
      outlookByTeam[team] = {
        maps: outlook.maps, mapsLost: outlook.mapsLost, decidingMaps: outlook.decidingMaps
      };
    }
    return { mapsByTeam, seriesByTeam, championByTeam, outlookByTeam, seeds, source: "bracket" };
  }, [seeds, teams, fallback]);
}
