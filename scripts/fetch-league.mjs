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
const REPLAY_FANTASY_DIR = join(ROOT, "data", "cache", "replay-fantasy", "matches");
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

async function getReplayFantasy(id) {
  const cached = join(REPLAY_FANTASY_DIR, `${id}.json`);
  if (!(await exists(cached))) return null;
  return JSON.parse(await readFile(cached, "utf8"));
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

  /**
   * A team's roster, so a pair is picked from who is ON the team rather than
   * from who happened to play the most games.
   *
   * `/teams/{id}/players` flags current members. That flag is about TODAY, so it
   * is an anachronism on an old event exactly the way the pro registry is for
   * roles - it would hand TI 2022 the 2026 line-up. Rather than guess an age, we
   * check the roster against the event itself: if at least four of the players
   * it names actually played here, it describes this event and can be trusted.
   * Otherwise it is from another era and is ignored, and `buildLineups` falls
   * back to games played.
   */
  async function rosterFor(teamId) {
    const rows = await odFetch(`/teams/${teamId}/players`).catch(() => null);
    if (!Array.isArray(rows)) return null;
    return rows.filter((r) => r.is_current_team_member).map((r) => r.account_id);
  }
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
    const replayFantasy = await getReplayFantasy(match.match_id);
    const rows = extractMatch(match, replayFantasy);
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
          sampleReplayTitles: [],
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
        lastPossible: lastPossibleOf.get(match.match_id),
        replayTitles: replayFantasy?.match?.titleConditions
      }));
      agg.sampleReplayTitles.push(Boolean(replayFantasy));
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

  const kept = [...players.values()].filter((p) => p.games >= minGames);

  // Roles, from the lanes of this event - not from who plays what today.
  //
  // The pro registry looks authoritative and is the obvious choice, but it is a
  // snapshot of the CURRENT roster. Applied to an old event it is an
  // anachronism: it files Team Liquid's TI 2022 mid as a core, because core is
  // what he plays in 2026. It is also thin on mid - only a few dozen players
  // worldwide carry fantasy_role 4 - so most mids come back labelled core,
  // which leaves a squad with three cores and no mid at all. That squad then
  // contributes no Mid entry to the rankings and mixes a mid's farm into the
  // Core pair. Resolved from the registry, TI 2022 shipped 13 mids for 20 teams.
  //
  // OpenDota's own lane detection is about the match in front of it, and it is
  // not a worse source - it is a better one. Checked against the registry on
  // the two Internationals where the registry IS contemporaneous, it agrees on
  // 160 of 160 players and 32 of 32 mids. Every tie-break tried (last hits, net
  // worth, GPM, wards) scored the same, so the lanes are doing the work.
  //
  // So the lanes decide, and the registry is only consulted where they leave a
  // genuine tie.
  const registryRole = (p) => FANTASY_ROLE[proById.get(p.accountId)?.fantasy_role];
  const laneRole = (p) => Object.entries(p.roleCounts).sort((a, b) => b[1] - a[1])[0][0];
  const roleOf = new Map(kept.map((p) => [p, laneRole(p) ?? registryRole(p)]));

  const squads = new Map();
  for (const p of kept) {
    const squad = squads.get(p.teamName);
    if (squad) squad.push(p);
    else squads.set(p.teamName, [p]);
  }

  // How much this event says a player is a core: how often the lanes put them
  // in a core lane, then farm, and only then what the registry thinks.
  const coreness = (p) => [
    -(p.roleCounts.core ?? 0) / p.games,
    -p.totals.creeps / p.games,
    { core: 0, mid: 0, support: 2 }[registryRole(p)] ?? 1
  ];
  const byCoreness = (a, b) => {
    const [x, y] = [coreness(a), coreness(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };

  // Mid-lane games this event, with the registry only as a tie-break.
  const midGames = (p) => p.roleCounts.mid ?? 0;
  const byMid = (a, b) =>
    midGames(b) - midGames(a) ||
    (registryRole(b) === "mid" ? 1 : 0) - (registryRole(a) === "mid" ? 1 : 0) ||
    b.totals.gpm / b.games - a.totals.gpm / a.games;

  let reshaped = 0;
  for (const squad of squads.values()) {
    const before = squad.map((p) => roleOf.get(p));

    // One mid per team: whoever actually stood in the mid lane most often.
    const candidates = squad.filter((p) => midGames(p) > 0);
    const mid = (candidates.length ? candidates : squad.filter((p) => registryRole(p) === "mid"))
      .sort(byMid)[0];

    // A five-player squad fills a fantasy roster exactly one way: two cores,
    // one mid, two supports. Any other split costs a pickable entry -
    // buildLineups needs two candidates to make a pair, so a 3/1/1 squad
    // offers no Support pair at all. Squads carrying a substitute are left
    // alone; there the shape is a real question.
    if (squad.length !== 5) {
      if (mid) roleOf.set(mid, "mid");
    } else if (mid) {
      const rest = squad.filter((p) => p !== mid).sort(byCoreness);
      roleOf.set(mid, "mid");
      rest.slice(0, 2).forEach((p) => roleOf.set(p, "core"));
      rest.slice(2).forEach((p) => roleOf.set(p, "support"));
    }

    if (squad.some((p, i) => roleOf.get(p) !== before[i])) reshaped += 1;
  }

  // Per-game averages, and the resolved role.
  const output = kept
    .map((p) => {
      const pro = proById.get(p.accountId);
      const role = roleOf.get(p);
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
        sampleReplayTitles: p.sampleReplayTitles,
        stages: Object.fromEntries(STAGES.map((name, i) => [name, {
          games: p.stageGames[i],
          winRate: p.stageGames[i] ? Number((p.stageWins[i] / p.stageGames[i]).toFixed(3)) : 0
        }]))
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));

  // Rosters, one call per team. Sequential so the public rate limit is not
  // tripped; the whole league is a couple of dozen requests.
  const rosterById = new Map();
  for (const teamId of teams.keys()) {
    const roster = await rosterFor(teamId);
    if (roster) rosterById.set(teamId, roster);
  }
  progress(`rosters - ${rosterById.size} of ${teams.size} teams answered`);

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
        const roster = rosterById.get(t.id) ?? null;
        // Played here, so the roster can be checked against reality.
        const played = new Set(
          output.filter((p) => p.teamId === t.id).map((p) => p.accountId)
        );
        const overlap = roster ? roster.filter((id) => played.has(id)).length : 0;
        return {
          ...t,
          // Only kept when it describes THIS event - see rosterFor.
          roster: roster && overlap >= 4 ? roster : null,
          rosterOverlap: roster ? overlap : null,
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
  // How many entries the registry could have had an opinion about at all. It no
  // longer decides the role - the lanes do - so this is coverage, not authority.
  const inRegistry = output.filter((p) => proById.get(p.accountId)?.fantasy_role).length;
  console.log(`  players      : ${output.length} (min ${minGames} games)`);
  console.log(`  pro names    : ${named} resolved, ${output.length - named} kept their handle`);
  console.log(`  roles        : from this event's lanes; ${inRegistry}/${output.length} also carry a registry role`);
  const mids = output.filter((p) => p.role === "mid").length;
  const agrees = output.filter((p) => {
    const r = FANTASY_ROLE[proById.get(p.accountId)?.fantasy_role];
    return r && r === p.role;
  }).length;
  const rated = output.filter((p) => FANTASY_ROLE[proById.get(p.accountId)?.fantasy_role]).length;
  console.log(`  mids         : ${mids} for ${squads.size} teams` +
    (reshaped ? ` (${reshaped} squad(s) re-shaped into a legal line-up)` : ""));
  console.log(`  vs registry  : ${agrees}/${rated} agree (the registry is today's roster, ` +
    `so an old event is expected to differ)`);
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
