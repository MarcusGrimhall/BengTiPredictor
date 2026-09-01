#!/usr/bin/env node
// Simulate a fantasy roster against a tournament.
//
//   npm run simulate -- --help
//
// Every knob that changes an answer is a flag: risk appetite, how many
// Monte Carlo runs, how much history to fit on, and how many chances you get
// when only your best result counts.
//
// The last one is the interesting knob. With one shot you want the highest
// average. With five shots where only the best counts, you want the fattest
// right tail, and those are different rosters.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const lib = (name) => require(join(ROOT, ".validate", `${name}.js`));

const { rankPlayers, matchScores, optimizeEmblems, buildLineups, percentile, riskToPercentile } = lib("fantasy");
const { BANNER_SLOTS, statsForColor, STAT_LABELS } = lib("scoring");
const { toPlayerEntries, actualSeriesByStage, trainingPlayerEntries } = lib("data");
const { shrinkEntries } = lib("reliability");

// Stats are trusted as far as they repeat - see lib/reliability.ts. These
// entries are the predictor, so they are shrunk; anything graded against them
// is not.
let RELIABILITY = null;
try { RELIABILITY = await readJson("reliability.json"); } catch { RELIABILITY = null; }
const predictFrom = (entries) => shrinkEntries(entries, RELIABILITY);
const { STAGE_SLOTS, STAGE_LABELS } = lib("stages");
const { projectMainEvent } = lib("tiBracket");
const { seededRandom } = lib("rng");

// --------------------------------------------------------------------------

const HELP = `
Simulate a fantasy roster against a tournament.

  npm run simulate -- [options]

Data
  --league <id>        Target tournament. Default: the newest non-training one.
  --stage <name>       groupStage | playoffs | both              (default both)
  --source <name>      Where the form comes from:
                         training  fit on events before the target (default)
                         event     fit on the target's own games (in-sample)
  --since <YYYY-MM-DD> Ignore training matches older than this date.
  --months <N>         Only train on the last N months of professional matches
                       before the target event. Overrides --since.
  --lookback <N>       Same, in days. Overrides --months.
  --min-games <N>      Drop entries with fewer than N games.        (default 4)

Model
  --risk <0-100>       0 floor, 50 typical, 100 ceiling.           (default 50)
  --runs <N>           Monte Carlo runs.                        (default 20000)
  --chances <N>        You get N attempts and only the best counts. (default 1)
  --role <name>        core | mid | support | all                  (default all)
  --banner <mode>      optimise | default                     (default optimise)
  --seed <text>        Seed for reproducibility.              (default "sim")

Output
  --top <N>            How many entries to list.                    (default 8)
  --compare-risk       Sweep risk 0..100 and show how the pick changes.
  --json               Machine-readable output.

Examples
  npm run simulate -- --chances 5 --risk 100
  npm run simulate -- --stage groupStage --lookback 120
  npm run simulate -- --compare-risk --chances 5
  npm run simulate -- --league 19719 --role core --runs 50000
`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { console.log(HELP); process.exit(0); }

const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 || i + 1 >= args.length ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);
const num = (name, fallback) => {
  const v = flag(name);
  return v === null || Number.isNaN(Number(v)) ? fallback : Number(v);
};

const opts = {
  league: flag("league"),
  stage: flag("stage", "both"),
  source: flag("source", "training"),
  since: flag("since"),
  lookback: num("lookback", null),
  months: num("months", null),
  minGames: num("min-games", 4),
  risk: Math.max(0, Math.min(100, num("risk", 50))),
  runs: Math.max(100, num("runs", 20000)),
  chances: Math.max(1, num("chances", 1)),
  role: flag("role", "all"),
  banner: flag("banner", "optimise"),
  seed: flag("seed", "sim"),
  top: num("top", 8),
  compareRisk: has("compare-risk"),
  json: has("json")
};

