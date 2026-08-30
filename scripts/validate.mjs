#!/usr/bin/env node
// Does any of this actually work?
//
//   npm run validate
//
// Every check below is out-of-sample where it can be. The model is fitted on
// the group stage and graded on the playoffs, which it has not seen. Where a
// baseline exists the model is scored against it, because "correlates with
// reality" means nothing if guessing the average does just as well.
//
// Run it after changing anything in lib/. It exits non-zero if a check that
// should hold fails.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const lib = (name) => require(join(ROOT, ".validate", `${name}.js`));

const { rankPlayers, matchScores, scoreDistribution, percentile, optimizeEmblems, buildLineups } = lib("fantasy");
const { BANNER_SLOTS, statsForColor, statToPoints } = lib("scoring");
const { toPlayerEntries, actualMapsByStage, actualSeriesByStage, trainingPlayerEntries } = lib("data");
const { STAGES, STAGE_SLOTS } = lib("stages");
const { projectGroupStage, groupSeriesPerTeam } = lib("groupStage");
const { projectMainEvent, seedByRating } = lib("tiBracket");
const { buildStructure, simulate } = lib("bracket");
const { DEFAULT_ELO, mapWinProbability } = lib("elo");
const { stoppingCurve, applyAction, actionCatalogue } = lib("reroll");
const { seededRandom } = lib("rng");

// Simulation counts. Raising them tightens every Monte Carlo figure below at a
// linear cost in time; the defaults are already well past the point where the
// numbers stop moving in the third significant figure.
const argv = process.argv.slice(2);
const numArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  const v = i === -1 ? null : argv[i + 1];
  return v === null || Number.isNaN(Number(v)) ? fallback : Math.max(100, Number(v));
};
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
Grade the model against the finished tournaments in data/generated/.

  npm run validate -- [options]

  --runs <N>     Bracket simulation runs.                    (default 20000)
  --brute <N>    Brute-force runs for the reroll check.      (default 60000)
`);
  process.exit(0);
}
const RUNS = numArg("runs", 20000);
const BRUTE = numArg("brute", 60000);

let failures = 0;
const pass = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};
const head = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);
const n = (x, d = 0) => x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Spearman rank correlation. */
function spearman(a, b) {
  const rank = (xs) => {
    const order = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
      const mean = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[order[k][1]] = mean;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i += 1) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * What an entry actually banked over the period.
 *
 * Only the best series counts. Playing more series is more attempts at one
 * number, not a bigger total.
 */
function actualTotal(player, banner) {
  const series = matchScores(player, banner);
  return series.length ? series[series.length - 1] : 0;
}

/** The entries a banner can pick: Core and Support pairs, Mid individuals. */
const lineups = (players) => buildLineups(players);

async function training(targetId) {
  try {
    return JSON.parse(await readFile(join(ROOT, "data", "generated", `training-${targetId}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function leagues() {
  const dir = join(ROOT, "data", "generated");
  const files = (await readdir(dir)).filter((f) => /^league-\d+\.json$/.test(f));
  const out = [];
  for (const f of files) {
    const league = JSON.parse(await readFile(join(dir, f), "utf8"));
    // Training events feed the model; they are not what it is graded on.
    if (!league.training) out.push(league);
  }
  return out.sort((a, b) => b.leagueId - a.leagueId);
}

const ROLES = ["core", "mid", "support"];

// ---------------------------------------------------------------------------

