import type { Role } from "./scoring";

/** A column per candidate, indexed by the SAME coherent tournament futures.
 * The producer must supply correlated columns; this module never invents them.
 */
export type ScenarioCandidate = { id: string; role: Role; players: number[]; scores: Float64Array };
export type FantasyObjective = "mean" | "lowerTail" | "upperTail";

export function objectiveValue(scores: ArrayLike<number>, objective: FantasyObjective, tailMass = 0.2): number {
  if (!scores.length || !(tailMass > 0 && tailMass <= 1)) throw new Error("Invalid scenario distribution");
  if (!["mean","lowerTail","upperTail"].includes(objective)) throw new Error("Unknown fantasy objective");
  const ordered = Array.from(scores);
  if (ordered.some((x) => !Number.isFinite(x))) throw new Error("Nonfinite fantasy score");
  if (objective === "mean") return ordered.reduce((s,x) => s+x,0)/ordered.length;
  ordered.sort((a,b) => objective === "lowerTail" ? a-b : b-a);
  // Fractional boundary weight defines exact empirical CVaR/upper-tail mean.
  let remaining = ordered.length*tailMass, total = 0;
  for (const value of ordered) { const weight = Math.min(1,remaining); total += weight*value; remaining -= weight; if (remaining <= 1e-12) break; }
  return total/(ordered.length*tailMass);
}

export function compareFutures(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || a.length < 2) throw new Error("Paired futures required");
  const differences = Array.from(a, (x,i) => x-b[i]);
  const mean = objectiveValue(differences,"mean");
  const se = Math.sqrt(differences.reduce((s,d) => s+(d-mean)**2,0)/(a.length-1)/a.length);
  return { edge:mean, monteCarloStandardError:se, approximate95Interval:[mean-1.96*se,mean+1.96*se],
    probabilityBetter:differences.filter((x) => x>0).length/a.length,
    probabilityTied:differences.filter((x) => x===0).length/a.length };
}

export function optimizeJointEntry(candidates: ScenarioCandidate[], objective: FantasyObjective, tailMass = 0.2) {
  const groups = (["core","mid","support"] as Role[]).map((r) => candidates.filter((c) => c.role===r));
  const n = candidates[0]?.scores.length ?? 0;
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length
    || candidates.some((c) => c.players.length !== (c.role === "mid" ? 1 : 2)
      || c.players.some((p) => !Number.isSafeInteger(p) || p <= 0))) throw new Error("Invalid fantasy entry identity");
  if (!n || groups.some((g) => !g.length) || candidates.some((c) => c.scores.length!==n)) throw new Error("Complete common-future field required");
  let best: { ids:string[]; value:number; scores:Float64Array } | null = null;
  let entries = 0;
  // All legal combinations, no top-k pruning. Even the mean path checks player
  // exclusivity; separability only holds when that constraint is redundant.
  for (const core of groups[0]) for (const mid of groups[1]) for (const support of groups[2]) {
    const ids = [...core.players,...mid.players,...support.players];
    if (new Set(ids).size !== ids.length) continue;
    const scores = Float64Array.from(core.scores,(x,i) => x+mid.scores[i]+support.scores[i]);
    const value = objectiveValue(scores,objective,tailMass); entries++;
    if (!best || value>best.value) best = {ids:[core.id,mid.id,support.id],value,scores};
  }
  if (!best) throw new Error("No legal complete entry");
  return {...best,entries};
}
