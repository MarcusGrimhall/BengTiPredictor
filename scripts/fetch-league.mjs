#!/usr/bin/env node
// Fetches a whole tournament from OpenDota and writes aggregated player data.
//
//   npm run fetch -- 19719              # The International 2026
//   npm run fetch -- 19719 --min-games 3
//   npm run fetch -- 19719 --refresh    # ignorera cache
//
// Raw match responses are cached in data/cache/ (gitignored) so re-runs are
// free and you can recompute the aggregation without fetching again.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { odFetch } from "./opendota.mjs";
import { extractMatch, suffixFlags, RAW_STATS, UNAVAILABLE_STATS } from "./extract.mjs";
import { splitStages, STAGES } from "./stages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "cache", "matches");
const OUT_DIR = join(ROOT, "data", "generated");

const args = process.argv.slice(2);
const leagueId = args.find((a) => /^\d+$/.test(a));
const refresh = args.includes("--refresh");
// Training events feed the model but are never shown as "the tournament".
const training = args.includes("--training");
const minGamesIndex = args.indexOf("--min-games");
const minGames = minGamesIndex === -1 ? 2 : Number(args[minGamesIndex + 1]) || 2;

if (!leagueId) {
  console.error("Usage: npm run fetch -- <leagueId> [--min-games N] [--refresh] [--training]");
  console.error("Find a league ID with: npm run leagues -- <search term>");
  process.exit(1);
}

const exists = (p) => access(p).then(() => true, () => false);

/** Progress that overwrites itself - suppressed when the output is piped. */
const progress = (line) => {
  if (process.stdout.isTTY) process.stdout.write(`${line}\r`);
};

async function getMatch(id) {
  const cached = join(CACHE_DIR, `${id}.json`);
  if (!refresh && (await exists(cached))) {
    return JSON.parse(await readFile(cached, "utf8"));
  }
  const match = await odFetch(`/matches/${id}`);
  await writeFile(cached, JSON.stringify(match));
  return match;
}