if (!["groupStage", "playoffs", "both"].includes(opts.stage)) {
  console.error(`--stage must be groupStage, playoffs or both, got "${opts.stage}"`);
  process.exit(1);
}
const STAGES_TO_RUN = opts.stage === "both" ? ["groupStage", "playoffs"] : [opts.stage];

const ROLES = opts.role === "all" ? ["core", "mid", "support"] : [opts.role];
const fmt = (n) => Math.round(n).toLocaleString("en-US");

// --------------------------------------------------------------------------

const generated = join(ROOT, "data", "generated");
const readJson = async (name) => JSON.parse(await readFile(join(generated, name), "utf8"));

async function pickLeague() {
  if (opts.league) return readJson(`league-${opts.league}.json`);
  const files = (await readdir(generated)).filter((f) => /^league-\d+\.json$/.test(f));
  const all = [];
  for (const f of files) {
    const l = await readJson(f);
    if (!l.training) all.push(l);
  }
  all.sort((a, b) => b.leagueId - a.leagueId);
  if (!all.length) { console.error("No target tournament. Run: npm run fetch -- <id>"); process.exit(1); }
  return all[0];
}

const league = await pickLeague();

/** Cut-off in unix seconds implied by --since / --lookback, or null. */
function cutoff() {
  if (opts.lookback !== null && league.firstMatch) {
    return league.firstMatch - opts.lookback * 86400;
  }
  if (opts.months !== null && league.firstMatch) {
    return league.firstMatch - opts.months * 30 * 86400;
  }
  if (opts.since) {
    const t = Date.parse(`${opts.since}T00:00:00Z`);
    if (!Number.isNaN(t)) return t / 1000;
  }
  return null;
}

let activeStage = STAGES_TO_RUN[0];
let entries = [];
let sources = [];

async function loadEntries() {
  if (opts.source === "event") {
    return { entries: buildLineups(predictFrom(toPlayerEntries(league, activeStage))), sources: ["the target event itself (in-sample)"] };
  }
  let training;
  try {
    training = await readJson(`training-${league.leagueId}.json`);
  } catch {
    console.error(`No training set for ${league.leagueId}. Build one:`);
    console.error(`  npm run fetch -- <earlier id> --training   (repeat)`);
    console.error(`  npm run train -- ${league.leagueId}`);
    process.exit(1);
  }
  const from = cutoff();
  const kept = from === null ? training.sources : training.sources.filter((s) => s.firstMatch >= from);
  const keptIds = new Set(kept.map((s) => s.leagueId));

  // Filter the merged samples down to the sources still in range.
  const filtered = {
    ...training,
    players: training.players.map((p) => {
      if (from === null) return p;
      const keep = p.sourceLeagues
        ? p.samples.map((_, i) => i).filter(() => true)
        : p.samples.map((_, i) => i);
      return { ...p, samples: keep.map((i) => p.samples[i]) };
    })
  };
  // Sources are whole events, so drop players whose events all fell out.
  if (from !== null) {
    filtered.players = training.players
      .filter((p) => (p.sourceLeagues ?? []).some((id) => keptIds.has(id)))
      .map((p) => p);
  }
  return {
    entries: buildLineups(predictFrom(trainingPlayerEntries(filtered))),
    sources: kept.map((s) => `${s.leagueName} (${new Date(s.firstMatch * 1000).toISOString().slice(0, 10)})`)
  };
}



// How many series each team plays in this stage.
//
// A finished event has an exact answer. A projection does not, and the spread
// matters more than the mean: most of the variance in a tournament total is how
// far the team goes, not how they play on the night. So the projection carries
// the whole distribution and the simulation draws from it.
let seriesByTeam = {};
let seriesSpread = null;

function loadSeries() {
  const actual = actualSeriesByStage(league, activeStage);
  if (Object.keys(actual).length) {
    seriesByTeam = actual;
    seriesSpread = null;
    return;
  }
  const projection = projectMainEvent(league.teams, opts.runs);
  seriesByTeam = projection.seriesByTeam;
  seriesSpread = projection.seriesDistribution ?? null;
}

// --------------------------------------------------------------------------

