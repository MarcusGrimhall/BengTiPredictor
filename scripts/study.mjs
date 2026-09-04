#!/usr/bin/env node
// What actually wins fantasy?
//
//   npm run study
//
// This is a backtest, not a fit. Everything on the left of each comparison is
// decided from data that existed BEFORE TI 2026 started. Everything on the
// right is what happened at TI. Nothing here is used to tune a parameter - the
// point is to find out which choices mattered, so the reasoning transfers to
// the next event rather than to this one.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const lib = (n) => require(join(ROOT, ".validate", `${n}.js`));

const { rankPlayers, matchScores, optimizeEmblems, buildLineups, percentile,
        TIERS, TIER_BONUSES, TRAITS } = lib("fantasy");
const { BANNER_SLOTS, statsForColor, STAT_LABELS } = lib("scoring");
const { toPlayerEntries, actualSeriesByStage, trainingPlayerEntries } = lib("data");
const { shrinkEntries } = lib("reliability");
const { STAGE_SLOTS } = lib("stages");
const { SUFFIXES, SUFFIX_BITS, suffixTriggerRate } = lib("titles");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
Backtest: what actually won fantasy at the last finished event.

  npm run study -- [options]

  --runs <N>   Bracket simulation runs where one is needed.   (default 20000)
`);
  process.exit(0);
}
const runsIndex = argv.indexOf("--runs");
const RUNS = runsIndex === -1 || Number.isNaN(Number(argv[runsIndex + 1]))
  ? 20000
  : Math.max(100, Number(argv[runsIndex + 1]));

const readJson = async (f) => JSON.parse(await readFile(join(ROOT, "data", "generated", f), "utf8"));
const league = await readJson("league-19719.json");
const train = await readJson("training-19719.json");
const trainingStats = new Set(train.statOrder);
const trainingStatsForColor = (color) => statsForColor(color).filter((stat) => trainingStats.has(stat));

const ROLES = ["core", "mid", "support"];
const n = (x) => Math.round(x).toLocaleString("en-US");
const head = (t) => console.log(`\n${t}\n${"=".repeat(t.length)}`);
const sub = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

// The predictor is shrunk, `truth` never is - that is the whole point of the
// comparison. See lib/reliability.ts.
let RELIABILITY = null;
try { RELIABILITY = await readJson("reliability.json"); } catch { RELIABILITY = null; }
const before = buildLineups(shrinkEntries(trainingPlayerEntries(train), RELIABILITY));
const truth = {
  groupStage: buildLineups(toPlayerEntries(league, "groupStage")),
  playoffs: buildLineups(toPlayerEntries(league, "playoffs"))
};
const series = {
  groupStage: actualSeriesByStage(league, "groupStage"),
  playoffs: actualSeriesByStage(league, "playoffs")
};

/**
 * What an entry actually banked at TI under a given banner.
 *
 * The best single series, since that is what a period pays.
 */
const banked = (entry, banner) => {
  const series = matchScores(entry, banner);
  return series.length ? series[series.length - 1] : 0;
};

/** A distinct-stat banner from a fixed slot ordering. */
function bannerOf(role, slots, order = 0) {
  const used = new Set();
  return BANNER_SLOTS[role].slice(0, slots).map((c) => {
    const pool = trainingStatsForColor(c).filter((x) => !used.has(x));
    const st = pool[order % pool.length] ?? pool[0];
    used.add(st);
    return { stat: st, tier: "III", trait: "none" };
  });
}

console.log(`Backtest: fitted on ${train.sources.length} pre-TI tournaments ` +
  `(${train.sources.reduce((s, x) => s + x.maps, 0)} maps), graded on The International 2026.`);
console.log("Nothing on the left has seen a single map of the event.");
console.log(`Simulation budget: ${RUNS.toLocaleString("en-US")} runs where a simulation is needed.`);

// ---------------------------------------------------------------------------
head("1. How much does the banner matter, against picking the right entry?");

for (const stage of ["groupStage", "playoffs"]) {
  const slots = STAGE_SLOTS[stage];
  sub(stage === "groupStage" ? "Group stage" : "Playoffs");
  console.log("  role      best banner + best entry   worst banner + best entry   best banner + median entry");
  for (const role of ROLES) {
    const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => trainingStatsForColor(c));
    const start = bannerOf(role, slots);
    const good = optimizeEmblems(before, role, slotOptions, start, 50, {});
    // A deliberately poor but legal banner: the lowest-value stats available.
    const poor = bannerOf(role, slots, 3);

    const pool = truth[stage].filter((e) => e.role === role);
    const byId = new Map(pool.map((e) => [e.id, e]));
    const pick = (banner) => {
      const r = rankPlayers(before.filter((e) => byId.has(e.id)), role, banner, 50, series[stage]);
      return r[0] ? byId.get(r[0].player.id) : null;
    };
    const bestEntry = pick(good);
    const poorEntry = pick(poor);
    if (!bestEntry || !poorEntry) continue;

    const all = pool.map((e) => banked(e, good)).sort((a, b) => a - b);
    const median = all[Math.floor(all.length / 2)];

    console.log(`  ${role.padEnd(9)}${n(banked(bestEntry, good)).padStart(21)}` +
      `${n(banked(poorEntry, poor)).padStart(28)}${n(median).padStart(29)}`);
  }
}

// ---------------------------------------------------------------------------
head("2. Which stats actually paid at TI, and did the pre-TI data know?");

for (const stage of ["groupStage", "playoffs"]) {
  const slots = STAGE_SLOTS[stage];
  sub(stage === "groupStage" ? "Group stage" : "Playoffs");
  for (const role of ROLES) {
    const colours = [...new Set(BANNER_SLOTS[role].slice(0, slots))];
    const rows = [];
    for (const colour of colours) {
      for (const stat of trainingStatsForColor(colour)) {
        const one = [{ stat, tier: "III", trait: "none" }];
        const predicted = before.filter((e) => e.role === role)
          .map((e) => matchScores(e, one).reduce((a, b) => a + b, 0) / Math.max(1, matchScores(e, one).length));
        const actual = truth[stage].filter((e) => e.role === role)
          .map((e) => matchScores(e, one).reduce((a, b) => a + b, 0) / Math.max(1, matchScores(e, one).length));
        if (!predicted.length || !actual.length) continue;
        const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
        rows.push({ stat, colour, before: mean(predicted), at: mean(actual) });
      }
    }
    rows.sort((a, b) => b.at - a.at);
    console.log(`  ${role}`);
    console.log(`    ${"stat".padEnd(24)}${"pre-TI".padStart(9)}${"at TI".padStart(9)}${"change".padStart(9)}`);
    for (const r of rows.slice(0, 6)) {
      const change = ((r.at / Math.max(1, r.before) - 1) * 100);
      console.log(`    ${STAT_LABELS[r.stat].padEnd(24)}${n(r.before).padStart(9)}${n(r.at).padStart(9)}` +
        `${(change >= 0 ? "+" : "") + change.toFixed(0) + "%"}`.padStart(9));
    }
  }
}

// ---------------------------------------------------------------------------
head("3. Traits: what each is worth on a real banner");

{
  const slots = 5;
  const role = "core";
  const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => trainingStatsForColor(c));
  const base = optimizeEmblems(before, role, slotOptions, bannerOf(role, slots), 50, {});
  const entries = truth.playoffs.filter((e) => e.role === role);
  const score = (banner) => entries.reduce((s, e) => s + banked(e, banner), 0) / entries.length;
  const flat = score(base);

  console.log("  Average banked at TI, one trait added to a tier III banner\n");
  console.log(`  ${"trait".padEnd(14)}${"slot 1".padStart(10)}${"slot 3".padStart(10)}${"slot 5".padStart(10)}${"best".padStart(10)}`);
  for (const trait of TRAITS) {
    if (trait === "none") continue;
    const at = [0, 2, 4].map((i) => {
      const b = base.map((e, j) => (j === i ? { ...e, trait } : e));
      return score(b) / flat - 1;
    });
    const best = Math.max(...at);
    console.log(`  ${trait.padEnd(14)}` + at.map((x) => `${(x * 100 >= 0 ? "+" : "")}${(x * 100).toFixed(1)}%`.padStart(10)).join("") +
      `${(best * 100 >= 0 ? "+" : "")}${(best * 100).toFixed(1)}%`.padStart(10));
  }

  console.log("\n  Three of one trait, and the all-different-tiers condition:");
  const allFriendly = base.map((e, i) => (i < 3 ? { ...e, trait: "friendly" } : e));
  console.log(`    three Friendly            ${((score(allFriendly) / flat - 1) * 100).toFixed(1)}%`);
  const fractalReady = base.map((e, i) => ({ ...e, tier: TIERS[i], trait: i === 0 ? "fractal" : "none" }));
  const fractalFlat = base.map((e, i) => ({ ...e, tier: TIERS[i] }));
  console.log(`    Fractal with five different tiers  ${((score(fractalReady) / score(fractalFlat) - 1) * 100).toFixed(1)}%`);
}

// ---------------------------------------------------------------------------
head("4. Tiers: what a quality upgrade is worth");

{
  const role = "core";
  const slotOptions = BANNER_SLOTS[role].slice(0, 5).map((c) => trainingStatsForColor(c));
  const base = optimizeEmblems(before, role, slotOptions, bannerOf(role, 5), 50, {});
  const entries = truth.playoffs.filter((e) => e.role === role);
  const score = (b) => entries.reduce((s, e) => s + banked(e, b), 0) / entries.length;
  const allI = score(base.map((e) => ({ ...e, tier: "I" })));
  console.log("  Average banked at TI, whole banner at each tier\n");
  for (const tier of TIERS) {
    const v = score(base.map((e) => ({ ...e, tier })));
    console.log(`    tier ${tier.padEnd(4)} (+${String(TIER_BONUSES[tier]).padStart(3)}%)   ${n(v).padStart(9)}   ${((v / allI - 1) * 100).toFixed(0)}% over all-tier-I`);
  }
  console.log("\n  One emblem upgraded from III, by slot:");
  const flat = score(base.map((e) => ({ ...e, tier: "III" })));
  for (let i = 0; i < 5; i += 1) {
    const b = base.map((e, j) => ({ ...e, tier: j === i ? "V" : "III" }));
    console.log(`    slot ${i + 1} to tier V   +${((score(b) / flat - 1) * 100).toFixed(1)}%`);
  }
}

// ---------------------------------------------------------------------------
head("5. Suffixes, graded on what happened");

{
  console.log("  Trigger rates measured at TI 2026, and what each was worth\n");
  console.log(`  ${"suffix".padEnd(20)}${"bonus".padStart(7)}${"group".padStart(9)}${"playoffs".padStart(10)}${"worth (po)".padStart(12)}`);
  for (const key of Object.keys(SUFFIX_BITS)) {
    const rate = (stage) => {
      const rs = truth[stage].map((e) => suffixTriggerRate(e, key)).filter((r) => r !== null);
      return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
    };
    const g = rate("groupStage"), p = rate("playoffs");
    console.log(`  ${SUFFIXES[key].label.padEnd(20)}${("+" + SUFFIXES[key].bonus + "%").padStart(7)}` +
      `${(g * 100).toFixed(1)}%`.padStart(9) + `${(p * 100).toFixed(1)}%`.padStart(10) +
      `+${((SUFFIXES[key].bonus / 100) * p * 100).toFixed(2)}%`.padStart(12));
  }
  console.log("\n  Same, but only for the entry the model would have picked:");
  const slotOptions = BANNER_SLOTS.core.slice(0, 5).map((c) => trainingStatsForColor(c));
  const b = optimizeEmblems(before, "core", slotOptions, bannerOf("core", 5), 50, {});
  const pool = truth.playoffs.filter((e) => e.role === "core");
  const byId = new Map(pool.map((e) => [e.id, e]));
  const top = rankPlayers(before.filter((e) => byId.has(e.id)), "core", b, 50, series.playoffs)[0];
  const picked = top ? byId.get(top.player.id) : null;
  if (picked) {
    console.log(`    (${picked.name})`);
    const rows = Object.keys(SUFFIX_BITS).map((k) => {
      const r = suffixTriggerRate(picked, k) ?? 0;
      return { k, r, worth: (SUFFIXES[k].bonus / 100) * r };
    }).sort((a, b2) => b2.worth - a.worth);
    for (const r of rows) {
      console.log(`    ${SUFFIXES[r.k].label.padEnd(20)}fires ${(r.r * 100).toFixed(0).padStart(3)}%   worth +${(r.worth * 100).toFixed(2)}%`);
    }
  }
}

// ---------------------------------------------------------------------------
head("6. Would a highroll setting have paid?");

{
  const stage = "playoffs";
  const slots = STAGE_SLOTS[stage];
  console.log("  The model's pick at each risk level, and what it actually banked\n");
  console.log(`  ${"risk".padStart(5)}  ${"role".padEnd(9)}${"pick".padEnd(34)}${"banked".padStart(10)}${"rank".padStart(8)}`);
  for (const risk of [0, 50, 86, 100]) {
    for (const role of ROLES) {
      const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => trainingStatsForColor(c));
      const b = optimizeEmblems(before, role, slotOptions, bannerOf(role, slots), risk, {});
      const pool = truth[stage].filter((e) => e.role === role);
      const byId = new Map(pool.map((e) => [e.id, e]));
      const r = rankPlayers(before.filter((e) => byId.has(e.id)), role, b, risk, series[stage]);
      if (!r[0]) continue;
      const got = byId.get(r[0].player.id);
      const board = pool.map((e) => banked(e, b)).sort((x, y) => y - x);
      const place = board.indexOf(banked(got, b)) + 1;
      console.log(`  ${String(risk).padStart(5)}  ${role.padEnd(9)}${got.name.slice(0, 32).padEnd(34)}` +
        `${n(banked(got, b)).padStart(10)}${(place + " of " + board.length).padStart(8)}`);
    }
    console.log();
  }
}

console.log();
