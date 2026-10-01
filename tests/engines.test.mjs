import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {traitBonuses,emblemMultipliers,hasDuplicateStats,buildLineups,gameScores,matchScores,periodScore}=require("../.validate/fantasy.js");
const {STAT_KEYS,statToPoints}=require("../.validate/scoring.js");
const {STAGE_SLOTS,STAGE_TOKENS}=require("../.validate/stages.js");
const {randomBanner,actionCatalogue,enumerateOutcomes,applyAction,evaluateAction,qualityOutcomes}=require("../.validate/reroll.js");
const {seededRandom}=require("../.validate/rng.js");
const {deal,greedyOffer,planOffers}=require("../.validate/offers.js");
const {finiteHorizon}=require("../.validate/finiteHorizon.js");
const {objectiveValue,optimizeJointEntry,compareFutures}=require("../.validate/jointFantasy.js");
const {expectedBestDeal,exactTwoTokenValues}=require("../.validate/endgame.js");
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const banner=(traits,tiers=traits.map(()=>"I"))=>traits.map((trait,i)=>({stat:["kills","teamfight","creeps","roshan","deaths"][i],tier:tiers[i],trait}));

test("adjacency first/middle/last; no wrap; stacking",()=>{
  assert.deepEqual(traitBonuses(banner(["benevolent","none","none"])),[0,.2,0]);
  assert.deepEqual(traitBonuses(banner(["none","benevolent","none"])),[.2,0,.2]);
  assert.deepEqual(traitBonuses(banner(["none","none","benevolent"])),[0,.2,0]);
  assert.deepEqual(traitBonuses(banner(["benevolent","none","benevolent"])),[0,.4,0]);
  assert.deepEqual(traitBonuses(banner(["vampiric","none","none"])),[.5,-.1,0]);
  close(emblemMultipliers(banner(["fractal","none","none"],["V","I","II"]))[0],3.1);
});
test("Fractal three and five slots, repeated traits allowed, duplicate stats forbidden",()=>{
  for(const tiers of [["I","II","III"],["I","II","III","IV","V"]]) {
    const b=banner(tiers.map(()=>"fractal"),tiers);assert.ok(traitBonuses(b).every((v)=>v===.6));
    b[1].tier=b[0].tier;assert.ok(traitBonuses(b).every((v)=>v===0));
  }
  const b=banner(["friendly","friendly","friendly"]);assert.equal(hasDuplicateStats(b),false);
  assert.deepEqual(traitBonuses(b),[.5,.5,.5]);b[1].stat=b[0].stat;assert.equal(hasDuplicateStats(b),true);
});
test("score players then average pair; top two games then single best series",()=>{
  assert.equal(statToPoints("deaths",11),-195);
  assert.equal(statToPoints("deaths",18),-1560);
  assert.equal(statToPoints("stuns",-5.5816774),-55.816774);
  const line=(deaths,kills)=>Object.fromEntries(STAT_KEYS.map((s)=>[s,s==="deaths"?deaths:s==="kills"?kills:0]));
  const player=(id,role,lines,series)=>({id,name:id,teamName:"A",role,games:lines.length,winRate:1,perGame:lines[0],gameLines:lines,gameMatches:lines.map((_,i)=>i+1),gameSeries:series});
  const b=[{stat:"deaths",tier:"I",trait:"none"}];
  const p=buildLineups([player("1","core",[line(2,0)],[1]),player("2","core",[line(18,0)],[1])])[0];
  close(gameScores(p,b)[0],0);
  const mid=player("3","mid",[line(0,1),line(0,3),line(0,2),line(0,4),line(0,1),line(0,9)],[1,1,1,2,2,3]);
  const kills=[{stat:"kills",tier:"I",trait:"none"}];
  assert.deepEqual(matchScores(mid,kills).map(x=>Math.round(x/117.7)),[5,5,9]);
  close(periodScore(mid,kills),9*117.7);
  assert.deepEqual(STAGE_SLOTS,{groupStage:3,playoffs:5});assert.deepEqual(STAGE_TOKENS,{groupStage:40,playoffs:30});
});
test("every legal transition conserves probability and stat uniqueness",()=>{
  const random=seededRandom("transitions");
  for(const role of ["core","mid","support"])for(const slots of [3,5])for(let k=0;k<8;k++) {
    const b=randomBanner(role,slots,random), original=JSON.stringify(b);
    for(const a of actionCatalogue(role,slots)) {
      const out=enumerateOutcomes(b,role,a);assert.ok(out,a.id);close(out.reduce((s,o)=>s+o.probability,0),1);
      for(const o of out)assert.equal(hasDuplicateStats(o.banner),false);
      if(a.target==="stat" && a.scope==="all")for(const o of out)for(let i=0;i<slots;i++)if(o.banner[i].stat!==b[i].stat)assert.notEqual(o.banner[i].stat,b[i].stat);
      const x=applyAction(b,role,a,seededRandom("same"));
      assert.ok(out.some(o=>JSON.stringify(o.banner)===JSON.stringify(x)),a.id);
    }
    assert.equal(JSON.stringify(b),original);
  }
});
test("stat reroll excludes current; skip is identity; exact weighted mean",()=>{
  const b=banner(["friendly","friendly","friendly"]), a=actionCatalogue("core",3).find(a=>a.target==="stat"&&a.color==="red");
  for(const o of enumerateOutcomes(b,"core",a)) {assert.notEqual(o.banner[0].stat,b[0].stat);assert.notEqual(o.banner[2].stat,b[2].stat);}
  assert.deepEqual(applyAction(b,"core",{target:"skip"},()=>.5),b);
  const quality=actionCatalogue("core",3).find(a=>a.id==="tier-first-red");
  const values={I:0,II:1,III:2,IV:3,V:4};
  close(evaluateAction(b,"core",quality,x=>values[x[0].tier]).mean,(4+6+6+4)/10);
  close(qualityOutcomes("IV","increase")[0].probability,1);
});
test("wildcard sampling matches exact expectation",()=>{
  const b=banner(["fractal","friendly","unique"],["II","II","V"]);
  const a=actionCatalogue("core",3).find(a=>a.target==="qualityUpTwoDownOne");
  const v=b=>b.reduce((s,e,i)=>s+(i+1)*["I","II","III","IV","V"].indexOf(e.tier),0);
  const out=enumerateOutcomes(b,"core",a),mean=out.reduce((s,o)=>s+o.probability*v(o.banner),0);
  const variance=out.reduce((s,o)=>s+o.probability*(v(o.banner)-mean)**2,0);
  const rng=seededRandom("wildcards");let sum=0;const n=30000;
  for(let i=0;i<n;i++)sum+=v(applyAction(b,"core",a,rng));
  close(sum/n,mean,5*Math.sqrt(variance/n));
});
test("offers exclude previous triple; no clairvoyance; zero and one token exact",()=>{
  const roles=["core","mid","support"],rng=seededRandom("offers");
  const catalogues=Object.fromEntries(roles.map(r=>[r,actionCatalogue(r,3)]));
  const catalogue=[...new Map(Object.values(catalogues).flat().map(a=>[a.id,a])).values()];
  const previous=deal(catalogue,3,rng),next=deal(catalogue,3,rng,previous);
  assert.equal(new Set(next.map(a=>a.id)).size,3);assert.ok(next.every(a=>!previous.some(p=>p.id===a.id)));
  const banners=Object.fromEntries(roles.map(r=>[r,randomBanner(r,3,rng)]));
  assert.equal(greedyOffer(banners,previous,catalogues,()=>10),null);
  assert.equal(planOffers(banners,previous,catalogue,catalogues,()=>10,0).decisions.length,0);
  const plan=planOffers(banners,previous,catalogue,catalogues,()=>10,1);
  close(plan.refreshValue,30);assert.ok(plan.decisions.every(d=>Math.abs(d.takeValue-30)<1e-9));assert.equal(plan.runs,0);
});
test("Bellman takes a temporary loss and never sees outcomes before choosing",()=>{
  const model={key:String,terminal:s=>[1,0,10][s],actions:s=>s<2?["invest"]:[],transitions:s=>[{state:s+1,probability:1}]};
  const dp=finiteHorizon(model);assert.equal(dp.solve(0,1).value,1);assert.equal(dp.solve(0,2).value,10);
  const uncertain=finiteHorizon({key:String,terminal:s=>s,actions:()=>["roll"],transitions:()=>[{state:0,probability:.9},{state:10,probability:.1}]});
  assert.equal(uncertain.solve(2,1).value,2); // E[max(2,X)] would incorrectly be 2.8.
  const capped=finiteHorizon(model,1);
  assert.throws(()=>capped.solve(0,2),/budget exceeded/);
  assert.throws(()=>capped.solve(0,2),/budget exceeded/);
});
test("joint risk sees diversification; pairing separates predictive spread from MC error",()=>{
  const c=(id,role,players,scores)=>({id,role,players,scores:Float64Array.from(scores)});
  const field=[c("core","core",[1,2],[0,100]),c("same","mid",[3],[0,110]),c("opposite","mid",[4],[100,0]),c("support","support",[5,6],[0,0])];
  assert.equal(optimizeJointEntry(field,"mean").ids[1],"same");
  assert.equal(optimizeJointEntry(field,"lowerTail").ids[1],"opposite");
  close(objectiveValue([0,10,20],"lowerTail",.5),10/3);
  const paired=compareFutures([0,100],[1,101]);assert.equal(paired.monteCarloStandardError,0);assert.equal(paired.edge,-1);
});

