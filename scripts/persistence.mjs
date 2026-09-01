#!/usr/bin/env node
// Is a stat a lasting property of a player, or is it circumstance?
//
//   npm run persistence            # print the tables
//   npm run persistence -- --write # also write data/generated/reliability.json
//
// The ranking assumes that what a player produced before an event predicts what
// they will produce at it. That is true of some stats and false of others, and
// the difference is not small: this finds GPM at 0.86 and First Blood at 0.13.
// A stat near zero means the leader beforehand is not the leader afterwards, so
// ranking entries on it is ranking them on noise.
//
// Three tests, weakest assumption first. None of them tunes anything - this is
// a measurement, and it prints the same numbers whatever the app does with them.
//
//   A. SPLIT-HALF. Odd games against even games, same event, same team, same
//      patch. The friendliest test there is: everything that could carry is held
//      constant. A stat that fails HERE is not a player trait at all.
//
//   B. GROUP -> PLAYOFFS. Predict a player's playoff games from their group
//      games. A genuine forward test - later, and against tougher opponents.
//      Only teams that advanced, so the field is narrower and every figure runs
//      a little low for that reason alone.
//
//   C. PRE-EVENT -> EVENT. What the app actually does. Needs a training file, so
//      it runs on TI 2026 only; the other four have no pre-event sample in this
//      repo. Smallest sample, but the only test of the real question.
//
// Correlations are Spearman (ranks, so a single blow-out game cannot carry a
// stat) and pooled across events through Fisher's z, weighted by sample size.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "generated");
const ROLES = ["core", "mid", "support"];

const load = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

