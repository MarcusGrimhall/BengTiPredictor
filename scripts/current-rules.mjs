import { readFileSync } from "node:fs";

export function validateRules(rules) {
  const tiers=["I","II","III","IV","V"],colors=["red","blue","green"];
  const errors=[];
  if(rules.schemaVersion!==1)errors.push("unsupported rules schema");
  const stats=Object.keys(rules.points??{});
  if(!stats.length)errors.push("no required stats");
  for(const stat of stats) {
    const p=rules.points[stat];
    if(!Number.isFinite(p.per)||p.per===0||(p.base!=null&&!Number.isFinite(p.base)))errors.push(`invalid coefficient ${stat}`);
    if(!colors.includes(rules.statColors?.[stat]))errors.push(`unknown stat colour ${stat}`);
  }
  for(const field of ["tierBonuses","qualityRerollWeights","initialQualityWeights"])for(const tier of tiers) {
    if(!Number.isFinite(rules[field]?.[tier]) || rules[field][tier] < 0
      || (field!=="tierBonuses" && rules[field][tier]===0))errors.push(`invalid ${field}.${tier}`);
  }
  for(const role of ["core","mid","support"]) {
    const slots=rules.bannerSlots?.[role];
    if(!Array.isArray(slots)||slots.length!==5||slots.some(c=>!colors.includes(c)))errors.push(`unsupported ${role} slot configuration`);
    else for(const color of colors)if(slots.filter(c=>c===color).length>stats.filter(s=>rules.statColors[s]===color).length)errors.push(`not enough distinct ${color} stats for ${role}`);
  }
  for(const stage of ["groupStage","playoffs"]) {
    const r=rules.stages?.[stage];
    if(!Number.isSafeInteger(r?.slots)||r.slots<1||r.slots>5||!Number.isSafeInteger(r.tokens)||r.tokens<0||r.tokens>60)errors.push(`unsupported stage ${stage}`);
  }
  for(const trait of ["fractal","benevolent","vampiric","vampiricAdjacent","unique","friendly"])if(!Number.isFinite(rules.traits?.[trait]))errors.push(`invalid trait ${trait}`);
  if(!Number.isSafeInteger(rules.traits?.friendlyMinimum)||rules.traits.friendlyMinimum<1||rules.traits.friendlyMinimum>5)errors.push("invalid Friendly condition");
  if(rules.offersPerDeal!==3||rules.operationCost!==1||typeof rules.excludePreviousDeal!=="boolean")errors.push("unsupported offer mechanics");
  if(!Number.isFinite(rules.deathsFloor))errors.push("invalid Deaths floor");
  if(errors.length)throw new Error(`Invalid current rules: ${errors.join("; ")}`);
  return rules;
}
export const CURRENT_RULES=validateRules(JSON.parse(readFileSync(new URL("../lib/current-rules.json",import.meta.url),"utf8")));
