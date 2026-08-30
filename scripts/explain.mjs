#!/usr/bin/env node
// Show the whole arithmetic behind one number.
//
//   npm run explain -- --stat creeps --role core --stage playoffs
//
// Every step from the raw match files to the figure on the page, so the chain
// can be checked by hand rather than taken on trust.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const lib = (n) => require(join(ROOT, ".validate", `${n}.js`));

const { POINT_VALUES, STAT_LABELS, statToPoints } = lib("scoring");
const { TIER_BONUSES } = lib("fantasy");

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 || i + 1 >= args.length ? d : args[i + 1];
};
if (args.includes("--help")) {
  console.log(`
Show the arithmetic behind one stat's number.

  npm run explain -- [options]

  --league <id>    Tournament.                      (default newest)
  --stat <key>     creeps, gpm, kills, wards, ...   (default creeps)
  --role <name>    core | mid | support             (default core)
  --stage <name>   groupStage | playoffs            (default playoffs)
  --tier <I-V>     Emblem tier.                     (default III)
`);
  process.exit(0);
}

const stat = flag("stat", "creeps");
const role = flag("role", "core");
const stage = flag("stage", "playoffs");
const tier = flag("tier", "III");

const dir = join(ROOT, "data", "generated");
const leagueId = flag("league") ?? (await (async () => {
  const files = (await readdir(dir)).filter((f) => /^league-\d+\.json$/.test(f));
  const ids = [];
  for (const f of files) {
    const l = JSON.parse(await readFile(join(dir, f), "utf8"));
    if (!l.training) ids.push(l.leagueId);
  }
  return Math.max(...ids);
})());

const league = JSON.parse(await readFile(join(dir, `league-${leagueId}.json`), "utf8"));
const cacheDir = join(ROOT, "data", "cache", "matches");

console.log(`\n${league.leagueName} · ${stage} · ${role} · ${STAT_LABELS[stat]} · tier ${tier}\n`);
console.log("The rules being applied");
console.log("-----------------------");
const pv = POINT_VALUES[stat];
console.log(`  1. Points for the stat:  ${pv.base ? `${pv.base} ${pv.per < 0 ? "−" : "+"} ${Math.abs(pv.per)} ×` : `${pv.per} ×`} ${STAT_LABELS[stat].toLowerCase()}`);
console.log(`  2. Emblem tier ${tier}:       × ${(1 + TIER_BONUSES[tier] / 100).toFixed(2)}  (+${TIER_BONUSES[tier]}%)`);
console.log(`  3. A ${role === "mid" ? "mid is one player" : `${role} slot holds two players`}${role === "mid" ? "" : ":  their two values are combined"}`);
console.log(`  4. A series scores from its two highest games`);
console.log(`  5. The entry's number is the mean across its series\n`);

// --- gather the raw games from the cache ---
const roster = {};
for (const p of league.players.filter((p) => p.role === role)) {
  (roster[p.teamName] ??= []).push({ id: p.accountId, name: p.name });
}
const files = await readdir(cacheDir);
const games = [];
for (const f of files) {
  const m = JSON.parse(await readFile(join(cacheDir, f), "utf8"));
  if (m.leagueid !== league.leagueId) continue;
  const inPlayoffs = league.stages?.boundary ? m.start_time >= league.stages.boundary : false;
  if ((stage === "playoffs") !== inPlayoffs) continue;
  for (const [team, members] of Object.entries(roster)) {
    const ids = members.map((x) => x.id);
    const mine = m.players.filter((p) => ids.includes(p.account_id));
    if (mine.length !== members.length) continue;
    games.push({
      team,
      series: m.series_id || -m.match_id,
      names: mine.map((p) => members.find((x) => x.id === p.account_id)?.name ?? "?"),
      raw: mine.map((p) => rawValue(stat, p, m))
    });
  }
}

function rawValue(key, p, match) {
  switch (key) {
    case "creeps": return p.last_hits ?? 0;
    case "gpm": return p.gold_per_min ?? 0;
    case "kills": return p.kills ?? 0;
    case "deaths": return p.deaths ?? 0;
    case "towers": return p.towers_killed ?? 0;
    case "roshan": return p.killed?.npc_dota_roshan ?? 0;
    case "courier": return p.courier_kills ?? 0;
    case "firstBlood": return p.firstblood_claimed ?? 0;
    case "teamfight": return p.teamfight_participation ?? 0;
    case "stuns": return p.stuns ?? 0;
    case "wards": return p.obs_placed ?? 0;
    case "stacks": return p.camps_stacked ?? 0;
    case "runes": return p.rune_pickups ?? 0;
    case "smokes": return p.purchase?.smoke_of_deceit ?? 0;
    case "tormentor": return (match.objectives ?? []).filter(
      (o) => o.type === "CHAT_MESSAGE_MINIBOSS_KILL" && o.player_slot === p.player_slot).length;
    default: return 0;
  }
}