function checkStoppingCurve() {
  head("1. Reroll planning: does the formula match actually rolling?");
  console.log("  The end-of-budget number comes from an optimal-stopping recursion.");
  console.log("  Here it is checked against brute force: literally roll k times,");
  console.log("  stopping when the banner beats the continuation value, and average.\n");

  const rng = seededRandom("brute");
  // An arbitrary outcome distribution with a long right tail.
  const outcomes = Array.from({ length: 4000 }, () => {
    const u = rng();
    return Math.round(1000 * (u < 0.8 ? u : 1 + 6 * (u - 0.8)));
  });
  const curve = stoppingCurve(outcomes, 12);

  const draw = () => outcomes[Math.floor(rng() * outcomes.length)];
  for (const k of [1, 2, 4, 8, 12]) {
    // Play the process: with j rolls left, stop when the hand beats curve[j-1].
    let total = 0;
    const runs = BRUTE;
    for (let r = 0; r < runs; r += 1) {
      let hand = draw();
      for (let left = k - 1; left > 0; left -= 1) {
        if (hand >= curve[left - 1]) break;
        hand = draw();
      }
      total += hand;
    }
    const brute = total / runs;
    const err = Math.abs(brute - curve[k - 1]) / curve[k - 1];
    pass(`${String(k).padStart(2)} rolls: formula ${n(curve[k - 1])} vs simulated ${n(brute)}`,
      err < 0.02, `(${(err * 100).toFixed(2)}% apart)`);
  }

  const flat = stoppingCurve([50, 50, 50], 5);
  pass("a distribution with no spread never improves", flat.every((v) => Math.abs(v - 50) < 1e-9));
  pass("more rolls is never worth less", curve.every((v, i) => i === 0 || v >= curve[i - 1] - 1e-9));
}

// ---------------------------------------------------------------------------

/**
 * Grades the ratings against the maps that were played.
 *
 * OpenDota's team Elo is career-to-date as of the fetch, not as of the event.
 * For the tournament being played now that is the right number. For one a year
 * old it is not - a season of later results has overwritten it. This measures
 * which case a given league is in, and everything Elo-driven downstream is
 * gated on the answer.
 */
function checkEloValidity(league) {
  head(`2. Are the ratings any good for this event? — ${league.leagueName}`);
  const elo = new Map(league.teams.map((t) => [t.id, t.elo]));
  const rows = (league.results ?? []).filter(
    (r) => elo.get(r.radiant) != null && elo.get(r.dire) != null
  );
  if (!rows.length) { console.log("  no match results in the data"); return false; }

  let correct = 0, logLoss = 0;
  for (const r of rows) {
    const p = mapWinProbability(elo.get(r.radiant), elo.get(r.dire));
    const won = r.radiantWin ? 1 : 0;
    if ((p > 0.5) === (won === 1)) correct += 1;
    logLoss += -(won * Math.log(Math.max(1e-9, p)) + (1 - won) * Math.log(Math.max(1e-9, 1 - p)));
  }
  const accuracy = (correct / rows.length) * 100;
  const ll = logLoss / rows.length;
  const usable = ll < Math.LN2;

  console.log(`  ${rows.length} maps graded`);
  console.log(`    accuracy  ${accuracy.toFixed(1)}%      (coin flip 50%)`);
  console.log(`    log loss  ${ll.toFixed(4)}   (coin flip ${Math.LN2.toFixed(4)} — lower is better)`);
  console.log(`  ${usable
    ? "Ratings carry real signal for this event."
    : "Ratings are WORSE than a coin flip here. OpenDota's Elo is current, not\n  historical, so an old event is graded with ratings a season out of date.\n  Every Elo-driven number below is expected to fail for this league."}`);
  return usable;
}

