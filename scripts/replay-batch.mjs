#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = join(ROOT, "data", "generated");
const RESULT_CACHE = join(ROOT, "data", "cache", "replay-fantasy", "matches");
const REPORT_DIR = join(ROOT, "data", "cache", "replay-fantasy");

const args = process.argv.slice(2);
const leagueId = args.find((arg) => /^\d+$/.test(arg));
const refresh = args.includes("--refresh");
const limitAt = args.indexOf("--limit");
const limit = limitAt === -1 ? Infinity : Number(args[limitAt + 1]);

if (!leagueId || !(limit > 0)) {
  console.error("Usage: npm run replays -- <leagueId> [--limit N] [--refresh]");
  process.exit(1);
}

const exists = (path) => access(path).then(() => true, () => false);

async function validCheckpoint(matchId) {
  const file = join(RESULT_CACHE, `${matchId}.json`);
  if (!(await exists(file))) return false;
  try {
    const result = JSON.parse(await readFile(file, "utf8"));
    const players = result.match?.players;
    const fields = ["madstones_collected", "watchers_captured",
      "lotuses_collected", "tormentors_killed"];
    return result.match?.matchId === matchId
      && players?.length === 10
      && new Set(players.map((player) => player.accountId)).size === 10
      && players.every((player) =>
        fields.every((field) => Number.isFinite(player.stats?.[field]) && player.stats[field] >= 0)
      );
  } catch {
    return false;
  }
}

async function main() {
  const league = JSON.parse(await readFile(join(GENERATED, `league-${leagueId}.json`), "utf8"));
  const matchIds = [...new Set(league.players.flatMap((player) => player.sampleMatches ?? []))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (matchIds.length !== league.matchesUsed) {
    throw new Error(`Generated league identifies ${matchIds.length} matches, expected ${league.matchesUsed}`);
  }

  await mkdir(RESULT_CACHE, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
  const failures = [];
  const pending = [];
  for (const [index, matchId] of matchIds.entries()) {
    if (refresh || !(await validCheckpoint(matchId))) pending.push({ index, matchId });
  }
  const queue = pending.slice(0, limit);
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const { index, matchId } = queue[cursor++];
      try {
        await exec(process.execPath, [join(ROOT, "scripts", "replay-stats.mjs"), String(matchId), ...(refresh ? ["--refresh"] : [])], {
          cwd: ROOT,
          maxBuffer: 10 * 1024 * 1024
        });
        if (!(await validCheckpoint(matchId))) throw new Error("parser produced an invalid checkpoint");
        console.log(`[${index + 1}/${matchIds.length}] ${matchId} ok`);
      } catch (error) {
        const detail = error.stderr?.trim() || error.message;
        const failure = { matchId, error: detail.split("\n").at(-1) };
        failures.push(failure);
        console.log(`[${index + 1}/${matchIds.length}] ${matchId} failed: ${failure.error}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));

  // Recount independently so interrupted runs and pre-existing checkpoints are
  // represented correctly in the coverage report.
  const valid = [];
  for (const matchId of matchIds) if (await validCheckpoint(matchId)) valid.push(matchId);
  const report = {
    leagueId: Number(leagueId),
    leagueName: league.leagueName,
    checkedAt: new Date().toISOString(),
    matches: matchIds.length,
    complete: valid.length,
    ready: valid.length === matchIds.length,
    missing: matchIds.filter((id) => !valid.includes(id)),
    failures
  };
  await writeFile(join(REPORT_DIR, `league-${leagueId}.json`), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n${league.leagueName}: ${report.complete}/${report.matches} exact replay checkpoints.`);
  console.log(report.ready
    ? "Coverage complete; this league is safe to migrate to replay counters."
    : `${report.missing.length} remain; replay counters must not yet be treated as complete.`);
  if (failures.length) console.log(`${failures.length} attempted replay(s) were unavailable or invalid.`);
}

main().catch((error) => {
  console.error(`Replay batch error: ${error.message}`);
  process.exit(1);
});