const mult = 1 + TIER_BONUSES[tier] / 100;
const bySeries = {};
for (const g of games) (bySeries[`${g.team}|${g.series}`] ??= []).push(g);

const entries = {};
for (const [key, list] of Object.entries(bySeries)) {
  const team = key.split("|")[0];
  const perGame = list.map((g) => {
    const combinedAvg = g.raw.reduce((a, b) => a + b, 0) / g.raw.length;
    const combinedSum = g.raw.reduce((a, b) => a + b, 0);
    return {
      raw: g.raw,
      names: g.names,
      ptsAvg: statToPoints(stat, combinedAvg) * mult,
      ptsSum: statToPoints(stat, combinedSum) * mult
    };
  });
  (entries[team] ??= { team, names: list[0].names, series: [] }).series.push(perGame);
}

// --- the four conventions, on the best series of the best entry ---
const scored = Object.values(entries).map((e) => {
  const per = (pick, combine) => {
    const vals = e.series.map((games) => {
      const sorted = [...games].sort((a, b) => b[pick] - a[pick]).slice(0, 2);
      const total = sorted.reduce((s, g) => s + g[pick], 0);
      return combine === "avg" ? total / sorted.length : total;
    });
    return { mean: vals.reduce((a, b) => a + b, 0) / vals.length, best: Math.max(...vals) };
  };
  return {
    ...e,
    pairAvgSeriesAvg: per("ptsAvg", "avg"),
    pairSumSeriesAvg: per("ptsSum", "avg"),
    pairAvgSeriesSum: per("ptsAvg", "sum"),
    pairSumSeriesSum: per("ptsSum", "sum")
  };
}).sort((a, b) => b.pairAvgSeriesAvg.best - a.pairAvgSeriesAvg.best);

const top = scored[0];
console.log(`Worked through: ${top.names.join(" & ")} (${top.team})`);
console.log("-".repeat(20 + top.names.join(" & ").length + top.team.length));
const bestSeries = [...top.series].sort((a, b) => {
  const s = (g) => [...g].sort((x, y) => y.ptsAvg - x.ptsAvg).slice(0, 2).reduce((t, x) => t + x.ptsAvg, 0);
  return s(b) - s(a);
})[0];
console.log(`  their best series had ${bestSeries.length} game(s):`);
const ranked = [...bestSeries].sort((a, b) => b.ptsAvg - a.ptsAvg);
for (const [i, g] of ranked.entries()) {
  const label = i < 2 ? "counted" : "dropped";
  console.log(`    game ${i + 1}: ${g.names.map((n, j) => `${n} ${g.raw[j]}`).join(", ")}` +
    `${top.names.length > 1 ? `  → pair ${(g.raw.reduce((a, b) => a + b, 0) / g.raw.length).toFixed(1)} avg / ${g.raw.reduce((a, b) => a + b, 0)} sum` : ""}   (${label})`);
}
console.log();
console.log("  Four ways to combine, for that one series:\n");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const rows = [
  ["pair AVERAGE, series AVERAGE  (current)", "pairAvgSeriesAvg"],
  ["pair SUM,     series AVERAGE", "pairSumSeriesAvg"],
  ["pair AVERAGE, series SUM", "pairAvgSeriesSum"],
  ["pair SUM,     series SUM", "pairSumSeriesSum"]
];
console.log(`  ${"convention".padEnd(42)}${"this series".padStart(13)}${"their average".padStart(15)}`);
for (const [label, key] of rows) {
  console.log(`  ${label.padEnd(42)}${fmt(top[key].best).padStart(13)}${fmt(top[key].mean).padStart(15)}`);
}

console.log(`\n  Field-wide highest under each convention:\n`);
for (const [label, key] of rows) {
  const best = Math.max(...scored.map((e) => e[key].best));
  const who = scored.find((e) => e[key].best === best);
  console.log(`  ${label.padEnd(42)}${fmt(best).padStart(13)}   ${who.names.join(" & ")}`);
}
console.log();
