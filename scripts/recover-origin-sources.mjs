#!/usr/bin/env node
// Resume exact-data recovery for reviewed pre-cutoff source events.
// Raw maps come from fetch --source-recovery; replay and audit use existing CLIs.
import { access, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { atomicJson, exactMatch, optionalJson, readJson, REPLAY_FIELDS, replayErrors, ROOT } from "./exact-data.mjs";
import { remainingQuota } from "./opendota.mjs";
import { sourceSeriesId } from "./series-corrections.mjs";

const args = process.argv.slice(2);
const arg = (flag) => {
  const at = args.indexOf(flag);
  if (at < 0) return null;
  if (!args[at + 1] || args[at + 1].startsWith("--")) throw new Error(`${flag} requires a value`);
  return args[at + 1];
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run recover-sources -- --target ID --config PRELOCK.json --selection CLASSIFICATION.json [--dry-run] [--raw-only] [--league-limit N] [--replay-limit N]

Requires the completed prepare-sources report and cached match manifests.
Skips sources with a current passing exact audit. Fetches missing raw maps from
OpenDota, parses missing Valve replays, then writes a fresh exact audit.
--raw-only gets all missing OpenDota maps and measures the best possible exact
coverage before replay downloads. --league-limit and --replay-limit support
small checkpoint runs. Reports are
in data/audits/recover-source-ID.json and recover-sources-TARGET.json.
No model is trained.`);
  process.exit(0);
}
const targetId = Number(arg("--target"));
const configPath = arg("--config");
const selectionPath = arg("--selection");
const dryRun = args.includes("--dry-run");
const rawOnly = args.includes("--raw-only");
const leagueLimit = Number(arg("--league-limit") ?? Number.MAX_SAFE_INTEGER);
const replayLimit = arg("--replay-limit") == null ? null : Number(arg("--replay-limit"));
if (!Number.isSafeInteger(targetId) || targetId <= 0 || !configPath || !selectionPath
  || !Number.isSafeInteger(leagueLimit) || leagueLimit < 1
  || (replayLimit != null && (!Number.isSafeInteger(replayLimit) || replayLimit < 1))) {
  throw new Error("Target, config, selection and positive optional limits are required. See --help.");
}
const pathOf = (path) => isAbsolute(path) ? path : resolve(ROOT, path);
const [config, selection, prepared] = await Promise.all([
  readJson(pathOf(configPath)), readJson(pathOf(selectionPath)),
  readJson(join(ROOT, "data/audits", `prepare-sources-${targetId}.json`))
]);
if (config.targetLeagueId !== targetId || selection.targetLeagueId !== targetId
  || prepared.targetLeagueId !== targetId || config.cutoff !== selection.cutoff
  || config.cutoff !== prepared.cutoff || prepared.status !== "manifest_complete"
  || prepared.classification?.unclassified?.length || prepared.selectionProblems?.length) {
  throw new Error("Target, cutoff, classification or completed manifest report mismatch");
}
const main = selection.events.filter((e) => e.bank === "main");
const ids = new Set(main.map((e) => e.leagueId));
if (ids.size !== main.length || ids.size !== prepared.classification.main
  || config.sourceLeagueIds?.length !== ids.size
  || config.sourceLeagueIds.some((id) => !ids.has(id))) {
  throw new Error("Reviewed source IDs differ from the pre-event manifest");
}
const preparedById = new Map(prepared.events.map((e) => [e.leagueId, e]));
const exists = async (path) => { try { await access(path); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; } };
const validRaw = (m, entry, leagueId) => m?.match_id === entry.match_id
  && m.leagueid === leagueId && m.players?.length === 10
  && Number.isFinite(m.start_time) && Number.isFinite(m.duration) && m.duration > 0;
const inspect = async (selected) => {
  const id = selected.leagueId;
  const manifest = await readJson(join(ROOT, "data/cache/leagues", `${id}.json`));
  const matches = manifest.matches;
  if (manifest.leagueId !== id || !Array.isArray(matches) || !matches.length
    || new Set(matches.map((m) => m.match_id)).size !== matches.length
    || matches.some((m) => !Number.isSafeInteger(m.match_id) || m.match_id <= 0
      || m.start_time + m.duration >= config.cutoff)
    || preparedById.get(id)?.manifestMatches !== matches.length) {
    throw new Error(`Source ${id} manifest invalid or changed since discovery`);
  }
  let rawReady = 0, replayReady = 0, invalidRaw = 0, invalidReplay = 0, rawImpossible = 0;
  let replayUrlMissing = 0, blockedByRawOrReplayUrl = 0;
  const rawProblemExamples = [];
  const series = new Map();
  const seriesCorrections = [];
  const replayOnly = new Set(Object.keys(REPLAY_FIELDS));
  for (const entry of matches) {
    const rawPath = join(ROOT, "data/cache/matches", `${entry.match_id}.json`);
    let raw = null;
    if (await exists(rawPath)) {
      try { raw = JSON.parse(await readFile(rawPath, "utf8")); } catch { /* retry through fetch */ }
    }
    if (!validRaw(raw, entry, id)) {
      if (raw) invalidRaw += 1;
      continue;
    }
    rawReady += 1;
    const correctedId = sourceSeriesId(raw);
    const seriesId = String(correctedId);
    if (correctedId !== (raw.series_id || -raw.match_id)) {
      seriesCorrections.push({ matchId: raw.match_id, rawSeriesId: raw.series_id,
        correctedSeriesId: correctedId });
    }
    const seriesRow = series.get(seriesId) ?? { count: 0, pairs: new Set() };
    seriesRow.count += 1;
    seriesRow.pairs.add([raw.radiant_team_id, raw.dire_team_id].sort((a, b) => a - b).join(":"));
    series.set(seriesId, seriesRow);
    const parsed = exactMatch(raw);
    const rawProblems = [...parsed.errors,
      ...new Set(parsed.players.flatMap((p) => [...p.invalid, ...p.missing.filter((field) => !replayOnly.has(field))]))];
    if (rawProblems.length) {
      rawImpossible += 1;
      if (rawProblemExamples.length < 8) rawProblemExamples.push({ matchId: entry.match_id, reasons: [...new Set(rawProblems)] });
    }
    const replayPath = join(ROOT, "data/cache/replay-fantasy/matches", `${entry.match_id}.json`);
    let validReplay = false;
    if (await exists(replayPath)) {
      try {
        const replay = JSON.parse(await readFile(replayPath, "utf8"));
        validReplay = !replayErrors(replay, raw).length;
        if (validReplay) replayReady += 1;
        else invalidReplay += 1;
      } catch { invalidReplay += 1; }
    }
    if (!validReplay && !raw.replay_url) replayUrlMissing += 1;
    if (rawProblems.length || (!validReplay && !raw.replay_url)) blockedByRawOrReplayUrl += 1;
  }
  const audit = await optionalJson(join(ROOT, "data/audits", `league-${id}.json`));
  const malformedSeries = [...series].filter(([, value]) => value.count > 5 || value.pairs.size > 1)
    .map(([seriesId, value]) => ({ seriesId, maps: value.count, teamPairs: [...value.pairs] }));
  const approved = audit?.gate?.pass === true && audit.expectedMatches === matches.length
    && audit.denominatorSource === "acquired API manifest" && audit.exactUsableMatches / matches.length >= 0.9;
  return { leagueId: id, name: selected.name, manifestMatches: matches.length,
    rawReady, rawNeeded: matches.length - rawReady, invalidRaw,
    rawImpossible, maxExactPossible: matches.length - rawImpossible,
    availableExactCeiling: rawReady - rawImpossible,
    replayUrlMissing, maxWithReplayUrls: matches.length - blockedByRawOrReplayUrl,
    malformedSeries, seriesCorrections,
    requiredExact: Math.ceil(0.9 * matches.length), rawProblemExamples,
    replayReady, replayNeeded: matches.length - replayReady, invalidReplay,
    auditPass: approved, exactUsable: audit?.expectedMatches === matches.length ? audit.exactUsableMatches : null,
    gateReasons: audit?.expectedMatches === matches.length ? audit.gate?.reasons ?? [] : [] };
};
const snapshots = await Promise.all(main.map(inspect));
const pending = snapshots.filter((s) => !s.auditPass)
  .sort((a, b) => (a.rawNeeded + a.replayNeeded) - (b.rawNeeded + b.replayNeeded) || a.leagueId - b.leagueId);
const estimate = pending.reduce((n, s) => n + s.rawNeeded, 0);
const replayEstimate = pending.filter((s) => s.maxExactPossible >= s.requiredExact
  && s.maxWithReplayUrls >= s.requiredExact && !s.malformedSeries.length)
  .reduce((n, s) => n + s.replayNeeded, 0);
console.log(`${snapshots.length - pending.length} passing sources skipped; ${pending.length} need recovery.`);
console.log(`Estimate before retries: ${estimate} OpenDota raw-match calls, up to ${replayEstimate} Valve replay downloads for sources that can reach 90%. No league metadata/manifest calls.`);
for (const s of pending) console.log(`${s.leagueId} ${s.name}: raw ${s.rawReady}/${s.manifestMatches}, replay ${s.replayReady}/${s.manifestMatches}, exact ${s.exactUsable ?? "?"}${s.rawImpossible ? `, raw-field ceiling ${s.maxExactPossible}/${s.manifestMatches}` : ""}`);

const reportPath = join(ROOT, "data/audits", `recover-sources-${targetId}.json`);
const report = { schemaVersion: 1, targetLeagueId: targetId, cutoff: config.cutoff,
  startedAt: new Date().toISOString(), updatedAt: null, dryRun, rawOnly,
  estimatedOpenDotaCalls: estimate, estimatedReplayDownloads: replayEstimate,
  skippedPassing: snapshots.filter((s) => s.auditPass).map((s) => s.leagueId),
  events: snapshots };
const save = async () => { report.updatedAt = new Date().toISOString(); await atomicJson(reportPath, report); };
await save();
if (dryRun) {
  console.log(`Dry-run report: ${reportPath}`);
  process.exit(0);
}
let remainingDay = null;
try {
  const quota = await remainingQuota();
  remainingDay = quota.day == null ? null : Number(quota.day);
  console.log(`OpenDota remaining day quota: ${Number.isFinite(remainingDay) ? remainingDay : "not reported"}`);
} catch (error) {
  console.warn(`Could not read OpenDota health/quota: ${error.message}; the shared client still handles 429.`);
}
if (Number.isFinite(remainingDay) && remainingDay <= 0 && estimate > 0) {
  report.status = "quota_exhausted";
  await save();
  console.error("OpenDota daily quota is exhausted; resume after reset.");
  process.exit(2);
}
let child = null;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  interrupted = true;
  child?.kill(signal);
});
const run = async (label, id, script, childArgs) => {
  const logPath = join(ROOT, "data/audits", `recover-source-${id}.${label}.log`);
  const logger = createWriteStream(logPath, { flags: "w" });
  const result = await new Promise((done) => {
    let output = "";
    let ended = false;
    const finish = (code, signal) => {
      if (ended) return;
      ended = true;
      logger.end(() => done({ code, signal, output }));
    };
    child = spawn(process.execPath, [join(ROOT, "scripts", script), ...childArgs], { cwd: ROOT });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (part) => {
      logger.write(part);
      output += part.toString();
      if (output.length > 4_000_000) output = output.slice(-3_000_000);
    });
    child.on("error", (error) => { logger.write(error.message); output += error.message; finish(1, null); });
    child.on("close", (code, signal) => finish(code ?? 1, signal));
  });
  child = null;
  return { exitCode: result.code, signal: result.signal ?? null, log: logPath,
    lastError: result.output.split("\n").filter((s) => /failed|error|skipping|quota/i.test(s)).slice(-5) };
};
let processed = 0;
for (const initial of pending) {
  if (interrupted || processed >= leagueLimit) break;
  processed += 1;
  const id = initial.leagueId;
  const row = report.events.find((s) => s.leagueId === id);
  row.status = "running";
  row.startedAt = new Date().toISOString();
  await save();
  console.log(`${id} ${row.name}: recovering raw matches...`);
  const generatedPath = join(ROOT, "data/generated", `league-${id}.json`);
  const generated = await optionalJson(generatedPath);
  const correctionOutdated = row.seriesCorrections?.some((correction) =>
    !generated?.seriesCorrections?.some((applied) => applied.matchId === correction.matchId
      && applied.seriesId === correction.correctedSeriesId));
  if (row.rawNeeded || !generated || correctionOutdated) {
    row.fetch = await run("fetch", id, "fetch-league.mjs",
      [String(id), "--training", "--source-recovery", "--league-name", row.name]);
    await save();
  }
  if (interrupted) break;
  if (/daily quota exhausted/i.test(row.fetch?.lastError?.join(" ") ?? "")) {
    row.status = "quota_exhausted";
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    break;
  }
  if (row.fetch?.exitCode && !(await exists(generatedPath))) {
    row.status = "fetch_failed";
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    continue;
  }
  const afterFetch = await inspect({ leagueId: id, name: row.name });
  Object.assign(row, afterFetch);
  await save();
  if (row.maxExactPossible < row.requiredExact) {
    console.log(`${id}: raw fields cap exact coverage at ${row.maxExactPossible}/${row.manifestMatches}; skipping replay downloads.`);
    row.auditRun = await run("audit", id, "audit-data.mjs", [String(id), "--write"]);
    const final = await inspect({ leagueId: id, name: row.name });
    Object.assign(row, final);
    row.status = "blocked_raw_fields";
    row.completedAt = new Date().toISOString();
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    continue;
  }
  if (row.malformedSeries.length) {
    row.auditRun = await run("audit", id, "audit-data.mjs", [String(id), "--write"]);
    const final = await inspect({ leagueId: id, name: row.name });
    Object.assign(row, final);
    row.status = "blocked_series_metadata";
    row.completedAt = new Date().toISOString();
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    console.log(`${id}: malformed series metadata (${row.malformedSeries.map((s) => s.seriesId).join(", ")}); replay downloads skipped.`);
    continue;
  }
  if (row.maxWithReplayUrls < row.requiredExact) {
    row.status = "blocked_replay_urls";
    row.completedAt = new Date().toISOString();
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    console.log(`${id}: ${row.replayUrlMissing} replay URLs missing; maximum recoverable coverage is ${row.maxWithReplayUrls}/${row.manifestMatches}.`);
    continue;
  }
  if (row.availableExactCeiling < row.requiredExact) {
    row.status = "raw_incomplete";
    row.completedAt = new Date().toISOString();
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    console.log(`${id}: ${row.rawNeeded} raw maps still missing; available maps cannot reach 90%, so replay downloads wait.`);
    continue;
  }
  if (rawOnly) {
    row.status = row.rawNeeded ? "raw_incomplete" : "raw_ready_for_replays";
    row.completedAt = new Date().toISOString();
    await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
    await save();
    console.log(`${id}: raw ${row.rawReady}/${row.manifestMatches}, best possible ${row.maxExactPossible}/${row.manifestMatches}; replay phase pending.`);
    continue;
  }
  console.log(`${id}: parsing/reusing replay checkpoints...`);
  row.replays = await run("replays", id, "replay-batch.mjs",
    [String(id), ...(replayLimit == null ? [] : ["--limit", String(replayLimit)])]);
  await save();
  if (interrupted) break;
  console.log(`${id}: auditing exact coverage...`);
  row.auditRun = await run("audit", id, "audit-data.mjs", [String(id), "--write"]);
  const final = await inspect({ leagueId: id, name: row.name });
  Object.assign(row, final);
  row.status = final.auditPass ? "pass"
    : final.maxExactPossible < final.requiredExact ? "blocked_raw_fields"
      : final.malformedSeries.length ? "blocked_series_metadata"
        : final.maxWithReplayUrls < final.requiredExact ? "blocked_replay_urls" : "needs_recovery";
  row.completedAt = new Date().toISOString();
  await atomicJson(join(ROOT, "data/audits", `recover-source-${id}.json`), row);
  await save();
  console.log(`${id}: ${final.exactUsable ?? "?"}/${final.manifestMatches} exact, ${row.status}; raw ${final.rawReady}, replay ${final.replayReady}`);
}
for (const row of report.events.filter((e) => e.status === "running")) {
  row.status = interrupted ? "interrupted" : "incomplete";
  await atomicJson(join(ROOT, "data/audits", `recover-source-${row.leagueId}.json`), row);
}
report.status = interrupted ? "interrupted"
  : report.events.some((e) => e.status === "quota_exhausted") ? "quota_exhausted"
    : report.events.every((e) => e.auditPass) ? "all_pass" : "incomplete";
await save();
console.log(`Recovery ${report.status}: ${report.events.filter((e) => e.auditPass).length}/${report.events.length} sources pass. ${reportPath}`);
if (report.status !== "all_pass") process.exitCode = 2;
