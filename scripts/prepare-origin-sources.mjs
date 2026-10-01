#!/usr/bin/env node
// Step 1: account-based discovery and resumable source match-manifest acquisition.
// This intentionally does not fetch raw matches, fit a model, or change generated data.
import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { atomicJson, optionalJson, readJson, ROOT } from "./exact-data.mjs";
import { odFetch } from "./opendota.mjs";

const args = process.argv.slice(2);
const value = (flag) => {
  const at = args.indexOf(flag);
  if (at < 0) return null;
  if (!args[at + 1] || args[at + 1].startsWith("--")) throw new Error(`${flag} requires a value`);
  return args[at + 1];
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run prepare-sources -- --target ID --config PRELOCK.json --identity-report IDENTITY.json [--selection CLASSIFICATION.json] [--days 365] [--limit N] [--discovery-report CACHED.json]

An existing discovery report must match the target, cutoff, horizon and exact
account-ID set. Without it, the existing discover-sources command runs live.
Classification must cover every discovered event before main-event manifests
are fetched. --limit caps new API manifest requests for a checkpoint run.
Reports are atomically saved in data/audits/prepare-sources-ID.json.
No raw match, replay, generated file or model is changed.`);
  process.exit(0);
}
const targetId = Number(value("--target"));
const days = Number(value("--days") ?? 365);
const limit = Number(value("--limit") ?? Number.MAX_SAFE_INTEGER);
const configPath = value("--config");
const identityPath = value("--identity-report");
const selectionPath = value("--selection");
const suppliedDiscoveryPath = value("--discovery-report");
if (!Number.isSafeInteger(targetId) || targetId <= 0 || !configPath || !identityPath
  || !Number.isSafeInteger(days) || days < 1 || days > 730
  || !Number.isSafeInteger(limit) || limit < 0) {
  throw new Error("A target, pre-event config, identity report, 1–730 days and nonnegative limit are required. See --help.");
}
const pathOf = (path) => isAbsolute(path) ? path : resolve(ROOT, path);
const config = await readJson(pathOf(configPath));
const identity = await readJson(pathOf(identityPath));
const reportPath = join(ROOT, "data/audits", `prepare-sources-${targetId}.json`);
const stamp = () => new Date().toISOString();
const positive = (x) => Number.isSafeInteger(x) && x > 0;
const exists = async (path) => { try { await access(path); return true; } catch (e) { if (e.code === "ENOENT") return false; throw e; } };
const rosterProblems = [];
if (config.targetLeagueId !== targetId || config.stage !== "groupStage"
  || !positive(config.cutoff) || !positive(config.rosterKnownAt)
  || config.rosterKnownAt > config.cutoff) rosterProblems.push("target, Group stage or pre-cutoff timestamps invalid");
if (typeof config.rosterSource !== "string" || !config.rosterSource.trim()) rosterProblems.push("dated roster source missing");
if (!Array.isArray(config.roster) || !config.roster.length) rosterProblems.push("roster missing");
const roster = Array.isArray(config.roster) ? config.roster : [];
const accountIds = roster.map((p) => p.accountId).sort((a, b) => a - b);
if (accountIds.some((id) => !positive(id)) || new Set(accountIds).size !== accountIds.length) rosterProblems.push("account IDs invalid or repeated");
const teams = new Map();
for (const p of roster) {
  if (!positive(p.teamId) || !p.teamName?.trim() || !p.name?.trim()
    || !positive(p.position) || p.position > 5
    || p.role !== (p.position === 2 ? "mid" : p.position >= 4 ? "support" : "core")) {
    rosterProblems.push(`invalid player/team/position: ${p.accountId}`);
  }
  const team = teams.get(p.teamId) ?? { name: p.teamName, positions: [] };
  if (team.name !== p.teamName) rosterProblems.push(`team name mismatch: ${p.teamId}`);
  team.positions.push(p.position);
  teams.set(p.teamId, team);
}
for (const [teamId, team] of teams) {
  if (team.positions.slice().sort().join(",") !== "1,2,3,4,5") rosterProblems.push(`team ${teamId} lacks a unique starting five`);
}
if (identity.targetLeagueId !== targetId || identity.cutoff !== config.cutoff
  || !Array.isArray(identity.rows) || identity.rows.length !== roster.length) rosterProblems.push("identity audit target, cutoff or row count mismatch");
const identities = new Map((identity.rows ?? []).map((p) => [p.accountId, p]));
for (const p of roster) {
  const proof = identities.get(p.accountId);
  if (!proof || proof.name !== p.name || proof.teamName !== p.teamName || proof.position !== p.position
    || !positive(proof.latestEvidence?.matchId) || !positive(proof.latestEvidence?.endedAt)
    || proof.latestEvidence.endedAt >= config.cutoff) rosterProblems.push(`pre-cutoff identity evidence missing/mismatched: ${p.accountId}`);
}
if (rosterProblems.length) throw new Error(`Roster evidence failed: ${[...new Set(rosterProblems)].join("; ")}`);
const rosterEvidenceFile = config.rosterSource.match(/^([^:]+\.md):/)?.[1];
if (rosterEvidenceFile && !await exists(pathOf(rosterEvidenceFile))) throw new Error(`Dated roster evidence document missing: ${rosterEvidenceFile}`);

let discoveryPath = suppliedDiscoveryPath ? pathOf(suppliedDiscoveryPath)
  : join(ROOT, "data/audits", `source-events-${targetId}.json`);
if (!suppliedDiscoveryPath) {
  // Call the existing account-based discovery tool. Its own OpenDota client
  // handles rate limits/retries. A failed call leaves earlier caches untouched.
  const discovered = spawnSync(process.execPath,
    [join(ROOT, "scripts/discover-source-events.mjs"), "--target", String(targetId),
      "--config", pathOf(configPath), "--days", String(days), "--write"],
    { stdio: "inherit" });
  if (discovered.error) throw discovered.error;
  if (discovered.status !== 0) throw new Error("discover-sources failed; supply a separately verified cached discovery report to resume");
}
const discovery = await readJson(discoveryPath);
if (discovery.targetLeagueId !== targetId || discovery.cutoff !== config.cutoff
  || discovery.days !== days || discovery.since !== config.cutoff - days * 86400
  || discovery.accountCount !== accountIds.length || !Array.isArray(discovery.events)
  || /observed-account proxy/.test(discovery.rosterPolicy ?? "")) {
  throw new Error("Discovery report is incompatible with the supplied pre-event roster/cutoff");
}
// Older reports did not store the requested ID set. Their union is accepted only
// when it covers the whole roster, so a proxy with different IDs cannot pass.
const reportedIds = discovery.accountIds ?? [...new Set(discovery.events.flatMap((e) => e.accountIds ?? []))];
if (reportedIds.length !== accountIds.length
  || reportedIds.slice().sort((a, b) => a - b).some((id, i) => id !== accountIds[i])) {
  throw new Error("Discovery account IDs differ from the verified roster");
}
const discoveryById = new Map();
for (const e of discovery.events) {
  if (!positive(e.leagueId) || discoveryById.has(e.leagueId) || e.leagueId === targetId
    || !Array.isArray(e.accountIds) || e.accountIds.some((id) => !accountIds.includes(id))) {
    throw new Error(`Invalid discovered league or account IDs: ${e.leagueId}`);
  }
  discoveryById.set(e.leagueId, e);
}

const selection = selectionPath ? await readJson(pathOf(selectionPath)) : null;
if (selection && (selection.targetLeagueId !== targetId || selection.cutoff !== config.cutoff
  || !Array.isArray(selection.events))) throw new Error("Classification target/cutoff invalid");
const selectionById = new Map();
for (const e of selection?.events ?? []) {
  if (!positive(e.leagueId) || selectionById.has(e.leagueId) || !discoveryById.has(e.leagueId)
    || !["main", "qualifier", "other"].includes(e.bank)) throw new Error(`Invalid classification: ${e.leagueId}`);
  selectionById.set(e.leagueId, e);
}
const unclassified = discovery.events.filter((e) => !selectionById.has(e.leagueId)).map((e) => ({
  leagueId: e.leagueId, name: e.name, tier: e.tier, rosterPlayers: e.rosterPlayers,
  completedBeforeCutoff: e.completedBeforeCutoff
}));
const uncertain = [];
const selectionProblems = [];
if (!selection) selectionProblems.push("No source classification was supplied");
if (/draft|reconstruct/i.test(configPath + " " + (discovery.rosterPolicy ?? ""))) uncertain.push("Roster is a retrospective reconstruction, not an archived pre-lock 80-account registration; review dated team evidence and aliases.");
if (!discovery.accountIds) uncertain.push("Discovery report predates explicit requested-account list; its union covers all roster IDs and the documented cutoff boundary check is required.");
for (const p of identity.rows) if (p.aliasAgrees === false) uncertain.push(`Alias differs for ${p.name} (${p.accountId}): ${(p.distinctAliases ?? []).join(", ")}`);
for (const e of selection?.events ?? []) {
  const found = discoveryById.get(e.leagueId);
  if (!e.reason?.trim()) selectionProblems.push(`Classification rationale missing: ${e.leagueId}`);
  if (e.bank === "main" && (!e.evidence || !found.completedBeforeCutoff
    || !["premium", "professional"].includes(found.tier))) selectionProblems.push(`Main-event evidence/tier/completion needs review: ${e.leagueId} ${e.name}`);
}
const selectedIds = new Set((selection?.events ?? []).filter((e) => e.bank === "main").map((e) => e.leagueId));
if (Array.isArray(config.sourceLeagueIds)
  && (new Set(config.sourceLeagueIds).size !== selectedIds.size
    || config.sourceLeagueIds.some((id) => !selectedIds.has(id)))) throw new Error("Config sourceLeagueIds differ from reviewed main-event classification");
const previous = await optionalJson(reportPath);
const sameRunInputs = previous?.targetLeagueId === targetId && previous?.cutoff === config.cutoff
  && previous?.days === days && previous?.inputs?.config === configPath
  && previous?.inputs?.identityReport === identityPath
  && previous?.inputs?.selection === selectionPath
  && previous?.inputs?.discoveryReport === discoveryPath;
const fetchedAcrossRuns = new Set(sameRunInputs ? (previous.fetchedLeagueIds ?? previous.events?.filter((e) => e.manifest === "fetched").map((e) => e.leagueId) ?? []) : []);
const report = {
  schemaVersion: 1, targetLeagueId: targetId, cutoff: config.cutoff, days,
  firstStartedAt: sameRunInputs ? previous.firstStartedAt ?? previous.startedAt : stamp(),
  startedAt: stamp(), updatedAt: stamp(), status: "in_progress",
  scope: "Manifest acquisition only; raw/replay counts check file existence, exact audits are separate, no model training",
  inputs: { config: configPath, identityReport: identityPath,
    discoveryReport: discoveryPath, selection: selectionPath },
  roster: { teams: teams.size, players: roster.length, accountsWithPriorMatchEvidence: identities.size,
    source: config.rosterSource, knownAt: config.rosterKnownAt,
    evidenceStatus: /draft|reconstruct/i.test(configPath + " " + (discovery.rosterPolicy ?? "")) ? "retrospective_reconstruction" : "supplied_pre_event_evidence" },
  classification: { main: selectedIds.size,
    qualifier: (selection?.events ?? []).filter((e) => e.bank === "qualifier").length,
    other: (selection?.events ?? []).filter((e) => e.bank === "other").length,
    unclassified },
  uncertainty: uncertain, selectionProblems, fetchedLeagueIds: [], events: []
};
const validity = (manifest, id) => {
  if (!manifest || manifest.leagueId !== id || !Array.isArray(manifest.matches) || !manifest.matches.length) return "missing or malformed manifest";
  const ids = manifest.matches.map((m) => m.match_id);
  if (ids.some((x) => !positive(x)) || new Set(ids).size !== ids.length
    || manifest.matches.some((m) => (m.leagueid != null && m.leagueid !== id)
      || !positive(m.start_time) || !positive(m.duration))) return "invalid match IDs, league IDs or timestamps";
  return null;
};
const summarize = async (selected, manifest, origin) => {
  const found = discoveryById.get(selected.leagueId);
  const ids = manifest.matches.map((m) => m.match_id);
  const raw = await Promise.all(ids.map((id) => exists(join(ROOT, "data/cache/matches", `${id}.json`))));
  const replay = await Promise.all(ids.map((id) => exists(join(ROOT, "data/cache/replay-fantasy/matches", `${id}.json`))));
  const audit = await optionalJson(join(ROOT, "data/audits", `league-${selected.leagueId}.json`));
  const lastEnd = Math.max(...manifest.matches.map((m) => m.start_time + m.duration));
  const issues = [];
  if (!Number.isFinite(lastEnd) || lastEnd >= config.cutoff) issues.push("manifest contains a match ending at/after cutoff or without valid time");
  if (found.eventMaps != null && ids.length !== found.eventMaps) issues.push(`manifest has ${ids.length} maps; discovery counted ${found.eventMaps}`);
  if (audit && audit.expectedMatches !== ids.length) issues.push("existing exact-data audit denominator differs from current manifest");
  return { leagueId: selected.leagueId, name: found.name, bank: "main", evidence: selected.evidence,
    manifest: origin, manifestMatches: ids.length, discoveredMatches: found.eventMaps,
    rawCached: raw.filter(Boolean).length, replayCached: replay.filter(Boolean).length,
    missingRaw: ids.filter((_, i) => !raw[i]).length,
    missingReplay: ids.filter((_, i) => !replay[i]).length,
    missingRawExamples: ids.filter((_, i) => !raw[i]).slice(0, 5),
    missingReplayExamples: ids.filter((_, i) => !replay[i]).slice(0, 5),
    exactAudit: audit?.expectedMatches === ids.length ? { usable: audit.exactUsableMatches, expected: audit.expectedMatches, gatePass: audit.gate?.pass ?? null } : null,
    issues };
};
const save = async () => {
  report.updatedAt = stamp();
  report.fetchedLeagueIds = [...fetchedAcrossRuns].sort((a, b) => a - b);
  report.totals = { manifestCached: report.events.filter((e) => e.manifest === "cached").length,
    manifestFetched: report.events.filter((e) => e.manifest === "fetched").length,
    manifestFetchedAcrossRuns: fetchedAcrossRuns.size,
    manifestMissing: report.events.filter((e) => e.manifest === "missing" || e.manifest === "error").length,
    missingManifestMapsEstimated: report.events.filter((e) => e.manifest === "missing" || e.manifest === "error")
      .reduce((n, e) => n + (e.discoveredMatches ?? 0), 0),
    missingRaw: report.events.reduce((n, e) => n + (e.missingRaw ?? 0), 0),
    missingReplay: report.events.reduce((n, e) => n + (e.missingReplay ?? 0), 0),
    exactAuditMissing: report.events.filter((e) => e.manifest !== "missing" && e.manifest !== "error" && !e.exactAudit).length };
  await atomicJson(reportPath, report);
};
await save();
if (unclassified.length || selectionProblems.length) {
  report.status = "needs_source_review";
  await save();
  console.error(`${unclassified.length} unclassified and ${selectionProblems.length} unresolved source classifications; report: ${reportPath}`);
  process.exitCode = 2;
} else {
  let attempted = 0;
  for (const selected of selection.events.filter((e) => e.bank === "main")) {
    const id = selected.leagueId;
    const cachePath = join(ROOT, "data/cache/leagues", `${id}.json`);
    let manifest, state;
    try { manifest = await optionalJson(cachePath); } catch (error) {
      report.events.push({ leagueId: id, name: selected.name, bank: "main", manifest: "error", error: `Cached manifest unreadable: ${error.message}` });
      await save(); continue;
    }
    const bad = manifest ? validity(manifest, id) : null;
    if (bad) {
      report.events.push({ leagueId: id, name: selected.name, bank: "main", manifest: "error", error: `Cached manifest ${bad}; left untouched` });
      await save(); continue;
    }
    if (manifest) state = "cached";
    else if (attempted >= limit) state = "missing";
    else {
      attempted += 1;
      try {
        const matches = await odFetch(`/leagues/${id}/matches`);
        manifest = { leagueId: id, acquiredAt: stamp(), source: "OpenDota league matches", matches };
        const invalid = validity(manifest, id);
        if (invalid) throw new Error(`API manifest ${invalid}`);
        await atomicJson(cachePath, manifest);
        fetchedAcrossRuns.add(id);
        state = "fetched";
      } catch (error) {
        report.events.push({ leagueId: id, name: selected.name, bank: "main", manifest: "error",
          discoveredMatches: discoveryById.get(id).eventMaps, error: error.message });
        await save();
        console.error(`${id}: ${error.message}`);
        if (/daily quota exhausted/i.test(error.message)) break;
        continue;
      }
    }
    report.events.push(state === "missing"
      ? { leagueId: id, name: selected.name, bank: "main", manifest: "missing", discoveredMatches: discoveryById.get(id).eventMaps }
      : await summarize(selected, manifest, state));
    await save();
    console.log(`${id} ${selected.name}: ${state}${manifest ? `, ${manifest.matches.length} maps` : ""}`);
  }
  const processed = new Set(report.events.map((e) => e.leagueId));
  for (const selected of selection.events.filter((e) => e.bank === "main" && !processed.has(e.leagueId))) {
    report.events.push({ leagueId: selected.leagueId, name: selected.name, bank: "main",
      manifest: "missing", discoveredMatches: discoveryById.get(selected.leagueId).eventMaps,
      reason: "run stopped before this manifest was checked" });
  }
  await save();
  const completed = report.events.length === selectedIds.size && report.totals.manifestMissing === 0;
  report.status = completed ? "manifest_complete" : "incomplete";
  await save();
  console.log(`${report.status}: ${report.totals.manifestFetched} fetched this run, ${report.totals.manifestFetchedAcrossRuns} across runs, ${report.totals.manifestCached} cached, ${report.totals.manifestMissing} missing/errors. ${reportPath}`);
  if (!completed) process.exitCode = 2;
}
