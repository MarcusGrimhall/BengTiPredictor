#!/usr/bin/env node
// Restartable acquisition/audit entry point. Training is a separate gated step.
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { auditLeague, atomicJson, optionalJson, readJson, ROOT } from "./exact-data.mjs";
import { odFetch } from "./opendota.mjs";
const args = process.argv.slice(2);
const id = args.find((s) => /^\d+$/.test(s));
if (!id) throw new Error("Usage: npm run prepare-ti -- <targetLeagueId> [--acquire-manifests] [--recover] [--config <manifest.json>]");
const at = args.indexOf("--config");
const config = at >= 0 ? await readJson(args[at+1]) : null;
const index = await readJson(join(ROOT, "data/generated/index.json"));
const target = await optionalJson(join(ROOT, "data/generated", `league-${id}.json`));
if (!target && !config) throw new Error("Future target requires a pre-lock configuration");
const sources = [];
for (const e of index) {
  const l = await readJson(join(ROOT, "data/generated", `league-${e.leagueId}.json`));
  if (config ? config.sourceLeagueIds.includes(e.leagueId) : e.training && l.firstMatch < target.firstMatch) sources.push(e.leagueId);
}
const reports = [];
for (const source of [...new Set([...sources, ...(target ? [Number(id)] : [])])]) {
  if (args.includes("--acquire-manifests")) {
    const matches = await odFetch(`/leagues/${source}/matches`);
    if (!Array.isArray(matches) || matches.some((m) => !Number.isSafeInteger(m.match_id))) throw new Error(`Bad manifest ${source}`);
    await atomicJson(join(ROOT,"data/cache/leagues",`${source}.json`), {
      leagueId: source, acquiredAt: new Date().toISOString(), source: "OpenDota league matches", matches
    });
  }
  if (args.includes("--recover")) {
    const manifest = await optionalJson(join(ROOT,"data/cache/leagues",`${source}.json`));
    if (!manifest) throw new Error("Acquire match manifests before recovery (--acquire-manifests)");
    for (const entry of manifest.matches) {
      const path = join(ROOT,"data/cache/matches",`${entry.match_id}.json`);
      let raw;
      try { raw = await optionalJson(path); } catch { raw = null; }
      if (raw?.match_id === entry.match_id && raw.players?.length === 10) continue;
      const recovered = await odFetch(`/matches/${entry.match_id}`);
      if (recovered.match_id !== entry.match_id || recovered.players?.length !== 10) throw new Error(`Invalid API match ${entry.match_id}`);
      await atomicJson(path,recovered);
    }
    const recovered = spawnSync(process.execPath, [join(ROOT,"scripts/replay-batch.mjs"),String(source)], {stdio:"inherit"});
    if (recovered.error) throw recovered.error;
  }
  const {report} = await auditLeague(source);
  reports.push(report);
  await atomicJson(join(ROOT,"data/audits",`league-${source}.json`), report);
  console.log(`${source} ${report.league}: ${report.exactUsableMatches}/${report.expectedMatches} exact; ${report.gate.pass ? "PASS" : "FAIL"}`);
}
await atomicJson(join(ROOT,"data/audits",`prepare-${id}.json`), { targetLeagueId:Number(id),
  sourceSelection:config ? "explicit pre-lock manifest" : "all previously selected training events starting before target; diagnostic only",
  reports, modelReady:false });
if (config) {
  const trained = spawnSync(process.execPath,[join(ROOT,"scripts/build-training.mjs"),id,"--config",args[at+1]],{stdio:"inherit"});
  process.exitCode = trained.status ?? 1;
} else {
  console.log("Audit complete. Training requires an explicit pre-lock roster/cutoff manifest. No model was fitted or published.");
  process.exitCode = reports.every((r) => r.gate.pass) ? 0 : 2;
}