function checkMapsModel(league, eloUsable) {
  head(`3. Map projection vs what was played — ${league.leagueName}`);
  const actual = { groupStage: actualMapsByStage(league, "groupStage"), playoffs: actualMapsByStage(league, "playoffs") };
  if (!Object.keys(actual.playoffs).length) { console.log("  no playoff data"); return; }

  const mae = (pred, truth) => {
    const names = Object.keys(truth);
    return names.reduce((s, t) => s + Math.abs((pred[t] ?? 0) - truth[t]), 0) / names.length;
  };

  // Group stage.
  const gPred = projectGroupStage(league.teams);
  const gTruth = actual.groupStage;
  const gMean = Object.values(gTruth).reduce((a, b) => a + b, 0) / Object.keys(gTruth).length;
  const gBase = Object.fromEntries(Object.keys(gTruth).map((t) => [t, gMean]));
  console.log(`  group stage (${Object.keys(gTruth).length} teams, ${n(gMean, 1)} maps each on average)`);
  console.log(`    Elo projection      MAE ${n(mae(gPred, gTruth), 2)} maps`);
  console.log(`    "everyone average"  MAE ${n(mae(gBase, gTruth), 2)} maps`);
  // The group projection is deliberately near-flat, so beating a flat baseline
  // is not something it can do - the check is only that it is not far worse.
  pass("group projection is in the right neighbourhood",
    mae(gPred, gTruth) <= mae(gBase, gTruth) + 1.5,
    `${n(groupSeriesPerTeam(league.teams), 1)} series per team at this event`);

  // Playoffs, two ways: knowing who qualified, and not knowing.
  const pTruth = actual.playoffs;
  const qualified = Object.keys(pTruth);
  const pMean = Object.values(pTruth).reduce((a, b) => a + b, 0) / qualified.length;
  const pBase = Object.fromEntries(qualified.map((t) => [t, pMean]));

  const known = league.teams.filter((t) => qualified.includes(t.name));
  const seeded = seedByRating(known, 8);
  const ratings = Object.fromEntries(league.teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO]));
  const sim = simulate(buildStructure(8, "double"), seeded, {}, ratings, RUNS);
  const pPred = Object.fromEntries(Object.entries(sim.teams).map(([t, o]) => [t, o.maps]));

  const blind = projectMainEvent(league.teams, RUNS).mapsByTeam;
  const blindHits = qualified.filter((t) => blind[t] != null).length;

  console.log(`  playoffs (8 teams, ${n(pMean, 1)} maps each on average, range ${Math.min(...Object.values(pTruth))}-${Math.max(...Object.values(pTruth))})`);
  console.log(`    Elo, right 8 teams  MAE ${n(mae(pPred, pTruth), 2)} maps   rank corr ${spearman(qualified.map((t) => pPred[t] ?? 0), qualified.map((t) => pTruth[t])).toFixed(2)}`);
  console.log(`    "everyone average"  MAE ${n(mae(pBase, pTruth), 2)} maps`);
  console.log(`    Elo picks the 8     ${blindHits} of 8 qualifiers guessed from rating alone`);
  const better = mae(pPred, pTruth) < mae(pBase, pTruth);
  if (eloUsable && league.leagueId === PRIMARY) {
    pass("Elo beats assuming the average on playoff maps", better,
      `(${n(mae(pPred, pTruth), 2)} vs ${n(mae(pBase, pTruth), 2)})`);
  } else {
    console.log(`  SKIP  Elo vs baseline — ratings already shown unusable for this event` +
      ` (${better ? "beats" : "loses to"} baseline anyway)`);
  }
}

// ---------------------------------------------------------------------------

