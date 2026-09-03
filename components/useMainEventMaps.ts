"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeamEntry } from "../lib/data";

const BRACKET_KEY = "bengti-bracket-v1";

export type MapsSource = "bracket" | "rating" | "topFour";

export type MainEventMaps = {
  mapsByTeam: Record<string, number>;
  /** Expected series - what a fantasy value is multiplied by. */
  seriesByTeam: Record<string, number>;
  championByTeam: Record<string, number>;
  /** Map totals the conditional titles depend on - see lib/titles.ts. */
  outlookByTeam: Record<string, { maps: number; mapsLost: number; decidingMaps: number }>;
  /** Chance of playing at least 2, 3 and 4 series. */
  atLeastByTeam: Record<string, { two: number; three: number; four: number }>;
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
 * The simulation itself runs at build time. What happens here is only reading
 * back which eight teams the user seeded and, when they match the precomputed
 * ordering, using the answer that was already worked out. A bracket seeded
 * differently falls back to the build-time projection rather than running
 * 5,000 simulations in the browser - the numbers move very little, and the
 * page should not be doing that work.
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

    // The projection was computed at build time for a seeding. If the user's
    // eight are the same eight, that answer already applies - the bracket does
    // not depend on the order they were entered in.
    const known = new Set(teams.map((t) => t.name));
    if (!seeds.every((name) => known.has(name))) return fallback;

    const same = seeds.length === fallback.seeds.length &&
      seeds.every((name) => fallback.seeds.includes(name));
    return same ? { ...fallback, source: "bracket" } : fallback;
  }, [seeds, teams, fallback]);
}
