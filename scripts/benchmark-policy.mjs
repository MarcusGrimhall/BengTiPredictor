#!/usr/bin/env node
import {createRequire} from "node:module";
import {join} from "node:path";
import {atomicJson,ROOT} from "./exact-data.mjs";
const require=createRequire(import.meta.url);
const {finiteHorizon}=require("../.validate/finiteHorizon.js");
const {exactTwoTokenValues}=require("../.validate/endgame.js");
const {randomBanner,actionCatalogue}=require("../.validate/reroll.js");
const {emblemMultipliers}=require("../.validate/fantasy.js");
const {seededRandom}=require("../.validate/rng.js");
// Reduced crafting game: two ORDERED slots, three qualities, one current offer
// (left/right/both), weighted quality rerolls excluding current. New offers
// exclude the current offer; apply or refresh costs one shared token.
const terminal=s=>s.q[0]+2*s.q[1]+(s.q[0]===3&&s.q[1]===3?12:0);
const model={key:s=>`${s.q}:${s.offer}`,terminal,actions:()=>["apply","refresh"],
  transitions:(s,a)=>{
    let outcomes=[{state:s,probability:1}];
    const slots=a==="refresh"?[]:s.offer===2?[0,1]:[s.offer];
    for(const slot of slots)outcomes=outcomes.flatMap(o=>{
      const values=[1,2,3].filter(v=>v!==o.state.q[slot]);const mass=values.reduce((n,v)=>n+4-v,0);
      return values.map(v=>({state:{...o.state,q:o.state.q.map((old,i)=>i===slot?v:old)},probability:o.probability*(4-v)/mass}));
    });
    return outcomes.flatMap(o=>[0,1,2].filter(v=>v!==s.offer).map(offer=>({state:{...o.state,offer},probability:o.probability/2})));
  }};
function evaluatePolicy(policy,state,tokens,memo=new Map()) {
  if(!tokens)return terminal(state);const key=`${tokens}:${model.key(state)}`;if(memo.has(key))return memo.get(key);
  const action=policy(state);const v=action===null?terminal(state):model.transitions(state,action).reduce((s,o)=>s+o.probability*evaluatePolicy(policy,o.state,tokens-1,memo),0);memo.set(key,v);return v;
}
const greedy=s=>model.transitions(s,"apply").reduce((n,o)=>n+o.probability*terminal(o.state),0)>terminal(s)?"apply":"refresh";
const started=performance.now(),dp=finiteHorizon(model),rows=[];
for(const tokens of [1,2,3,4,5,10,30,40]) {
  const regrets=[],scores=[];
  for(let left=1;left<=3;left++)for(let right=1;right<=3;right++)for(let offer=0;offer<3;offer++) {
    const state={q:[left,right],offer};const optimal=dp.solve(state,tokens).value;
    const heuristic=evaluatePolicy(greedy,state,tokens);
    regrets.push(optimal-heuristic);scores.push(optimal);
  }
  const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
  rows.push({tokens,optimalMean:mean(scores),greedyMeanRegret:mean(regrets),greedyMaxRegret:Math.max(...regrets)});
}
const report={scope:"Exact reduced game, not measured regret for the full TI game",state:"two ordered 3-quality slots plus one current offer; weighted rerolls and paid refresh",method:"memoized finite-horizon Bellman recursion; exact policy evaluation over all 27 starting states",rows,reachableStates:dp.states(),seconds:(performance.now()-started)/1000};
const roles=["core","mid","support"],rng=seededRandom("timing");
const banners=Object.fromEntries(roles.map(r=>[r,randomBanner(r,5,rng)]));
const catalogues=Object.fromEntries(roles.map(r=>[r,actionCatalogue(r,5)]));
const catalogue=[...new Map(Object.values(catalogues).flat().map(a=>[a.id,a])).values()];
const offers=["tier-all-red","trait-all-blue","qualityUpTwoDownOne-any"].map(id=>catalogue.find(a=>a.id===id));
const endgameStart=performance.now();
const endgame=exactTwoTokenValues(banners,offers,catalogue,catalogues,(_r,b)=>emblemMultipliers(b).reduce((s,x)=>s+1000*x,0));
report.fullMechanicsTwoToken={scope:"synthetic cheap additive terminal oracle; not end-to-end website latency",
  seconds:(performance.now()-endgameStart)/1000,cachedExpectations:endgame.cachedExpectations,
  actions:endgame.actions.length,optimalValue:endgame.optimalValue};
await atomicJson(join(ROOT,"docs/reports/policy-benchmark.json"),report);console.table(rows);console.log(`${report.reachableStates} states; ${report.seconds.toFixed(3)}s`);