test("exact offer order statistic equals enumeration of every triple",()=>{
  const gains=[-2,0,1,2,6,6,9];let total=0,n=0;
  for(let a=0;a<gains.length;a++)for(let b=a+1;b<gains.length;b++)for(let c=b+1;c<gains.length;c++) {total+=Math.max(0,gains[a],gains[b],gains[c]);n++;}
  close(expectedBestDeal(gains),total/n);
});
test("exact two-token state respects shared pool and constant-value stop",()=>{
  const roles=["core","mid","support"],rng=seededRandom("endgame");
  const banners=Object.fromEntries(roles.map(r=>[r,randomBanner(r,3,rng)]));
  const cats=Object.fromEntries(roles.map(r=>[r,actionCatalogue(r,3)]));
  const all=[...new Map(Object.values(cats).flat().map(a=>[a.id,a])).values()];
  const out=exactTwoTokenValues(banners,all.slice(0,3),all,cats,()=>10);
  close(out.optimalValue,30);close(out.refresh,30);
});

test("two-token planner matches exhaustive deals and outcome trees",()=>{
  const roles=["core","mid","support"],rng=seededRandom("endgame-reference");
  const banners=Object.fromEntries(roles.map(r=>[r,randomBanner(r,3,rng)]));
  const allCats=Object.fromEntries(roles.map(r=>[r,actionCatalogue(r,3)]));
  const ids=["tier-all-red","tier-first-red","tier-last-red","trait-all-blue","trait-first-blue","trait-last-blue","stat-first-green","stat-last-green"];
  const catalogue=[...new Map(Object.values(allCats).flat().filter(a=>ids.includes(a.id)).map(a=>[a.id,a])).values()];
  assert.equal(catalogue.length,8);
  const cats=Object.fromEntries(roles.map(r=>[r,allCats[r].filter(a=>ids.includes(a.id))]));
  const offers=catalogue.slice(0,3),fresh=catalogue.slice(3);
  const oracle=(role,b)=>emblemMultipliers(b).reduce((s,v,i)=>s+(i+1)*v,0)+(b.filter(e=>e.trait==="friendly").length===3?9:0);
  const total=b=>roles.reduce((s,r)=>s+oracle(r,b[r]),0);
  const one=(b,deal)=>Math.max(total(b),...deal.flatMap(a=>roles.filter(r=>cats[r].some(c=>c.id===a.id)).map(r=>
    enumerateOutcomes(b[r],r,a).reduce((s,o)=>s+o.probability*total({...b,[r]:o.banner}),0))));
  const next=b=>{
    let sum=0,n=0;
    for(let i=0;i<fresh.length;i++)for(let j=i+1;j<fresh.length;j++)for(let k=j+1;k<fresh.length;k++) {sum+=one(b,[fresh[i],fresh[j],fresh[k]]);n++;}
    return sum/n;
  };
  const plan=planOffers(banners,offers,catalogue,cats,oracle,2);
  close(plan.refreshValue,next(banners));assert.equal(plan.runs,0);
  for(const d of plan.decisions) {
    const reference=enumerateOutcomes(banners[d.role],d.role,d.action).reduce((s,o)=>s+o.probability*next({...banners,[d.role]:o.banner}),0);
    close(d.takeValue,reference);assert.equal(d.downside,null);
  }
});
