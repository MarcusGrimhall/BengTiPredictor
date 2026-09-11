import test from "node:test";
import assert from "node:assert/strict";
import {weightedCRPS,historyWeights} from "../scripts/compare-models.mjs";
import {missingnessTail} from "../scripts/exact-data.mjs";
import {CURRENT_RULES,validateRules} from "../scripts/current-rules.mjs";
test("weighted CRPS agrees with direct pair expectation",()=>{
  const values=[0,2,9],weights=[1,3,2],actual=4,total=6;
  let brute=0;
  for(let i=0;i<3;i++) {
    brute+=weights[i]/total*Math.abs(values[i]-actual);
    for(let j=0;j<3;j++)brute-=.5*weights[i]*weights[j]/total**2*Math.abs(values[i]-values[j]);
  }
  assert.ok(Math.abs(weightedCRPS(values,weights,actual)-brute)<1e-12);
});
test("history uses completion before lock and real continuous weights",()=>{
  const cutoff=86400*100;
  const rows=[{startTime:cutoff-86400*60,endTime:cutoff-86400*60+1,teamId:1},
    {startTime:cutoff-1,endTime:cutoff,teamId:1},{startTime:cutoff+1,endTime:cutoff+2,teamId:1}];
  assert.deepEqual(historyWeights(rows,cutoff,{halfLife:60},1),[.5,0,0]);
  assert.deepEqual(historyWeights(rows,cutoff,{days:30},1),[0,0,0]);
});
test("missingness diagnostic distinguishes small sampling gaps from systematic absence",()=>{
  assert.ok(missingnessTail(10,2)>.2);
  assert.ok(missingnessTail(10,10)<1e-9);
  assert.ok(Math.abs(missingnessTail(20,0)-1)<1e-12);
  assert.ok(missingnessTail(10000,1001)>.4); // Avoid underflow from starting at P(X=0).
});
test("current rules fail early for unsupported mechanics and impossible slot palettes",()=>{
  validateRules(CURRENT_RULES);
  assert.throws(()=>validateRules({...CURRENT_RULES,operationCost:2}),/offer mechanics/);
  assert.throws(()=>validateRules({...CURRENT_RULES,points:{kills:{per:107}}}),/not enough distinct/);
});
