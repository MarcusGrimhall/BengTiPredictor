#!/usr/bin/env node
import { join } from "node:path";
import { auditLeague, atomicJson, ROOT } from "./exact-data.mjs";
const args = process.argv.slice(2);
const id = args.find((s) => /^\d+$/.test(s));
if (!id) throw new Error("Usage: npm run audit-data -- <leagueId> [--json] [--write]");
const { report } = await auditLeague(id);
if (args.includes("--write")) await atomicJson(join(ROOT, "data/audits", `league-${id}.json`), report);
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.league} (${id}) · ${report.teams.length} teams`);
  console.log(`Matches: ${report.expectedMatches} expected / ${report.retrievedMatches} retrieved / ${report.parsedMatches} parsed / ${report.exactUsableMatches} exact usable`);
  console.log(`Player-games: ${report.playerGames} observed / ${report.completePlayerGames} complete / ${report.retainedPlayerGames} retained`);
  console.log(`Replay overlays: ${report.replayCoverage}; exact coverage: ${(100 * report.coverage).toFixed(2)}%`);
  for (const [s, f] of Object.entries(report.fields)) console.log(`  ${s.padEnd(12)} ${String(f.observed).padStart(6)} observed / ${String(f.missing).padStart(6)} missing / ${String(f.zero).padStart(6)} zero`);
  console.log(`Gate: ${report.gate.pass ? "PASS" : "FAIL"} (${report.elapsedSeconds.toFixed(2)}s)`);
  for (const reason of report.gate.reasons) console.log(`  ${reason}`);
  console.log("Roles are inferred; a pre-lock roster manifest is required for prediction. Full diagnostics: --json or --write.");
}
process.exitCode = report.gate.pass ? 0 : 2;
