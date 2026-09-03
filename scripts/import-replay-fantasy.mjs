#!/usr/bin/env node

// Imports replay-derived fantasy counters from the open TI fantasy parser into
// the raw cache. Generated league files are never edited here; `npm run fetch`
// remains the only writer of data/generated/.

import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(ROOT, "data", "cache", "replay-fantasy", "matches");
const sourceRoot = process.argv[2];

if (!sourceRoot) {
  console.error("Usage: npm run import-replays -- /path/to/Calculator-for-DOTA2-TI-Fantasy");
  process.exit(1);
}

const required = [
  "teamfight_participation", "madstones_collected", "watchers_captured",
  "lotuses_collected", "tormentors_killed"
];

async function main() {
  const dataRoot = join(sourceRoot, "data");
  const leagues = (await readdir(dataRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  await mkdir(destination, { recursive: true });

  let imported = 0;
  const byLeague = [];
  for (const league of leagues) {
    const matchDir = join(dataRoot, league.name, "matches");
    const files = (await readdir(matchDir)).filter((name) => /^\d+\.json$/.test(name));
    let count = 0;
    for (const file of files) {
      const source = join(matchDir, file);
      const parsed = JSON.parse(await readFile(source, "utf8"));
      const players = parsed?.match?.players;
      if (!Array.isArray(players) || players.length !== 10) {
        throw new Error(`${source}: expected ten replay players`);
      }
      for (const player of players) {
        for (const field of required) {
          if (!Number.isFinite(player?.stats?.[field])) {
            throw new Error(`${source}: missing ${field}`);
          }
        }
      }
      await copyFile(source, join(destination, file));
      count += 1;
    }
    imported += count;
    byLeague.push(`${league.name}: ${count}`);
  }

  console.log(`Imported ${imported} replay-fantasy matches (${byLeague.join(", ")})`);
  console.log("Run npm run fetch for each affected league, then rebuild training data.");
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
});
