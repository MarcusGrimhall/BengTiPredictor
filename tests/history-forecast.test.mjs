import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const { forecastRawStats }=require("../.validate/historyForecast.js");
const { STAT_KEYS }=require("../.validate/scoring.js");
const full=stats=>Object.assign(Object.fromEntries(STAT_KEYS.map(s=>[s,0])),stats);
const roster=[{accountId:1,role:"core",teamId:10},{accountId:2,role:"core",teamId:10},
  {accountId:3,role:"mid",teamId:20},{accountId:4,role:"support",teamId:30},
  {accountId:5,role:"support",teamId:30}];
const cutoff=1000*86400;
const rows=[{accountId:1,teamId:99,endTime:cutoff-10*86400,stats:full({kills:10})},
  {accountId:2,teamId:10,endTime:cutoff-40*86400,stats:full({kills:2})},
  {accountId:3,teamId:20,endTime:cutoff-10*86400,stats:full({kills:3})},
  {accountId:4,teamId:30,endTime:cutoff-10*86400,stats:full({kills:4})}];
test("pre-lock history follows account across team changes and shrinks sparse players",()=>{
  const out=forecastRawStats(roster,rows,cutoff,{days:180,halfLife:60,priorMaps:1});
  assert.equal(out[0].maps,1);
  assert.equal(out[0].expected.kills,6);
  assert.equal(out[4].maps,0);
  assert.equal(out[4].expected.kills,4);
  assert.equal(out[4].fallbackShare,1);
});
test("history windows and lock prohibit future leakage",()=>{
  const out=forecastRawStats(roster,rows,cutoff,{days:30});
  assert.equal(out[1].maps,0);
  assert.equal(out[1].expected.kills,10);
  assert.throws(()=>forecastRawStats(roster,[...rows,{...rows[0],endTime:cutoff}],cutoff,{}),/at or after roster lock/);
});
test("role-only baseline gives the same pre-lock field level to both cores",()=>{
  const out=forecastRawStats(roster,rows,cutoff,{roleOnly:true});
  assert.equal(out[0].expected.kills,6);
  assert.equal(out[1].expected.kills,6);
});
