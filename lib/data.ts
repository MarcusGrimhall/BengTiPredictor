// Reads the generated tournament data. Runs on the server at build time,
// so the JSON is baked into the page and the site stays fully static.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { PlayerEntry } from "./fantasy";
import type { StatKey } from "./scoring";
import type { Reliability } from "./reliability";
import { STAGES, type Stage } from "./stages";

const DIR = join(process.cwd(), "data", "generated");

/** What a team actually played in one stage. */
export type TeamStageStats = { maps: number; wins: number; series: number };

export type TeamEntry = {
  id: number;
  name: string;
  games: number;
  wins: number;
  winRate: number;
  /** OpenDota's career Elo rating. null if the team is not in their table. */
  elo: number | null;
  careerWins: number | null;
  careerLosses: number | null;
  /** Maps played per stage. Absent on data generated before stage splitting. */
  stages?: Record<Stage, TeamStageStats>;
  /**
   * Account ids the team's roster names, kept only where it describes THIS
   * event. null when OpenDota's roster is from a later line-up; absent on data
   * generated before rosters were recorded.
   */
  roster?: number[] | null;
  /** How many of that roster actually played here. The trust test. */
  rosterOverlap?: number | null;
};

export type LeagueData = {
  leagueId: number;
  leagueName: string;
  fetchedAt: string;
  matchesTotal: number;
  matchesUsed: number;
  minGames: number;
  /** True for an event fetched only to train on - never shown as the tournament. */
  training?: boolean;
  /** Unix seconds of the event's first and last map. */
  firstMatch?: number | null;
  lastMatch?: number | null;
  availableStats: StatKey[];
  /** Column order of every row in each player's `samples`. */
  statOrder: StatKey[];
  unavailableStats: string[];
  /** How the fetch split the event into fantasy periods. */
  stages?: {
    names: Stage[];
    split: boolean;
    boundary: number | null;
    gapHours: number;
    runnerUpHours: number;
  };
  teams: TeamEntry[];
  /** One row per map played: team ids, winner, stage index. */
  results?: Array<{ radiant: number; dire: number; radiantWin: boolean; stage: number }>;
  /**
   * How well the stored Elo ratings called this event's maps. OpenDota rates
   * teams as of now, not as of the event, so an older tournament can grade
   * worse than a coin flip - in which case nothing Elo-driven should be shown
   * without a warning.
   */
  ratingCheck?: { maps: number; accuracy: number; logLoss: number; usable: boolean };
  players: Array<{
    accountId: number | null;
    name: string;
    /** The Steam handle, kept for reference when a pro name was resolved. */
    steamName?: string;
    teamId: number | null;
    teamName: string;
    role: "core" | "mid" | "support";
    games: number;
    winRate: number;
    perGame: Record<StatKey, number>;
    /** One row per game played, in `statOrder` order. */
    samples: number[][];
    /** Stage index of each sample row: 0 group stage, 1 playoffs. */
    sampleStages?: number[];
    /** Match, series and hero for each sample row, same order. */
    sampleMatches?: number[];
    sampleSeries?: number[];
    sampleHeroes?: number[];
    /** Bitmask of Suffix conditions that fired, per sample row. */
    sampleTitles?: number[];
    /** Games and win rate within each stage. */
    stages?: Record<Stage, { games: number; winRate: number }>;
  }>;
};

export type LeagueSummary = {
  leagueId: number;
  leagueName: string;
  fetchedAt: string;
  matchesUsed: number;
  teams: number;
  players: number;
  training?: boolean;
};