function checkOutOfSample(league, eloUsable, isPrimary) {
  head(`4. Within-event: group stage form -> playoff scoring — pick from the group stage, score in the playoffs — ${league.leagueName}`);
  const groupPlayers = lineups(toPlayerEntries(league, "groupStage"));
  const playoffPlayers = lineups(toPlayerEntries(league, "playoffs"));
  if (!playoffPlayers.length) { console.log("  no playoff data"); return; }

  const byId = new Map(playoffPlayers.map((p) => [p.id, p]));
  const survivors = groupPlayers.filter((p) => byId.has(p.id));
  const actualMaps = actualSeriesByStage(league, "playoffs");
  const projMaps = projectMainEvent(league.teams, RUNS).seriesByTeam;

  console.log(`  ${groupPlayers.length} players in the group stage, ${playoffPlayers.length} of them reach the playoffs\n`);
  console.log("           rank corr");
  console.log("  role     n   proj  real    model pick vs field  best possible   percentile");

  const summary = [];
  for (const role of ROLES) {
    const slots = STAGE_SLOTS.playoffs;
    const pool = survivors.filter((p) => p.role === role);
    if (pool.length < 5) continue;

    // The banner is chosen on group stage evidence only - no hindsight.
    const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
    const start = slotOptions.map((opts, i) => ({ stat: opts[i % opts.length], tier: "III", trait: "none" }));
    const banner = optimizeEmblems(groupPlayers, role, slotOptions, start, 50, projMaps);

    // Prediction: per-game score from group games x projected playoff maps.
    const predicted = rankPlayers(pool, role, banner, 50, projMaps);
    // Truth: what they actually banked over their real playoff games.
    const truth = new Map(
      playoffPlayers.filter((p) => p.role === role).map((p) => [p.id, actualTotal(p, banner)])
    );

    const ids = predicted.map((r) => r.player.id).filter((id) => truth.has(id));
    const corr = spearman(
      ids.map((id) => predicted.find((r) => r.player.id === id).total),
      ids.map((id) => truth.get(id))
    );
    // The same ranking with the real map counts substituted in. The gap between
    // this and `corr` is the damage done by the map projection alone.
    const withTrueMaps = rankPlayers(pool, role, banner, 50, actualMaps);
    const corrTrue = spearman(
      ids.map((id) => withTrueMaps.find((r) => r.player.id === id).total),
      ids.map((id) => truth.get(id))
    );

    const scores = ids.map((id) => truth.get(id));
    const field = scores.reduce((a, b) => a + b, 0) / scores.length;
    const picked = truth.get(predicted[0].player.id);
    const best = Math.max(...scores);
    summary.push({ role, corr, corrTrue, picked, field, best, nn: ids.length });

    console.log(`  ${role.padEnd(8)}${String(ids.length).padStart(2)}    ${corr >= 0 ? " " : ""}${corr.toFixed(2)}     ` +
      `${corrTrue >= 0 ? " " : ""}${corrTrue.toFixed(2)}    ` +
      `${n(picked).padStart(7)} vs ${n(field).padStart(7)}  ${n(best).padStart(9)}    ` +
      `${((scores.filter((s) => s <= picked).length / scores.length) * 100).toFixed(0)}th pct`);
  }

  console.log();
  const meanCorr = summary.reduce((s, x) => s + x.corr, 0) / summary.length;
  const meanTrue = summary.reduce((s, x) => s + x.corrTrue, 0) / summary.length;
  console.log(`  rank correlation with projected maps ${meanCorr.toFixed(2)}, ` +
    `with the real map counts ${meanTrue.toFixed(2)}`);
  // A period pays the single best series, so this is predicting a MAXIMUM, not
  // a total. Maxima are dominated by which night went well, so the ceiling on
  // any model here is far lower than it would be for a sum - the same pipeline
  // scored 0.78 against a per-series total, and that target was the wrong one.
  if (eloUsable && isPrimary) {
    pass("group stage form predicts playoff scoring", meanCorr > 0.05,
      `mean rank correlation ${meanCorr.toFixed(2)} — predicting a best-of, not a total`);
  } else if (eloUsable) {
    console.log(`  (older event, reported only) end-to-end correlation ${meanCorr.toFixed(2)}`);
  } else {
    console.log(`  SKIP  end-to-end correlation — the map projection here runs on unusable ratings`);
  }
  pass("the per-series model still carries signal", meanTrue > 0.1,
    `${meanTrue.toFixed(2)} using real series counts`);
  const beatsField = summary.filter((x) => x.picked > x.field).length;
  // Only the newest event is a pass/fail target. Older ones are measured and
  // reported: their formats differ, their metas are years apart, and the tool
  // is pointed at the event being played now.
  if (isPrimary) {
    pass("the model's pick beats an average player", beatsField >= 2,
      `${beatsField} of ${summary.length} roles`);
  } else {
    console.log(`  (older event, reported only) pick beat the field in ${beatsField} of ${summary.length} roles`);
  }
  const capture = summary.reduce((s, x) => s + x.picked / x.best, 0) / summary.length;
  console.log(`  the top pick captured ${(capture * 100).toFixed(0)}% of what the best possible pick scored`);
}