function spearman(a, b) {
  const rank = (xs) => {
    const idx = xs.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i += 1) {
    num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Fisher's z, so events pool without the near-zero ones dragging the mean. */
function poolR(rs, ns) {
  let weight = 0, total = 0;
  rs.forEach((r, i) => {
    if (ns[i] < 5) return;
    const clipped = Math.max(-0.999, Math.min(0.999, r));
    total += (ns[i] - 3) * 0.5 * Math.log((1 + clipped) / (1 - clipped));
    weight += ns[i] - 3;
  });
  return weight ? [Math.tanh(total / weight), weight + 3] : [0, 0];
}

/**
 * Split-half measures a HALF-length sample against another half. The ranking
 * uses the whole sample, which is more reliable than either half, so
 * Spearman-Brown steps the figure up to full length. This is the number that
 * would drive any shrinkage - not the raw split-half.
 */
const spearmanBrown = (r) => (r <= 0 ? Math.max(0, r) : (2 * r) / (1 + r));

const perGame = (rows, order) =>
  Object.fromEntries(order.map((k, j) => [k, mean(rows.map((r) => r[j]))]));

function split(player, order, side) {
  const acc = [[], []];
  player.samples.forEach((row, i) => {
    const h = side(i, player);
    if (h >= 0) acc[h].push(row);
  });
  if (acc[0].length < 3 || acc[1].length < 3) return null;
  return [perGame(acc[0], order), perGame(acc[1], order)];
}

function table(title, note, pairsFor, stats) {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
  console.log(note);
  for (const role of ROLES) {
    const rows = stats.map((stat) => {
      const rs = [], ns = [];
      for (const { A, B } of pairsFor(role, stat)) {
        if (A.length >= 5) { rs.push(spearman(A, B)); ns.push(A.length); }
      }
      const [r, n] = poolR(rs, ns);
      return { stat, r, n };
    }).filter((x) => x.n >= 20).sort((a, b) => b.r - a.r);
    if (!rows.length) continue;
    console.log(`\n  ${role}`);
    for (const { stat, r, n } of rows) {
      const flag = r < 0.2 ? "  <- noise" : r < 0.4 ? "  <- weak" : "";
      console.log(`    ${stat.padEnd(11)} ${r.toFixed(2).padStart(5)}  n=${String(n).padStart(3)}` +
        `  ${"#".repeat(Math.max(0, Math.round(r * 22)))}${flag}`);
    }
  }
}

// ---------------------------------------------------------------------------
const index = load("index.json");
const eventIds = index.filter((l) => !l.training).map((l) => l.leagueId);
const events = eventIds.map((id) => load(`league-${id}.json`)).filter(Boolean);
if (!events.length) {
  console.error("No non-training events in data/generated. Run npm run fetch first.");
  process.exit(1);
}
const STATS = events[0].statOrder;

console.log(`\nStat persistence — ${events.length} event(s): ` +
  events.map((e) => e.leagueName.replace("The International", "TI")).join(", "));

const bySplit = (side) => (role, stat) => events.map((ev) => {
  const A = [], B = [];
  for (const p of ev.players) {
    if (p.role !== role || !p.samples?.length) continue;
    const h = split(p, ev.statOrder, side);
    if (!h) continue;
    A.push(h[0][stat]); B.push(h[1][stat]);
  }
  return { A, B };
});

table("A. Split-half — same event, same team, same patch",
  "  The friendliest test. Below ~0.2 here, a stat is not a player trait at all.",
  bySplit((i) => i % 2), STATS);

table("B. Group stage -> playoffs — a real forward test",
  "  Later games, tougher opponents, advancing teams only (so all figures run low).",
  bySplit((i, p) => { const s = p.sampleStages?.[i]; return s === 0 ? 0 : s === 1 ? 1 : -1; }),
  STATS);

// C. The real question, where a pre-event sample exists.
const withTraining = events.filter((e) => existsSync(join(DIR, `training-${e.leagueId}.json`)));
if (withTraining.length) {
  table("C. Pre-event -> event — what the ranking actually does",
    `  ${withTraining.map((e) => e.leagueName).join(", ")}. The only test of the real` +
    "\n  question, and the smallest sample - read it alongside A rather than alone.",
    (role, stat) => withTraining.map((ev) => {
      const tr = load(`training-${ev.leagueId}.json`);
      const at = new Map(ev.players.map((p) => [p.accountId, p]));
      const A = [], B = [];
      for (const p of tr.players) {
        if (p.role !== role) continue;
        const e = at.get(p.accountId);
        if (!e || e.role !== role) continue;
        const a = p.perGame?.[stat], b = e.perGame?.[stat];
        if (typeof a !== "number" || typeof b !== "number") continue;
        A.push(a); B.push(b);
      }
      return { A, B };
    }), STATS);
}

// ---------------------------------------------------------------------------
console.log(`\n\nFull-sample reliability (split-half, Spearman-Brown corrected)`);
console.log(`${"-".repeat(61)}`);
console.log("  What a shrinkage weight would be built from: 1.00 trust the");
console.log("  measurement, 0.00 treat every entry as the field average.\n");
for (const role of ROLES) {
  const rows = STATS.map((stat) => {
    const rs = [], ns = [];
    for (const { A, B } of bySplit((i) => i % 2)(role, stat)) {
      if (A.length >= 5) { rs.push(spearman(A, B)); ns.push(A.length); }
    }
    const [r, n] = poolR(rs, ns);
    return { stat, r: spearmanBrown(r), n };
  }).filter((x) => x.n >= 20).sort((a, b) => b.r - a.r);
  console.log(`  ${role}: ` + rows.map((x) => `${x.stat} ${x.r.toFixed(2)}`).join(", "));
}
console.log();

// ---------------------------------------------------------------------------
// The table the ranking reads, when asked for it.
//
// Split-half corrected to full length, because that is the reliability of the
// whole sample the ranking actually scores - not of half of it. It is measured
// within an event, so it is an UPPER bound on how much a stat transfers across
// months and roster changes: the real predictive weight is lower, and the
// shrinkage built on this is therefore conservative.
if (process.argv.includes("--write")) {
  const out = { builtAt: new Date().toISOString(), method: "split-half, Spearman-Brown corrected, Fisher-pooled",
    events: events.map((e) => ({ leagueId: e.leagueId, leagueName: e.leagueName })), roles: {} };
  for (const role of ROLES) {
    const entry = {};
    for (const stat of STATS) {
      const rs = [], ns = [];
      for (const { A, B } of bySplit((i) => i % 2)(role, stat)) {
        if (A.length >= 5) { rs.push(spearman(A, B)); ns.push(A.length); }
      }
      const [r, n] = poolR(rs, ns);
      if (n >= 20) entry[stat] = Number(spearmanBrown(r).toFixed(3));
    }
    out.roles[role] = entry;
  }
  writeFileSync(join(DIR, "reliability.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote data/generated/reliability.json\n`);
}
