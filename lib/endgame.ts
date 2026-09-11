// Exact last-two-token values without enumerating every future offer triple.
// Under the adopted uniform deal assumption, the maximum of a 3-subset has
// P(maximum rank = i) = C(i,2)/C(n,3), for zero-based sorted rank i.
import rules from "./current-rules.json";
import type { Emblem } from "./fantasy";
import type { Role } from "./scoring";
import { enumerateOutcomes, type RerollAction } from "./reroll";

const ROLES: Role[] = ["core","mid","support"];
type Banners = Record<Role,Emblem[]>;
type Oracle = (role:Role,banner:Emblem[])=>number;
export type EndgameAction = { role:Role; action:RerollAction; value:number; immediate:number; improveChance:number };

export function expectedBestDeal(gains: number[], count=3): number {
  if (!Number.isSafeInteger(count)||count<1||gains.length<count) throw new Error("Invalid deal size");
  if (gains.some((x)=>!Number.isFinite(x))) throw new Error("Nonfinite action value");
  const choose=(n:number,k:number)=>{
    if(n<k)return 0;let x=1;for(let j=1;j<=k;j++)x*= (n-j+1)/j;return x;
  };
  const sorted=[...gains].map(x=>Math.max(0,x)).sort((a,b)=>a-b),denom=choose(sorted.length,count);
  return sorted.reduce((sum,x,i)=>sum+x*choose(i,count-1)/denom,0);
}

export function exactTwoTokenValues(
  banners:Banners,offers:RerollAction[],catalogue:RerollAction[],
  catalogues:Record<Role,RerollAction[]>,valueOf:Oracle
) {
  if(offers.length!==3||new Set(offers.map(a=>a.id)).size!==3)throw new Error("Three unique offers required");
  if(new Set(catalogue.map(a=>a.id)).size!==catalogue.length || offers.some(a=>!catalogue.some(c=>c.id===a.id))) throw new Error("Invalid offer catalogue");
  const excluded=new Set(rules.excludePreviousDeal?offers.map(a=>a.id):[]);
  const future=catalogue.filter(a=>!excluded.has(a.id));
  const expectations=new Map<string,number>();
  const expected=(role:Role,b:Emblem[],action:RerollAction)=>{
    const key=`${role}:${action.id}:${JSON.stringify(b)}`;
    const old=expectations.get(key);if(old!==undefined)return old;
    const outcomes=enumerateOutcomes(b,role,action);
    if(!outcomes)throw new Error("Exact transition limit exceeded");
    const value=outcomes.reduce((sum,o)=>sum+o.probability*valueOf(role,o.banner),0);
    expectations.set(key,value);return value;
  };
  const fresh=(hand:Banners)=>{
    const now=Object.fromEntries(ROLES.map(r=>[r,valueOf(r,hand[r])])) as Record<Role,number>;
    const total=ROLES.reduce((s,r)=>s+now[r],0);
    const gains=future.map(a=>Math.max(0,...ROLES.filter(r=>catalogues[r].some(c=>c.id===a.id))
      .map(r=>expected(r,hand[r],a)-now[r])));
    return total+expectedBestDeal(gains,rules.offersPerDeal);
  };
  const current=ROLES.reduce((s,r)=>s+valueOf(r,banners[r]),0);
  const refresh=fresh(banners),actions:EndgameAction[]=[];
  for(const action of offers)for(const role of ROLES) {
    if(!catalogues[role].some(a=>a.id===action.id))continue;
    const outcomes=enumerateOutcomes(banners[role],role,action);
    if(!outcomes)throw new Error("Exact transition limit exceeded");
    let value=0,immediate=0,improveChance=0;
    const rest=current-valueOf(role,banners[role]);
    for(const o of outcomes) {
      const after=rest+valueOf(role,o.banner);
      immediate+=o.probability*after;
      improveChance+=o.probability*Number(after>current);
      value+=o.probability*fresh({...banners,[role]:o.banner});
    }
    actions.push({role,action,value,immediate,improveChance});
  }
  actions.sort((a,b)=>b.value-a.value);
  return { current,refresh,actions,optimalValue:Math.max(current,refresh,...actions.map(a=>a.value)),
    cachedExpectations:expectations.size };
}