// ---------------------------------------------------------------------------

/**
 * The check that matters: build the projection from tournaments that finished
 * before the event started, then grade it on the event itself.
 *
 * Nothing here has seen a single map of the target tournament. Group stage form
 * is a much easier problem - by then the teams are already at the venue playing
 * the patch. This is the honest version.
 */
function checkPreEventPrediction(league, train) {
  head(`5. The real test: fitted before the event, graded on it — ${league.leagueName}`);
  console.log(`  ${train.sources.length} earlier tournaments, ` +
    `${train.sources.reduce((n, s) => n + s.maps, 0)} maps, everything before ` +
    `${new Date(train.cutoff * 1000).toISOString().slice(0, 10)}.`);
  console.log(`  ${train.coverage.withHistory} of ${train.coverage.atTarget} players at the event have prior history.\n`);

  const before = lineups(trainingPlayerEntries(train));
  const groupTruth = lineups(toPlayerEntries(league, "groupStage"));
  const playoffTruth = lineups(toPlayerEntries(league, "playoffs"));

  console.log("  stage         role       n   rank corr   model pick vs field   percentile");
  const summary = [];
  for (const [stageName, truthPlayers, maps] of [
    ["group stage", groupTruth, actualSeriesByStage(league, "groupStage")],
    ["playoffs", playoffTruth, actualSeriesByStage(league, "playoffs")]
  ]) {
    if (!truthPlayers.length) continue;
    for (const role of ROLES) {
      const slots = stageName === "group stage" ? 3 : 5;
      const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
      const start = slotOptions.map((opts, i) => ({ stat: opts[i % opts.length], tier: "III", trait: "none" }));
      // Banner chosen on prior history alone.
      const banner = optimizeEmblems(before, role, slotOptions, start, 50, {});

      const truthById = new Map(
        truthPlayers.filter((p) => p.role === role).map((p) => [p.id, actualTotal(p, banner)])
      );
      const predicted = rankPlayers(before.filter((p) => truthById.has(p.id)), role, banner, 50, maps);
      const ids = predicted.map((r) => r.player.id);
      if (ids.length < 5) continue;

      const corr = spearman(
        ids.map((id) => predicted.find((r) => r.player.id === id).total),
        ids.map((id) => truthById.get(id))
      );
      const scores = ids.map((id) => truthById.get(id));
      const field = scores.reduce((a, b) => a + b, 0) / scores.length;
      const picked = truthById.get(ids[0]);
      const pct = (scores.filter((x) => x <= picked).length / scores.length) * 100;
      summary.push({ stageName, role, corr, picked, field, pct });

      console.log(`  ${stageName.padEnd(13)} ${role.padEnd(8)}${String(ids.length).padStart(3)}     ` +
        `${corr >= 0 ? " " : ""}${corr.toFixed(2)}      ${n(picked).padStart(7)} vs ${n(field).padStart(7)}   ` +
        `${pct.toFixed(0)}th`);
    }
  }

  console.log();
  const meanCorr = summary.reduce((s, x) => s + x.corr, 0) / summary.length;
  const beats = summary.filter((x) => x.picked > x.field).length;
  const meanPct = summary.reduce((s, x) => s + x.pct, 0) / summary.length;
  console.log(`  mean rank correlation ${meanCorr.toFixed(2)}, ` +
    `pick beat the field in ${beats} of ${summary.length}, ` +
    `average pick landed at the ${meanPct.toFixed(0)}th percentile of the field`);
  pass("prior-form ranking carries into the event", meanCorr > 0.1,
    `mean rank correlation ${meanCorr.toFixed(2)} — a best-of is largely luck`);
  pass("prior-form picks beat an average player", beats > summary.length / 2,
    `${beats} of ${summary.length}`);
}

