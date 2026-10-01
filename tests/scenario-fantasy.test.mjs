import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { scoreFuture, candidateFutures, recommendRoster, fixedEntryMeanRoleValue, adviseCurrentOffersMean } = require("../.validate/scenarioFantasy.js");
const { STAT_KEYS } = require("../.validate/scoring.js");
const { actionCatalogue } = require("../.validate/reroll.js");

const emblem = [{stat:"kills",tier:"I",trait:"none"}];
const roster = [
  {accountId:1,teamId:10,role:"core"},{accountId:2,teamId:10,role:"core"},
  {accountId:3,teamId:20,role:"mid"},
  {accountId:4,teamId:30,role:"support"},{accountId:5,teamId:30,role:"support"}
];
const state = {roster,banners:{core:emblem,mid:emblem,support:emblem},
  titleRules:{version:"test",prefix:{},suffix:{underdog:{bonus:10,condition:"loss",evidence:"verified"}}}};
const selection = {core:[1,2],mid:[3],support:[4,5]};
const teams={10:[1,2,6,7,8],20:[3,9,10,11,12],30:[4,5,13,14,15],40:[16,17,18,19,20]};
const full=stats=>Object.assign(Object.fromEntries(STAT_KEYS.map(s=>[s,0])),stats);
function map(seriesId, teamIds, values) {
  return {seriesId,teamIds,players:teamIds.flatMap(teamId=>teams[teamId].map(accountId=>({accountId,teamId,stats:full({kills:values[accountId]??0})})))};
}
test("scores pair average before top-two maps and lets roles win different series",()=>{
  const future={maps:[
    map(1,[10,20],{1:10,2:0,3:1}),map(1,[10,20],{1:0,2:10,3:1}),map(1,[10,20],{1:100,2:0,3:1}),
    map(2,[10,20],{1:1,2:1,3:20}),map(2,[10,20],{1:1,2:1,3:20}),
    map(3,[30,40],{4:7,5:3}),map(3,[30,40],{4:7,5:3})
  ]};
  // Core map values are 5, 5, 50; Mid's best series is series 2.
  const expected=(50+5+40+10)*107*1.1;
  assert.ok(Math.abs(scoreFuture(state,future,selection)-expected)<1e-9);
  const columns=candidateFutures(state,[future,future]);
  assert.equal(columns.length,3);
  assert.ok(Math.abs(columns.reduce((n,c)=>n+c.scores[0],0)-expected)<1e-9);
  const value=fixedEntryMeanRoleValue(state,[future,future],selection);
  assert.ok(Math.abs(["core","mid","support"].reduce((sum,role)=>sum+value(role,state.banners[role]),0)-expected)<1e-9);
});
test("unresolved titles require an explicit trigger probability",()=>{
  const future={maps:[map(1,[10,20],{1:1,2:1,3:1}),map(2,[30,40],{4:1,5:1})]};
  assert.throws(()=>scoreFuture({...state,suffix:"underdog"},future,selection),/Unresolved title/);
  assert.ok(Math.abs(scoreFuture({...state,suffix:"underdog",unknownTitleProbabilities:{"suffix:underdog":1}},future,selection)-3*107*1.1*1.1)<1e-9);
});
test("a missing selected teammate on a scheduled map fails instead of shrinking the pair",()=>{
  const future={maps:[map(1,[10,20],{1:10,3:1})]};
  future.maps[0].players.find(p=>p.accountId===2).accountId=21;
  assert.throws(()=>scoreFuture(state,future,selection),/Missing or misplaced selected player/);
});
test("tail advice requires title triggers sampled in the common futures",()=>{
  assert.throws(()=>recommendRoster({...state,unknownTitleProbabilities:{"suffix:underdog":0.5}},[{maps:[]}],"lowerTail"),/sampled title triggers/);
});
test("negative replay Stuns remain negative through best-series scoring",()=>{
  const stuns=[{stat:"stuns",tier:"I",trait:"none"}];
  const future={maps:[map(1,[10,20],{}),map(2,[30,40],{})]};
  for(const game of future.maps)for(const row of game.players)row.stats.stuns=-5;
  assert.ok(Math.abs(scoreFuture({...state,banners:{core:stuns,mid:stuns,support:stuns}},future,selection)+165)<1e-9);
});
test("a future with an incomplete stat vector is rejected",()=>{
  const future={maps:[map(1,[10,20],{}),map(2,[30,40],{})]};
  delete future.maps[0].players[0].stats.watchers;
  assert.throws(()=>scoreFuture(state,future,selection),/Invalid future watchers/);
});
test("fixed-entry scenario mean feeds the shared-token offer planner",()=>{
  const future={maps:[map(1,[10,20],{1:2,2:2,3:3}),map(2,[30,40],{4:4,5:4})]};
  const catalogues=Object.fromEntries(["core","mid","support"].map(role=>[role,actionCatalogue(role,3)]));
  const catalogue=[...new Map(Object.values(catalogues).flat().map(action=>[action.id,action])).values()];
  const plan=adviseCurrentOffersMean(state,[future],selection,catalogue.slice(0,3),catalogue,catalogues,0);
  assert.ok(Math.abs(plan.current-scoreFuture(state,future,selection))<1e-9);
  assert.equal(plan.rounds,0);
});
test("lower and upper tail can prefer different Mid players on shared futures",()=>{
  const twoMids={...state,roster:[...roster,{accountId:16,teamId:40,role:"mid"}]};
  const futures=[
    {maps:[map(1,[10,20],{3:0}),map(2,[30,40],{16:9})]},
    {maps:[map(1,[10,20],{3:20}),map(2,[30,40],{16:9})]}
  ];
  assert.equal(recommendRoster(twoMids,futures,"lowerTail").ids[1],"mid:16");
  assert.equal(recommendRoster(twoMids,futures,"upperTail").ids[1],"mid:3");
});