function bannerFor(role) {
  const slots = STAGE_SLOTS[activeStage];
  const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
  const start = slotOptions.map((o, i) => ({ stat: o[i % o.length], tier: "III", trait: "none" }));
  return opts.banner === "default"
    ? start
    : optimizeEmblems(entries, role, slotOptions, start, opts.risk, seriesByTeam);
}

/** Draws a series count: exact for a finished stage, sampled for a projection. */
function drawSeries(team, random) {
  const spread = seriesSpread?.[team];
  if (spread?.length) {
    let r = random();
    for (let k = 0; k < spread.length; k += 1) {
      r -= spread[k] ?? 0;
      if (r <= 0) return k;
    }
  }
  const mean = seriesByTeam[team] ?? 1;
  const whole = Math.floor(mean);
  return whole + (random() < mean - whole ? 1 : 0);
}

/**
 * One simulated period for an entry.
 *
 * Two sources of randomness, and both matter. How many series the team plays
 * comes from the bracket; how they score in each comes from the entry's own
 * observed series scores, resampled rather than fitted so the shape of the tail
 * survives.
 *
 * The period pays the BEST of those series, not their sum. So playing more
 * series is more attempts at one number - which helps, but as the maximum of
 * more draws rather than as a total.
 */
function simulateEntry(dist, team, random) {
  const series = drawSeries(team, random);
  if (series <= 0) return 0;
  let best = -Infinity;
  for (let i = 0; i < series; i += 1) {
    const draw = dist[Math.floor(random() * dist.length)];
    if (draw > best) best = draw;
  }
  return best;
}

function evaluate(role, risk) {
  const banner = bannerFor(role);
  const ranked = rankPlayers(entries, role, banner, risk, seriesByTeam);
  const random = seededRandom(`${opts.seed}:${role}:${risk}:${opts.chances}:${opts.runs}`);

  const rows = ranked.map((r) => {
    const dist = matchScores(r.player, banner);
    if (!dist.length) return null;
    const series = seriesByTeam[r.player.teamName] ?? 1;
    const team = r.player.teamName;

    // Distribution of the tournament total, and of the best of N attempts.
    const totals = [];
    const bests = [];
    for (let run = 0; run < opts.runs; run += 1) {
      let best = -Infinity;
      for (let c = 0; c < opts.chances; c += 1) {
        const t = simulateEntry(dist, team, random);
        if (c === 0) totals.push(t);
        if (t > best) best = t;
      }
      bests.push(best);
    }
    totals.sort((a, b) => a - b);
    bests.sort((a, b) => a - b);
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

    return {
      entry: r.player,
      modelRank: 0,
      banner,
      matches: dist.length,
      series,
      mean: mean(totals),
      p10: percentile(totals, 10),
      p90: percentile(totals, 90),
      bestOfN: mean(bests),
      bestP90: percentile(bests, 90),
      lift: mean(bests) - mean(totals)
    };
  }).filter(Boolean);

  // Keep the model's own recommendation order before re-sorting, so the sweep
  // can report what the model would actually have told you to pick.
  rows.forEach((row, i) => { row.modelRank = i; });
  const modelPick = rows[0];

  // With one chance you want the highest average; with several you want the
  // highest expected best, which is not always the same entry.
  rows.sort((a, b) => b.bestOfN - a.bestOfN);
  return { banner, rows, modelPick };
}

// --------------------------------------------------------------------------

/** Everything that depends on the stage, for one stage. */
async function runStage(stage) {
  activeStage = stage;
  loadSeries();
  const loaded = await loadEntries();
  entries = loaded.entries.filter((e) => (e.gameLines?.length ?? 0) >= opts.minGames);
  sources = loaded.sources;
}