function emptyTotals() {
  return Object.fromEntries(RAW_STATS.map((s) => [s, 0]));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching league ${leagueId}...`);
  const [leagueInfo, matchList, allTeams, proPlayers] = await Promise.all([
    odFetch(`/leagues/${leagueId}`).catch(() => null),
    odFetch(`/leagues/${leagueId}/matches`),
    // OpenDota maintains an Elo rating per team. This is what drives the
    // bracket model, so nobody has to invent strength numbers by hand.
    odFetch(`/teams`).catch(() => []),
    // The pro registry: real names rather than whatever Steam handle a player
    // happened to be using, plus the official fantasy role.
    odFetch(`/proPlayers`).catch(() => [])
  ]);
  const eloById = new Map((allTeams ?? []).map((t) => [t.team_id, t]));
  const proById = new Map((proPlayers ?? []).map((p) => [p.account_id, p]));

  // OpenDota's fantasy_role codes. Verified against the role heuristic on
  // TI 2026 (80/80 agreement) and TI 2025 (72/75), so where it exists it is
  // used directly and the heuristic is only the fallback.
  const FANTASY_ROLE = { 1: "core", 2: "support", 4: "mid" };

  const leagueName = leagueInfo?.name ?? `League ${leagueId}`;
  console.log(`${leagueName}: ${matchList.length} matcher\n`);

  // Every match is loaded before anything is aggregated: the group stage /
  // playoff split is found from the schedule as a whole, and a player's games
  // have to be filed under the right stage as they are counted.
  const loaded = [];
  let skipped = 0;
  for (const [index, entry] of matchList.entries()) {
    const label = `[${index + 1}/${matchList.length}] ${entry.match_id}`;
    try {
      loaded.push(await getMatch(entry.match_id));
    } catch (err) {
      console.log(`${label} - skipping (${err.message})`);
      skipped += 1;
      continue;
    }
    progress(`${label} - loaded`);
  }

  // Where each map sits in its series, so the Clutch suffix can be decided.
  // A Bo1 is decided on game 1, a Bo3 on game 3, a Bo5 on game 5.
  const LAST_GAME = { 0: 1, 1: 3, 2: 5 };
  const seriesGames = new Map();
  for (const m of loaded) {
    const key = m.series_id || -m.match_id;
    if (!seriesGames.has(key)) seriesGames.set(key, []);
    seriesGames.get(key).push(m);
  }
  const gameNumberOf = new Map();
  const lastPossibleOf = new Map();
  for (const [, games] of seriesGames) {
    games.sort((a, b) => (a.start_time ?? 0) - (b.start_time ?? 0));
    games.forEach((m, i) => {
      gameNumberOf.set(m.match_id, i + 1);
      lastPossibleOf.set(m.match_id, LAST_GAME[m.series_type] ?? games.length);
    });
  }

  const stages = splitStages(loaded);
  console.log(`\n\nStage split: ${stages.split ? "yes" : "no"}`);
  if (stages.split) {
    console.log(`  break of ${stages.gapHours.toFixed(1)}h in the schedule ` +
      `(next longest ${stages.runnerUpHours.toFixed(1)}h)`);
    console.log(`  boundary: ${new Date(stages.boundary * 1000).toISOString()}`);
  } else {
    console.log("  no break long enough to be a stage boundary - treating the");
    console.log("  whole event as one fantasy period.");
  }
  console.log();

  const players = new Map();
  const teams = new Map();
  // One row per map: who played, who won, which stage. Enough to grade the Elo
  // model against the event without keeping the whole match cache around.
  const results = [];
  let parsedCount = 0;

  for (const [index, match] of loaded.entries()) {
    const label = `[${index + 1}/${loaded.length}] ${match.match_id}`;
    const rows = extractMatch(match);
    if (!rows) {
      process.stdout.write(`${label} - not parsed, skipping\n`);
      skipped += 1;
      continue;
    }
    parsedCount += 1;
    const stage = stages.stageOf.get(match.match_id) ?? 0;

    for (const row of rows) {
      const key = row.accountId ?? `anon-${row.name}`;
      if (!players.has(key)) {
        players.set(key, {
          accountId: row.accountId,
          name: row.name,
          teamId: row.teamId,
          teamName: row.teamName,
          games: 0,
          wins: 0,
          roleCounts: {},
          totals: emptyTotals(),
          // One row per game, in RAW_STATS order. The calculator needs the
          // real distribution - not just the mean - to model risk.
          samples: [],
          // Which stage each of those rows belongs to, same order.
          sampleStages: [],
          // Match, series and hero for each row, same order. Pairs are summed
          // by match; series are scored as their two best games; heroes drive
          // the Prefix trigger rates.
          sampleMatches: [],
          sampleSeries: [],
          sampleHeroes: [],
          sampleTitles: [],
          // Games and wins per stage, so a stage's win rate is its own.
          stageGames: [0, 0],
          stageWins: [0, 0]
        });
      }
      const agg = players.get(key);
      agg.games += 1;
      if (row.won) agg.wins += 1;
      agg.name = row.name;
      if (row.teamId) {
        agg.teamId = row.teamId;
        agg.teamName = row.teamName;
      }
      agg.roleCounts[row.role] = (agg.roleCounts[row.role] ?? 0) + 1;
      for (const stat of RAW_STATS) agg.totals[stat] += row.stats[stat];
      agg.samples.push(RAW_STATS.map((stat) => Number(row.stats[stat].toFixed(3))));
      agg.sampleStages.push(stage);
      agg.sampleMatches.push(row.matchId);
      agg.sampleSeries.push(row.seriesId);
      agg.sampleHeroes.push(row.heroId);
      agg.sampleTitles.push(suffixFlags(match, row.won, {
        gameNumber: gameNumberOf.get(match.match_id),
        lastPossible: lastPossibleOf.get(match.match_id)
      }));
      agg.stageGames[stage] += 1;
      if (row.won) agg.stageWins[stage] += 1;

      if (row.teamId && !teams.has(row.teamId)) {
        teams.set(row.teamId, {
          id: row.teamId,
          name: row.teamName,
          games: 0,
          wins: 0,
          // Maps actually played per stage. For a finished event this beats
          // any projection, because it is what happened.
          stageMaps: [0, 0],
          stageWins: [0, 0],
          stageSeries: [new Set(), new Set()]
        });
      }
    }

    for (const side of [rows[0], rows.find((r) => r.teamId !== rows[0].teamId)]) {
      if (!side?.teamId) continue;
      const team = teams.get(side.teamId);
      if (!team) continue;
      team.games += 1;
      if (side.won) team.wins += 1;
      team.stageMaps[stage] += 1;
      if (side.won) team.stageWins[stage] += 1;
      if (match.series_id != null) team.stageSeries[stage].add(match.series_id);
    }

    if (match.radiant_team_id && match.dire_team_id) {
      results.push({
        radiant: match.radiant_team_id,
        dire: match.dire_team_id,
        radiantWin: Boolean(match.radiant_win),
        stage
      });
    }

    progress(`${label} - ok (${rows.length} players)`);
  }

  // Per-game averages, and the role the player held most often.
  const output = [...players.values()]
    .filter((p) => p.games >= minGames)
    .map((p) => {
      const pro = proById.get(p.accountId);
      // The registry role is authoritative; the heuristic decides only when a
      // player is not in it.
      const role = FANTASY_ROLE[pro?.fantasy_role]
        ?? Object.entries(p.roleCounts).sort((a, b) => b[1] - a[1])[0][0];
      const perGame = Object.fromEntries(
        RAW_STATS.map((s) => [s, Number((p.totals[s] / p.games).toFixed(3))])
      );
      return {
        accountId: p.accountId,
        // Pro name where the player is in the registry, Steam handle otherwise.
        name: pro?.name || p.name,
        steamName: p.name,
        teamId: p.teamId,
        teamName: p.teamName,
        role,
        games: p.games,
        winRate: Number((p.wins / p.games).toFixed(3)),
        perGame,
        samples: p.samples,
        sampleStages: p.sampleStages,
        sampleMatches: p.sampleMatches,
        sampleSeries: p.sampleSeries,
        sampleHeroes: p.sampleHeroes,
        sampleTitles: p.sampleTitles,
        stages: Object.fromEntries(STAGES.map((name, i) => [name, {
          games: p.stageGames[i],
          winRate: p.stageGames[i] ? Number((p.stageWins[i] / p.stageGames[i]).toFixed(3)) : 0
        }]))
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));

  const payload = {
    leagueId: Number(leagueId),
    leagueName,
    fetchedAt: new Date().toISOString(),
    matchesTotal: matchList.length,
    matchesUsed: parsedCount,
    matchesSkipped: skipped,
    minGames,
    training,
    // Bounds of the event in the schedule. `npm run train` uses these to refuse
    // any training event that runs into the tournament it is meant to predict.
    firstMatch: loaded.length ? Math.min(...loaded.map((m) => m.start_time || Infinity)) : null,
    lastMatch: loaded.length ? Math.max(...loaded.map((m) => m.start_time || 0)) : null,
    stages: {
      names: STAGES,
      split: stages.split,
      boundary: stages.boundary,
      gapHours: Number(stages.gapHours.toFixed(1)),
      runnerUpHours: Number(stages.runnerUpHours.toFixed(1))
    },
    availableStats: RAW_STATS,
    statOrder: RAW_STATS,
    unavailableStats: UNAVAILABLE_STATS,
    teams: [...teams.values()]
      .map((t) => {
        const od = eloById.get(t.id);
        return {
          ...t,
          winRate: t.games ? Number((t.wins / t.games).toFixed(3)) : 0,
          // OpenDota's own Elo, career-wide. Drives the bracket model.
          elo: od?.rating != null ? Number(od.rating.toFixed(1)) : null,
          careerWins: od?.wins ?? null,
          careerLosses: od?.losses ?? null,
          // What the team actually played, per stage. Used directly for a
          // finished event; the Elo projection is only for events still ahead.
          stages: Object.fromEntries(STAGES.map((name, i) => [name, {
            maps: t.stageMaps[i],
            wins: t.stageWins[i],
            series: t.stageSeries[i].size
          }]))
        };
      })
      .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)),
    players: output,
    results
  };

  // Grade the ratings against the maps that were actually played. OpenDota's
  // Elo is career-to-date as of right now, not as of the event, so for an older
  // tournament it can be worse than a coin flip. The app warns when it is.
  const eloById2 = new Map(payload.teams.map((t) => [t.id, t.elo]));
  const graded = results.filter(
    (r) => eloById2.get(r.radiant) != null && eloById2.get(r.dire) != null
  );
  if (graded.length) {
    let correct = 0;
    let logLoss = 0;
    for (const r of graded) {
      const a = eloById2.get(r.radiant);
      const b = eloById2.get(r.dire);
      const prob = 1 / (1 + 10 ** ((b - a) / 400));
      const won = r.radiantWin ? 1 : 0;
      if ((prob > 0.5) === (won === 1)) correct += 1;
      logLoss += -(won * Math.log(Math.max(1e-9, prob)) + (1 - won) * Math.log(Math.max(1e-9, 1 - prob)));
    }
    payload.ratingCheck = {
      maps: graded.length,
      accuracy: Number((correct / graded.length).toFixed(3)),
      logLoss: Number((logLoss / graded.length).toFixed(4)),
      // Beating a coin flip (ln 2) is the bar for using these ratings at all.
      usable: logLoss / graded.length < Math.LN2
    };
    console.log(`  ratings      : ${(payload.ratingCheck.accuracy * 100).toFixed(1)}% of maps called ` +
      `correctly, log loss ${payload.ratingCheck.logLoss} ` +
      `(coin flip ${Math.LN2.toFixed(4)}) - ${payload.ratingCheck.usable ? "usable" : "NOT usable"}`);
  }

  const outFile = join(OUT_DIR, `league-${leagueId}.json`);
  await writeFile(outFile, JSON.stringify(payload, null, 2));

  // Update the index the app reads.
  const indexFile = join(OUT_DIR, "index.json");
  const index = (await exists(indexFile)) ? JSON.parse(await readFile(indexFile, "utf8")) : [];
  const without = index.filter((e) => e.leagueId !== Number(leagueId));
  without.push({
    leagueId: Number(leagueId),
    leagueName,
    fetchedAt: payload.fetchedAt,
    matchesUsed: parsedCount,
    teams: payload.teams.length,
    players: output.length,
    training
  });
  // Newest tournament first. League IDs increase over time, so this keeps the
  // most recent event active rather than whichever was fetched last.
  without.sort((a, b) => b.leagueId - a.leagueId);
  await writeFile(indexFile, JSON.stringify(without, null, 2));

  console.log(`\n\nDone.`);
  console.log(`  matches used : ${parsedCount} of ${matchList.length} (${skipped} skipped)`);
  const withElo = payload.teams.filter((t) => t.elo != null).length;
  console.log(`  teams        : ${payload.teams.length} (${withElo} with Elo rating)`);
  const sampleRows = output.reduce((n, p) => n + p.samples.length, 0);
  const named = output.filter((p) => p.name !== p.steamName).length;
  const officialRoles = output.filter((p) => proById.get(p.accountId)?.fantasy_role).length;
  console.log(`  players      : ${output.length} (min ${minGames} games)`);
  console.log(`  pro names    : ${named} resolved, ${output.length - named} kept their handle`);
  console.log(`  roles        : ${officialRoles} from the pro registry, ${output.length - officialRoles} from the heuristic`);
  console.log(`  game samples : ${sampleRows}`);
  for (const [i, name] of STAGES.entries()) {
    const maps = output.reduce((n, p) => n + p.sampleStages.filter((s) => s === i).length, 0) / 10;
    const sides = payload.teams.filter((t) => t.stages[name].maps > 0);
    if (!sides.length) continue;
    console.log(`  ${name.padEnd(12)} : ${Math.round(maps)} maps, ${sides.length} teams, ` +
      `${(sides.reduce((n, t) => n + t.stages[name].maps, 0) / sides.length).toFixed(1)} maps per team`);
  }
  console.log(`  wrote        : data/generated/league-${leagueId}.json`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
