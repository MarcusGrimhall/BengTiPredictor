#!/usr/bin/env node
// Diagnostic, event-forward distribution forecasts on RECOVERED exact rows.
// Does not publish a model: selected-source coverage must pass independently.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, readJson, optionalJson, exactMatch, atomicJson, digest } from "./exact-data.mjs";
import { RAW_STATS } from "./extract.mjs";

export function weightedCRPS(values, weights, actual) {
  const total = weights.reduce((a,b)=>a+b,0);
  const sorted = values.map((v,i)=>({v,w:weights[i]/total})).sort((a,b)=>a.v-b.v);
  let absolute=0,halfPair=0,cumulative=0,weighted=0;
  for(const {v,w} of sorted) { absolute+=w*Math.abs(v-actual);halfPair+=w*(v*cumulative-weighted);cumulative+=w;weighted+=w*v; }
  return absolute-halfPair;
}

export function historyWeights(rows, cutoff, candidate, teamId) {
  return rows.map((r)=> {
    if (!(r.endTime<cutoff)) return 0;
    const age=(cutoff-r.startTime)/86400;
    if(candidate.days && age>candidate.days)return 0;
    return (candidate.halfLife ? 2**(-age/candidate.halfLife):1)
      * (candidate.sameTeam && r.teamId!==teamId ? .5:1);
  });
}