const results = [];
for (const stage of STAGES_TO_RUN) {
  await runStage(stage);
  if (!entries.length) continue;

  if (opts.json) {
    const block = { stage, roles: {} };
    for (const role of ROLES) {
      const { banner, rows } = evaluate(role, opts.risk);
      block.roles[role] = {
        banner: banner.map((e) => ({ stat: e.stat, tier: e.tier, trait: e.trait })),
        entries: rows.slice(0, opts.top).map((r) => ({
          name: r.entry.name, team: r.entry.teamName, matches: r.matches, series: r.series,
          mean: r.mean, p10: r.p10, p90: r.p90, bestOfN: r.bestOfN, lift: r.lift
        }))
      };
    }
    results.push(block);
    continue;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${league.leagueName} · ${STAGE_LABELS[stage]}`);
  console.log("=".repeat(72));
  console.log(`Form from : ${opts.source === "event" ? "the event itself (in-sample)" : `${sources.length} earlier tournament(s)`}`);
  if (opts.source !== "event") for (const s of sources) console.log(`            ${s}`);
  if (cutoff() !== null) console.log(`Cut-off   : nothing before ${new Date(cutoff() * 1000).toISOString().slice(0, 10)}`);
  console.log(`Entries   : ${entries.length} with at least ${opts.minGames} games`);
  console.log(`Model     : risk ${opts.risk} (${Math.round(riskToPercentile(opts.risk))}th pct) · ${fmt(opts.runs)} runs · ${opts.chances} chance${opts.chances === 1 ? "" : "s"}`);

  if (opts.compareRisk) {
    console.log(`\nRisk sweep - the model's pick at each level, with ${opts.chances} chance${opts.chances === 1 ? "" : "s"}\n`);
    for (const role of ROLES) {
      console.log(`  ${role}`);
      console.log(`    risk   pick                                       average    best of ${opts.chances}`);
      for (const risk of [0, 25, 50, 75, 100]) {
        const { modelPick } = evaluate(role, risk);
        if (!modelPick) continue;
        console.log(`    ${String(risk).padStart(4)}   ${modelPick.entry.name.slice(0, 40).padEnd(42)}` +
          `${fmt(modelPick.mean).padStart(9)}${fmt(modelPick.bestOfN).padStart(12)}`);
      }
      console.log();
    }
    continue;
  }

  for (const role of ROLES) {
    const { banner, rows } = evaluate(role, opts.risk);
    if (!rows.length) { console.log(`\n${role}: no entries`); continue; }

    console.log(`\n${role.toUpperCase()}  banner: ${banner.map((e) => `${STAT_LABELS[e.stat]}/${e.tier}`).join("  ")}`);
    console.log(`  ${"entry".padEnd(38)}${"team".padEnd(18)}${"avg".padStart(9)}${"p10".padStart(9)}${"p90".padStart(9)}${`best of ${opts.chances}`.padStart(12)}${"lift".padStart(9)}`);
    for (const r of rows.slice(0, opts.top)) {
      console.log(`  ${r.entry.name.slice(0, 36).padEnd(38)}${r.entry.teamName.slice(0, 16).padEnd(18)}` +
        `${fmt(r.mean).padStart(9)}${fmt(r.p10).padStart(9)}${fmt(r.p90).padStart(9)}` +
        `${fmt(r.bestOfN).padStart(12)}${("+" + fmt(r.lift)).padStart(9)}`);
    }

    if (opts.chances > 1) {
      const byMean = [...rows].sort((a, b) => b.mean - a.mean)[0];
      const byBest = rows[0];
      if (byMean.entry.id !== byBest.entry.id) {
        console.log(`\n  With 1 chance the pick is ${byMean.entry.name} (${fmt(byMean.mean)} average).`);
        console.log(`  With ${opts.chances} it is ${byBest.entry.name} - lower average (${fmt(byBest.mean)}) but a fatter tail,`);
        console.log(`  worth ${fmt(byBest.bestOfN)} against ${fmt(byMean.bestOfN)}.`);
      } else {
        console.log(`\n  ${byBest.entry.name} wins on both average and best-of-${opts.chances}.`);
      }
    }
  }
}

if (opts.json) {
  console.log(JSON.stringify({ options: opts, league: league.leagueName, stages: results }, null, 2));
}
console.log();