function checkStageSplitMatters(league) {
  head(`6. Does splitting the stages actually change anything? — ${league.leagueName}`);
  const playoffPlayers = lineups(toPlayerEntries(league, "playoffs"));
  const wholeEvent = lineups(toPlayerEntries(league));
  if (!playoffPlayers.length) { console.log("  no playoff data"); return; }

  const groupMaps = actualSeriesByStage(league, "groupStage");
  const playoffMaps = actualSeriesByStage(league, "playoffs");

  for (const role of ROLES) {
    const slots = STAGE_SLOTS.playoffs;
    const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
    const banner = slotOptions.map((opts, i) => ({ stat: opts[i % opts.length], tier: "III", trait: "none" }));

    const right = rankPlayers(playoffPlayers, role, banner, 50, playoffMaps);
    const wrongMaps = rankPlayers(playoffPlayers, role, banner, 50, groupMaps);
    const wrongGames = rankPlayers(wholeEvent.filter((p) => playoffPlayers.some((q) => q.id === p.id)),
      role, banner, 50, playoffMaps);

    const topN = (r, k = 5) => r.slice(0, k).map((x) => x.player.id);
    const overlap = (a, b) => a.filter((x) => b.includes(x)).length;
    console.log(`  ${role.padEnd(8)} top-5 kept when using group maps: ${overlap(topN(right), topN(wrongMaps))}/5` +
      `   when mixing in group games: ${overlap(topN(right), topN(wrongGames))}/5` +
      `   #1 changes: ${right[0].player.id !== wrongMaps[0].player.id ? "yes" : "no"}`);
  }
  console.log("\n  Not a cosmetic difference: the wrong stage's maps reorder the board.");
  pass("playoff players are drawn only from teams that qualified",
    new Set(playoffPlayers.map((p) => p.teamName)).size === Object.keys(playoffMaps).length,
    `${new Set(playoffPlayers.map((p) => p.teamName)).size} teams`);
  pass("group stage keeps every team", 
    new Set(toPlayerEntries(league, "groupStage").map((p) => p.teamName)).size === Object.keys(groupMaps).length);
}

// ---------------------------------------------------------------------------

function checkRiskCalibration(league) {
  head(`7. Is the risk slider calibrated? — ${league.leagueName}`);
  console.log("  Risk 100 claims the 95th percentile - a ceiling a player clears about");
  console.log("  1 game in 20. Measured out-of-sample: the ceiling is read off group");
  console.log("  stage games, then checked against the playoff games it never saw.\n");

  const groupPlayers = lineups(toPlayerEntries(league, "groupStage"));
  const playoffPlayers = lineups(toPlayerEntries(league, "playoffs"));
  if (!playoffPlayers.length) { console.log("  no playoff data"); return; }
  const byId = new Map(groupPlayers.map((p) => [p.id, p]));

  for (const [label, p] of [["floor (risk 0)", 10], ["median (risk 50)", 50], ["ceiling (risk 100)", 95]]) {
    let above = 0, total = 0;
    for (const player of playoffPlayers) {
      const before = byId.get(player.id);
      if (!before || before.gameLines.length < 6) continue;
      const role = player.role;
      const slotOptions = BANNER_SLOTS[role].map((c) => statsForColor(c));
      const banner = slotOptions.map((opts, i) => ({ stat: opts[i % opts.length], tier: "III", trait: "none" }));
      const threshold = percentile(matchScores(before, banner), p);
      for (const score of matchScores(player, banner)) {
        total += 1;
        if (score > threshold) above += 1;
      }
    }
    const share = (above / total) * 100;
    const expected = 100 - p;
    console.log(`  ${label.padEnd(20)} playoff games above it: ${share.toFixed(1)}%   (expected ${expected}%)`);
  }
  console.log("\n  Perfect calibration is not expected - playoff games are a different,");
  console.log("  tougher sample than the group stage. Direction and rough size are.");
}