async function main() {
  const rules=await readJson(join(ROOT,"lib/current-rules.json"));
  const start=performance.now(), groups=new Map();
  for(const file of await readdir(join(ROOT,"data/cache/replay-fantasy/matches"))) {
    if(!/^\d+\.json$/.test(file))continue;
    const raw=await readJson(join(ROOT,"data/cache/matches",file));
    const replay=await readJson(join(ROOT,"data/cache/replay-fantasy/matches",file));
    const m=exactMatch(raw,replay);if(!m.exact)continue;
    const g=groups.get(m.leagueId)??[];g.push(m);groups.set(m.leagueId,g);
  }
  const events=[], excludedEvents=[];
  for (const [id,matches] of groups) {
    const manifest=await optionalJson(join(ROOT,"data/cache/leagues",`${id}.json`));
    const league=await readJson(join(ROOT,"data/generated",`league-${id}.json`));
    if (league.researchTarget) {
      excludedEvents.push({leagueId:id,exactMatches:matches.length,expectedMatches:manifest?.matches.length??null,reason:"held-out research target; excluded from model selection"});
      continue;
    }
    if (!manifest || matches.length/manifest.matches.length < .9) {
      excludedEvents.push({leagueId:id,exactMatches:matches.length,expectedMatches:manifest?.matches.length??null,reason:"missing manifest or less than 90% complete exact coverage"});continue;
    }
    events.push({id,matches,cutoff:league.firstMatch,end:Math.max(...matches.map(m=>m.endTime))});
  }
  events.sort((a,b)=>a.cutoff-b.cutoff);
  const candidates=[...[30,60,90,120,180,270,365].map(days=>({name:`window-${days}`,days})),
    {name:"window-180-decay-60",days:180,halfLife:60},
    {name:"decay-60",halfLife:60},{name:"decay-120",halfLife:120},{name:"decay-60-team",halfLife:60,sameTeam:true}];
  const report={scope:"Diagnostic raw-stat forecasts on recovered exact events; not a selected/validated production model or an entry decision backtest",
    primaryDataGate:"Not certified by this diagnostic: prepare-ti/train gate the selected source population independently",
    selection:"For each event, choose by mean CRPS on at least three completed earlier event evaluations; otherwise abstain. This selects only the raw-stat diagnostic, not a production entry model.",
    sourceFingerprint: digest(events.flatMap(e=>e.matches.map(m=>[m.matchId,m.sourceHash]))),
    excludedEvents, candidates,events:[]};
  const points=(stat,v)=>{
    const value=(rules.points[stat].base??0)+rules.points[stat].per*v;
    if(stat==="deaths")return rules.deathsFloor===null?value:Math.max(rules.deathsFloor,value);
    return stat==="stuns"?value:Math.max(0,value);
  };
  for(const event of events) {
    const selectionHistory=report.events.filter(e=>e.end<event.cutoff && e.results?.length);
    const selectionScores=selectionHistory.length<3?[]:candidates.map(c=>({candidate:c.name,
      crps:selectionHistory.reduce((sum,e)=>sum+e.results.find(r=>r.candidate===c.name).meanStatCRPS,0)/selectionHistory.length})).sort((a,b)=>a.crps-b.crps);
    const selectedBeforeEvaluation=selectionScores[0]?.candidate??null;
    const prior=events.filter(e=>e.end<event.cutoff).flatMap(e=>e.matches);
    const history=new Map();
    for(const m of prior)for(const p of m.players) {
      const h=history.get(p.accountId)??[];h.push({...p,startTime:m.startTime,endTime:m.endTime});history.set(p.accountId,h);
    }
    const eligible=event.matches.flatMap(m=>m.players).filter(p=>(history.get(p.accountId)?.length??0)>=10);
    if(!eligible.length){report.events.push({leagueId:event.id,cutoff:event.cutoff,evaluatedPlayerGames:0,reason:"no adequate exact prior history"});continue;}
    // Common evaluation rows for all candidates; otherwise a short window can
    // appear better just by dropping its most difficult players.
    const common=eligible.filter(p=>candidates.every(c=>historyWeights(history.get(p.accountId),event.cutoff,c,p.teamId).filter(w=>w>0).length>=10));
    if (!common.length) { report.events.push({leagueId:event.id,evaluatedPlayerGames:0,reason:"no common evaluation cohort across candidates"});continue; }
    const results=[];
    for(const candidate of candidates) {
      const perStat=Object.fromEntries(RAW_STATS.map(s=>[s,{mae:0,crps:0}]));
      for(const p of common) {
        const h=history.get(p.accountId),w=historyWeights(h,event.cutoff,candidate,p.teamId),total=w.reduce((a,b)=>a+b,0);
        for(const stat of RAW_STATS) {
          const values=h.map(r=>points(stat,r.stats[stat])),actual=points(stat,p.stats[stat]);
          const mean=values.reduce((sum,v,i)=>sum+v*w[i],0)/total;
          perStat[stat].mae+=Math.abs(mean-actual);
          perStat[stat].crps+=weightedCRPS(values,w,actual);
        }
      }
      for(const x of Object.values(perStat)){x.mae/=common.length;x.crps/=common.length;}
      results.push({candidate:candidate.name,meanStatMAE:Object.values(perStat).reduce((s,x)=>s+x.mae,0)/RAW_STATS.length,
        meanStatCRPS:Object.values(perStat).reduce((s,x)=>s+x.crps,0)/RAW_STATS.length,perStat});
    }
    const entry={leagueId:event.id,cutoff:event.cutoff,end:event.end,priorMatches:prior.length,exactTargetMatches:event.matches.length,
      selectedBeforeEvaluation,selectionEvents:selectionHistory.map(e=>e.leagueId),selectionScores,
      evaluatedPlayerGames:common.length,excludedNoCommonHistory:event.matches.length*10-common.length,results};
    report.events.push(entry);
    console.log(`Event ${event.id}: ${common.length} common held-out player-games from ${prior.length} earlier exact maps`);
    for(const r of results)console.log(`  ${r.candidate.padEnd(16)} MAE ${r.meanStatMAE.toFixed(3)}  CRPS ${r.meanStatCRPS.toFixed(3)}`);
  }
  report.seconds=(performance.now()-start)/1000;
  await atomicJson(join(ROOT,"docs/reports/model-comparison.json"),report);
  console.log(`${report.selection} ${report.seconds.toFixed(2)}s; docs/reports/model-comparison.json`);
}
if(process.argv[1]?.endsWith("compare-models.mjs"))await main();
