#!/usr/bin/env node
// Strict primary training preparation. No legacy approximation or column intersection.
import { join } from "node:path";
import { auditLeague, atomicJson, digest, readJson, ROOT } from "./exact-data.mjs";
import { validatePreparation, buildExactTraining } from "./training-contract.mjs";
const args = process.argv.slice(2);
const id = args.find((a) => /^\d+$/.test(a));
const at = args.indexOf("--config");
if (!id || at < 0 || !args[at + 1]) throw new Error("Usage: npm run train -- <targetLeagueId> --config <pre-lock-manifest.json>. See docs/EXACT_PIPELINE.md; inferred post-event rosters are not accepted.");
const config = await readJson(args[at + 1]);
validatePreparation(config);
if (config.targetLeagueId !== Number(id)) throw new Error("Config/CLI target mismatch");
const rules = await readJson(join(ROOT, "lib/current-rules.json"));
const started = performance.now();
const reports = [], records = [];
for (const source of config.sourceLeagueIds) {
  const audit = await auditLeague(source, { cutoff: config.cutoff,
    stage: source === config.targetLeagueId ? "groupStage" : "all" });
  reports.push(audit.report);
  records.push(...audit.records.filter((m) => m.exact));
  console.log(`${source}: ${audit.report.exactUsableMatches}/${audit.report.expectedMatches} exact matches; ${audit.report.gate.pass ? "PASS" : "FAIL"}`);
}
const preflight = { configHash: digest(config), rulesHash: digest(rules), reports,
  pass: reports.every((r) => r.gate.pass), seconds: (performance.now()-started)/1000 };
await atomicJson(join(ROOT, "data/audits", `preflight-${id}-${config.stage}.json`), preflight);
if (!preflight.pass) throw new Error("Exact-data gate failed. See data/audits/preflight report. Recover missing exact counters; do not train or drop columns.");
const payload = buildExactTraining(config, records);
payload.rulesHash = preflight.rulesHash;
payload.dataHash = digest(records.map((m) => [m.matchId, m.sourceHash]));
payload.sources = reports.map((r) => ({ leagueId: r.leagueId, leagueName: r.league,
  firstMatch: r.timestamps.first, lastMatch: r.timestamps.lastEnd, maps: r.exactUsableMatches }));
payload.builtAt = new Date().toISOString();
payload.qualityGate = { pass: true, threshold: 0.9, completeVectors: true };
// Heavy model selection consumes this normalized bank. Merely passing the data
// gate does not certify the old forecasting heuristic as a validated model.
await atomicJson(join(ROOT, "data/normalized", `training-${id}-${config.stage}.json`), payload);
await atomicJson(join(ROOT, "data/normalized", `matches-${id}-${config.stage}.json`), records);
console.log(`Prepared ${records.length} complete matches; ${payload.players.length} target players. No predictive model published yet.`);