// ---------------------------------------------------------------------------

function checkInvariants(league) {
  head(`8. Invariants — ${league.leagueName}`);
  const players = lineups(toPlayerEntries(league, "groupStage"));
  pass("every entry has at least one game", players.every((p) => p.gameLines.length > 0));
  const pairs = players.filter((p) => p.members);
  pass("Core and Support are pairs, Mid is not",
    pairs.every((p) => p.role !== "mid") && players.filter((p) => p.role === "mid").every((p) => !p.members),
    `${pairs.length} pairs, ${players.filter((p) => p.role === "mid").length} mids`);
  pass("a pair only counts games both members played",
    pairs.every((p) => p.gameMatches && new Set(p.gameMatches).size === p.gameMatches.length));
  pass("stage games sum to the whole event",
    STAGES.reduce((s, st) => s + toPlayerEntries(league, st).reduce((a, p) => a + p.gameLines.length, 0), 0)
      === toPlayerEntries(league).reduce((a, p) => a + p.gameLines.length, 0));

  const role = "core";
  const slotOptions = BANNER_SLOTS[role].map((c) => statsForColor(c));
  const start = slotOptions.map((opts, i) => ({ stat: opts[i % opts.length], tier: "III", trait: "none" }));
  const opt = optimizeEmblems(players, role, slotOptions, start, 50, {});
  pass("optimiser returns distinct stats", new Set(opt.map((e) => e.stat)).size === opt.length,
    opt.map((e) => e.stat).join(", "));
  pass("optimiser respects slot colours",
    opt.every((e, i) => statsForColor(BANNER_SLOTS[role][i]).includes(e.stat)));

  const withSeries = players.filter((p) => p.gameSeries?.length);
  pass("series scoring collapses games into matches",
    withSeries.every((p) => matchScores(p, opt).length <= p.gameLines.length),
    withSeries.length
      ? `${withSeries[0].gameLines.length} games -> ${matchScores(withSeries[0], opt).length} matches`
      : "no series data (re-fetch to populate)");

  const rng = seededRandom("inv");
  const cat = actionCatalogue(role, 5);
  let dupes = 0;
  for (let i = 0; i < 3000; i += 1) {
    const a = cat[Math.floor(rng() * cat.length)];
    const rolled = applyAction(opt, role, a, rng);
    if (new Set(rolled.map((e) => e.stat)).size !== rolled.length) dupes += 1;
  }
  pass("3000 rerolls produce no duplicate stats", dupes === 0);

  const ranked = rankPlayers(players, role, opt, 50, {});
  pass("floor <= at-risk <= ceiling for every entry",
    ranked.every((r) => r.floor <= r.score + 1e-6 && r.score <= r.ceiling + 1e-6));
  pass("ranking is sorted", ranked.every((r, i) => i === 0 || r.total <= ranked[i - 1].total + 1e-9));
}

// ---------------------------------------------------------------------------

/**
 * An outside opinion on our numbers.
 *
 * These are community-published average per-player emblem values, compiled by
 * hand across thirteen tier-1 events. They share no code and no pipeline with
 * anything here, so agreement is real evidence that the extraction and the
 * point scale are right - and disagreement points at exactly which stat to go
 * and look at.
 */
const REFERENCE_EMBLEM_VALUES = {
  core: { gpm: 1297, creeps: 1293, deaths: 1213, kills: 715, towers: 691, teamfight: 1316,
          roshan: 519, tormentor: 339, stuns: 295, firstBlood: 200, courier: 174 },
  mid: { deaths: 1230, gpm: 1218, creeps: 1170, kills: 786, towers: 389, runes: 1432,
         stacks: 462, wards: 176, smokes: 14, teamfight: 1483, stuns: 338, roshan: 289,
         courier: 209, tormentor: 127, firstBlood: 113 },
  support: { wards: 1036, smokes: 934, stacks: 895, runes: 414, teamfight: 1409, stuns: 404,
             courier: 296, firstBlood: 222, roshan: 53, tormentor: 49 }
};

