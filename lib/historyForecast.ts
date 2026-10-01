import { STAT_KEYS, type Role, type StatKey } from "./scoring";

export type HistoricalPlayer = { accountId: number; teamId: number; endTime: number; stats: Record<StatKey, number> };
export type ForecastRoster = { accountId: number; role: Role; teamId: number }[];
export type HistoryPolicy = { days?: number; halfLife?: number; priorMaps?: number; roleOnly?: boolean };
export type RawForecast = { accountId: number; role: Role; expected: Record<StatKey, number>;
  maps: number; effectiveMaps: number; newestAgeDays: number | null; fallbackShare: number };

/** Pre-lock raw-stat baselines and a role-pool shrinkage candidate.
 * This is a level forecast only; coherent map/series futures are separate.
 */
export function forecastRawStats(roster: ForecastRoster, rows: HistoricalPlayer[], cutoff: number, policy: HistoryPolicy): RawForecast[] {
  if (!(cutoff > 0) || policy.days !== undefined && !(policy.days > 0)
    || policy.halfLife !== undefined && !(policy.halfLife > 0)
    || policy.priorMaps !== undefined && !(Number.isFinite(policy.priorMaps) && policy.priorMaps >= 0)) throw new Error("Invalid history policy");
  if (rows.some(r => !(r.endTime < cutoff))) throw new Error("Historical row at or after roster lock");
  const seen = new Set<number>();
  for (const p of roster) {
    if (seen.has(p.accountId)) throw new Error("Duplicate roster account");
    seen.add(p.accountId);
  }
  const sample = new Map<number, { row: HistoricalPlayer; weight: number; age: number }[]>();
  for (const row of rows) {
    if (!seen.has(row.accountId)) continue;
    if (STAT_KEYS.some(stat => !Number.isFinite(row.stats[stat]))) throw new Error(`Incomplete historical vector ${row.accountId}`);
    const age = (cutoff - row.endTime) / 86400;
    if (policy.days !== undefined && age > policy.days) continue;
    const weight = policy.halfLife ? 2 ** (-age / policy.halfLife) : 1;
    const list = sample.get(row.accountId) ?? [];
    list.push({row,weight,age}); sample.set(row.accountId,list);
  }
  const individual = new Map<number, { mean: Record<StatKey,number>; maps: number; effective: number; newest: number }>();
  for (const p of roster) {
    const history = sample.get(p.accountId) ?? [];
    if (!history.length) continue;
    const mass = history.reduce((n,h)=>n+h.weight,0);
    const square = history.reduce((n,h)=>n+h.weight*h.weight,0);
    const mean = Object.fromEntries(STAT_KEYS.map(stat => [stat,
      history.reduce((n,h)=>n+h.weight*h.row.stats[stat],0)/mass])) as Record<StatKey,number>;
    individual.set(p.accountId,{mean,maps:history.length,effective:mass*mass/square,newest:Math.min(...history.map(h=>h.age))});
  }
  const rolePool = new Map<Role, Record<StatKey,number>>();
  for (const role of ["core","mid","support"] as Role[]) {
    const members = roster.filter(p=>p.role===role).map(p=>individual.get(p.accountId)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (!members.length) throw new Error(`No pre-lock role pool for ${role}`);
    rolePool.set(role,Object.fromEntries(STAT_KEYS.map(stat => [stat,
      members.reduce((n,m)=>n+m.mean[stat],0)/members.length])) as Record<StatKey,number>);
  }
  return roster.map(p => {
    const own=individual.get(p.accountId);
    const otherRoleMembers = roster.filter(q => q.role === p.role && q.accountId !== p.accountId)
      .map(q => individual.get(q.accountId)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    const prior = !policy.roleOnly && otherRoleMembers.length ? Object.fromEntries(STAT_KEYS.map(stat => [stat,
      otherRoleMembers.reduce((n,m)=>n+m.mean[stat],0)/otherRoleMembers.length])) as Record<StatKey,number>
      : rolePool.get(p.role)!;
    const priorMaps=policy.priorMaps ?? 0;
    const ownShare=policy.roleOnly ? 0 : own ? own.effective/(own.effective+priorMaps) : 0;
    const expected=Object.fromEntries(STAT_KEYS.map(stat=>[stat,
      (own ? ownShare*own.mean[stat] : 0)+(1-ownShare)*prior[stat]])) as Record<StatKey,number>;
    return {accountId:p.accountId,role:p.role,expected,maps:own?.maps??0,
      effectiveMaps:own?.effective??0,newestAgeDays:own?.newest??null,fallbackShare:1-ownShare};
  });
}
