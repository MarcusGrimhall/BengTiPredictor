#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PARSER_DIR = join(ROOT, "scripts", "replay-parser");
const PARSER_JAR = join(PARSER_DIR, "target", "replay-stats.jar");
const MATCH_CACHE = join(ROOT, "data", "cache", "matches");
const RESULT_CACHE = join(ROOT, "data", "cache", "replay-fantasy", "matches");

const matchId = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
const refresh = process.argv.includes("--refresh");
if (!matchId) {
  console.error("Usage: npm run replay -- <matchId> [--refresh]");
  process.exit(1);
}

const exists = (path) => access(path).then(() => true, () => false);

async function ensureParser() {
  const source = join(PARSER_DIR, "src", "main", "java", "se", "bengti", "ReplayStats.java");
  const jarTime = (await exists(PARSER_JAR)) ? (await stat(PARSER_JAR)).mtimeMs : 0;
  const sourceTime = Math.max((await stat(source)).mtimeMs, (await stat(join(PARSER_DIR, "pom.xml"))).mtimeMs);
  if (jarTime >= sourceTime) return;
  await exec("mvn", ["-q", "package"], { cwd: PARSER_DIR, maxBuffer: 10 * 1024 * 1024 });
}

async function decompress(compressed, replay) {
  const handle = await open(compressed, "r");
  const magic = Buffer.alloc(4);
  try {
    await handle.read(magic, 0, magic.length, 0);
  } finally {
    await handle.close();
  }
  if (magic.subarray(0, 3).equals(Buffer.from("BZh"))) {
    await exec("bunzip2", [compressed]);
    return;
  }
  if (magic.equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) {
    await exec("zstd", ["-q", "-d", "-o", replay, compressed]);
    return;
  }
  throw new Error(`Unsupported replay compression header ${magic.toString("hex")}`);
}

function attachPlayers(raw, match) {
  const byAccount = new Map(match.players.map((player) => [player.account_id, player]));
  if (raw.players.length !== 10 || new Set(raw.players.map((row) => row.accountId)).size !== 10) {
    throw new Error("Replay player identities are incomplete; expected ten unique Steam IDs");
  }
  return {
    match: {
      matchId: Number(matchId),
      players: raw.players.map((row) => {
      const player = byAccount.get(row.accountId);
      if (!player) throw new Error(`Replay account ${row.accountId} is absent from the OpenDota match`);
      return {
        accountId: row.accountId,
        playerSlot: player.player_slot,
        heroId: player.hero_id,
        stats: {
          madstones_collected: row.madstones,
          watchers_captured: row.watchers,
          lotuses_collected: row.lotuses,
          tormentors_killed: row.tormentor
        }
      };
      }),
      titleConditions: {}
    }
  };
}

async function main() {
  const cachedResult = join(RESULT_CACHE, `${matchId}.json`);
  if (!refresh && (await exists(cachedResult))) {
    console.log(await readFile(cachedResult, "utf8"));
    return;
  }

  const matchFile = join(MATCH_CACHE, `${matchId}.json`);
  if (!(await exists(matchFile))) {
    throw new Error(`Missing ${matchFile}; fetch the league through OpenDota first`);
  }
  const match = JSON.parse(await readFile(matchFile, "utf8"));
  if (!match.replay_url) throw new Error("OpenDota did not provide a replay URL for this match");

  await ensureParser();
  const work = await mkdtemp(join(tmpdir(), `bengti-replay-${matchId}-`));
  try {
    const compressed = join(work, "replay.dem.bz2");
    const replay = join(work, "replay.dem");
    await exec("curl", [
      "-fsSL", "--retry", "2", "--connect-timeout", "10", "--max-time", "180",
      "--speed-limit", "1024", "--speed-time", "30", "-o", compressed, match.replay_url
    ]);
    await decompress(compressed, replay);
    const { stdout } = await exec("java", ["-Xmx4g", "-jar", PARSER_JAR, replay], {
      maxBuffer: 10 * 1024 * 1024
    });
    const result = attachPlayers(JSON.parse(stdout.trim()), match);
    await mkdir(RESULT_CACHE, { recursive: true });
    await writeFile(cachedResult, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Replay error: ${error.message}`);
  process.exit(1);
});