export async function listLeagues(): Promise<LeagueSummary[]> {
  try {
    const raw = await readFile(join(DIR, "index.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function loadLeague(leagueId: number | string): Promise<LeagueData | null> {
  try {
    const raw = await readFile(join(DIR, `league-${leagueId}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The most recent tournament shown in the app. Training events are skipped -
 * they exist to fit the model, not to be browsed.
 */
export async function loadDefaultLeague(): Promise<LeagueData | null> {
  const leagues = (await listLeagues()).filter((l) => !l.training);
  if (!leagues.length) return null;
  return loadLeague(leagues[0].leagueId);
}

/** Every event fetched with --training, oldest first. */
export async function listTrainingLeagues(): Promise<LeagueSummary[]> {
  return (await listLeagues()).filter((l) => l.training).sort((a, b) => a.leagueId - b.leagueId);
}

/**
 * Player rows for the calculator.
 *
 * With a `stage`, only that stage's games are kept and the averages are
 * recomputed from them - the two fantasy cards score over different matches, so
 * mixing the games would misrank both. Players who never appeared in the stage
 * are dropped: a team knocked out in the group stage scores nothing in the
 * playoffs, which is not the same as scoring a little.
 *
 * Without a `stage`, the whole event is returned as one period. That is the
 * right answer for an event that was never split.
 */
export function toPlayerEntries(league: LeagueData, stage?: Stage): PlayerEntry[] {
  const order = league.statOrder ?? league.availableStats;
  const wanted = stage ? STAGES.indexOf(stage) : -1;

  // Who the event says is on each team. Null for a team whose roster could not
  // be trusted, and absent entirely on data fetched before rosters existed - in
  // both cases `onRoster` stays undefined and buildLineups falls back to games.
  const onRoster = new Set<number>();
  for (const team of league.teams ?? []) {
    for (const id of team.roster ?? []) onRoster.add(id);
  }

  return league.players
    .map((p) => {
      const tags = p.sampleStages;
      const keep = (p.samples ?? []).map((_, i) => i).filter(
        (i) => wanted === -1 || !tags || tags[i] === wanted
      );
      const rows = keep.map((i) => p.samples[i]);
      const gameLines = rows.map((row) =>
        Object.fromEntries(order.map((stat, i) => [stat, row[i] ?? 0])) as Record<StatKey, number>
      );
      const gameMatches = p.sampleMatches ? keep.map((i) => p.sampleMatches![i]) : undefined;
      const gameSeries = p.sampleSeries ? keep.map((i) => p.sampleSeries![i]) : undefined;
      const gameHeroes = p.sampleHeroes ? keep.map((i) => p.sampleHeroes![i]) : undefined;
      const gameTitles = p.sampleTitles ? keep.map((i) => p.sampleTitles![i]) : undefined;

      // Averages must come from the kept games, not the whole event.
      const perGame = wanted === -1 || !tags
        ? p.perGame
        : (Object.fromEntries(
            order.map((stat) => [
              stat,
              rows.length ? rows.reduce((sum, row, i) => sum + (row[order.indexOf(stat)] ?? 0), 0) / rows.length : 0
            ])
          ) as Record<StatKey, number>);

      const stageStats = stage ? p.stages?.[stage] : undefined;
      return {
        id: String(p.accountId ?? p.name),
        name: p.name,
        onRoster: onRoster.size && p.accountId != null ? onRoster.has(p.accountId) : undefined,
        teamName: p.teamName,
        role: p.role,
        games: stageStats ? stageStats.games : rows.length || p.games,
        winRate: stageStats ? stageStats.winRate : p.winRate,
        perGame,
        gameLines,
        gameSeries,
        gameMatches,
        gameHeroes,
        gameTitles
      };
    })
    .filter((p) => p.games > 0);
}

/**
 * Maps each team actually played in a stage.
 *
 * For a finished event this is the truth and beats any projection. Empty when
 * the data predates stage splitting, in which case the caller should fall back
 * to simulating the bracket.
 */
export function actualMapsByStage(league: LeagueData, stage: Stage): Record<string, number> {
  const maps: Record<string, number> = {};
  for (const team of league.teams) {
    const played = team.stages?.[stage]?.maps ?? 0;
    if (played > 0) maps[team.name] = played;
  }
  return maps;
}

/**
 * Series each team actually played in a stage.
 *
 * This, not the map count, is what multiplies a fantasy value: a match scores
 * as its two best games however long the series runs.
 */
export function actualSeriesByStage(league: LeagueData, stage: Stage): Record<string, number> {
  const series: Record<string, number> = {};
  for (const team of league.teams) {
    const played = team.stages?.[stage]?.series ?? 0;
    if (played > 0) series[team.name] = played;
  }
  return series;
}

/** Teams that appeared in a stage, strongest first. */
export function teamsInStage(league: LeagueData, stage: Stage): TeamEntry[] {
  return league.teams
    .filter((t) => (t.stages?.[stage]?.maps ?? 0) > 0)
    .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
}

/**
 * A tournament's pre-event training sample, built by `npm run train`.
 *
 * Roster and roles are the target event's; every stat line comes from
 * tournaments that finished before it started.
 */
export type TrainingData = {
  targetLeagueId: number;
  targetLeagueName: string;
  builtAt: string;
  /** Unix seconds of the target event's first match. Nothing later is included. */
  cutoff: number;
  statOrder: StatKey[];
  unavailableStats: string[];
  sources: Array<{
    leagueId: number;
    leagueName: string;
    firstMatch: number;
    lastMatch: number;
    maps: number;
  }>;
  players: Array<{
    accountId: number;
    name: string;
    teamId: number | null;
    teamName: string;
    role: "core" | "mid" | "support";
    games: number;
    winRate: number;
    perGame: Record<StatKey, number>;
    samples: number[][];
    sampleMatches?: number[];
    sampleSeries?: number[];
    sampleHeroes?: number[];
    sampleTitles?: number[];
    sourceLeagues: number[];
  }>;
  coverage: { atTarget: number; withHistory: number; missing: string[] };
};

export async function loadTraining(targetLeagueId: number | string): Promise<TrainingData | null> {
  try {
    return JSON.parse(await readFile(join(DIR, `training-${targetLeagueId}.json`), "utf8"));
  } catch {
    return null;
  }
}

/**
 * How far each stat has been shown to repeat, written by `npm run persistence`.
 *
 * Absent is fine and means no shrinkage: the ranking falls back to trusting
 * every stat equally, which is what it did before this existed.
 */
export async function loadReliability(): Promise<Reliability | null> {
  try {
    return JSON.parse(await readFile(join(DIR, "reliability.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Player rows built purely from pre-event matches. */
export function trainingPlayerEntries(training: TrainingData): PlayerEntry[] {
  const order = training.statOrder;
  return training.players
    .map((p) => ({
      id: String(p.accountId),
      name: p.name,
      teamName: p.teamName,
      role: p.role,
      games: p.samples.length,
      winRate: p.winRate,
      perGame: p.perGame,
      gameLines: p.samples.map((row) =>
        Object.fromEntries(order.map((stat, i) => [stat, row[i] ?? 0])) as Record<StatKey, number>
      ),
      gameSeries: p.sampleSeries,
      gameMatches: p.sampleMatches,
      gameHeroes: p.sampleHeroes,
      gameTitles: p.sampleTitles
    }))
    .filter((p) => p.gameLines.length > 0);
}

export async function availableLeagueIds(): Promise<number[]> {
  try {
    const files = await readdir(DIR);
    return files
      .map((f) => f.match(/^league-(\d+)\.json$/)?.[1])
      .filter(Boolean)
      .map(Number);
  } catch {
    return [];
  }
}