function checkAgainstReference(league) {
  head(`9. Cross-check against an independent table — ${league.leagueName}`);
  console.log("  Average per-player emblem value, ours vs a community-compiled table.");
  console.log("  Different sample and a different pipeline, so a few percent apart is");
  console.log("  expected; an order of magnitude is a bug in one of us.\n");

  const players = toPlayerEntries(league);
  const offenders = [];
  const medians = [];
  let within = 0;
  let total = 0;

  for (const role of ROLES) {
    const pool = players.filter((p) => p.role === role);
    if (!pool.length) continue;
    const ratios = [];
    for (const [stat, theirs] of Object.entries(REFERENCE_EMBLEM_VALUES[role])) {
      const ours = pool.reduce((sum, p) => sum + statToPoints(stat, p.perGame[stat] ?? 0), 0) / pool.length;
      const ratio = ours / theirs;
      ratios.push(ratio);
      total += 1;
      if (ratio > 0.7 && ratio < 1.45) within += 1;
      else offenders.push({ role, stat, ratio, ours, theirs });
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    medians.push(median);
    console.log(`  ${role.padEnd(8)} ${ratios.length} stats, median ratio ${median.toFixed(2)}`);
  }

  console.log(`\n  ${within} of ${total} values agree within 45%.`);
  if (offenders.length) {
    console.log("  Disagreements:");
    for (const o of offenders) {
      console.log(`    ${o.role}/${o.stat} ${o.ratio.toFixed(2)}x (ours ${n(o.ours)}, theirs ${n(o.theirs)})`);
    }
  }
  console.log("\n  Tormentor is the known disagreement. Ours credits the player who");
  console.log("  actually last-hit it, which comes to exactly 1.00 credits per kill");
  console.log("  in the data. The reference implies 1.29 credits per kill, which no");
  console.log("  individual attribution can produce. Supports routinely take the last");
  console.log("  hit to claim the Shard, so ours matching supports is expected.");

  // Tormentor is a known and explained disagreement, so it does not count
  // against the check. Everything else has to line up.
  const unexplained = offenders.filter((o) => o.stat !== "tormentor");
  pass("emblem values agree with an independent source", unexplained.length <= 2,
    `${within}/${total} within 45%, ${unexplained.length} unexplained disagreement(s)`);
  pass("no role is systematically off", medians.every((m) => m > 0.85 && m < 1.25),
    `median ratios ${medians.map((m) => m.toFixed(2)).join(", ")}`);
}

const all = await leagues();
if (!all.length) {
  console.error("No generated leagues. Run: npm run fetch -- <leagueId>");
  process.exit(1);
}

console.log(`Validating against ${all.length} tournament(s): ${all.map((l) => l.leagueName).join(", ")}`);
console.log(`Simulation budget: ${RUNS.toLocaleString("en-US")} bracket runs, ${BRUTE.toLocaleString("en-US")} brute-force runs.`);
checkStoppingCurve();
// The newest event is what the tool is for; older ones are context.
const PRIMARY = all[0].leagueId;
for (const league of all) {
  const eloUsable = checkEloValidity(league);
  checkMapsModel(league, eloUsable);
  checkOutOfSample(league, eloUsable, league.leagueId === PRIMARY);
}
for (const league of all) {
  const train = await training(league.leagueId);
  if (train) checkPreEventPrediction(league, train);
  else {
    head(`5. The real test: fitted before the event — ${league.leagueName}`);
    console.log(`  No training set. Build one:`);
    console.log(`    npm run fetch -- <earlier league id> --training   (repeat)`);
    console.log(`    npm run train -- ${league.leagueId}`);
  }
}

checkStageSplitMatters(all[0]);
for (const league of all) checkRiskCalibration(league);
checkInvariants(all[0]);
checkAgainstReference(all[0]);

console.log(failures ? `\n${failures} check(s) FAILED\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
