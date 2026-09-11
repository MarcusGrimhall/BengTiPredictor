/** Finite, observable-state decision process. Chance is integrated BEFORE max.
 * Slot order, current offers and any previous-deal exclusions belong in key().
 * Terminal utility may itself be a joint tournament-distribution objective.
 */
export type Transition<S> = { state: S; probability: number };
export type DecisionModel<S, A> = {
  key: (state: S) => string;
  terminal: (state: S) => number;
  actions: (state: S) => A[];
  transitions: (state: S, action: A) => Transition<S>[];
};

export function finiteHorizon<S, A>(model: DecisionModel<S, A>, maxStates = 1_000_000) {
  const memo = new Map<string, { value: number; action: A | null }>();
  function visit(state: S, tokens: number): { value: number; action: A | null } {
    if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error("Invalid token budget");
    const key = `${tokens}|${model.key(state)}`;
    const hit = memo.get(key); if (hit) return hit;
    if (memo.size >= maxStates) throw new Error("Exact reachable-state budget exceeded; no optimality claim available");
    // Stop leaves the current offers unchanged. All other actions (including
    // refresh) spend ONE token. Fresh stage budget is supplied by the caller.
    let best: { value: number; action: A | null } = { value: model.terminal(state), action: null };
    if (!Number.isFinite(best.value)) throw new Error("Nonfinite terminal utility");
    // Reserve before descending so the cap covers recursive reachable states.
    memo.set(key, best);
    if (tokens > 0) for (const action of model.actions(state)) {
      const outcomes = model.transitions(state, action);
      const mass = outcomes.reduce((sum,o) => sum+o.probability,0);
      if (!outcomes.length || outcomes.some((o) => !Number.isFinite(o.probability) || o.probability < 0)
        || Math.abs(mass-1) > 1e-9) throw new Error("Invalid transition probability mass");
      const value = outcomes.reduce((sum,o) => sum+o.probability*visit(o.state,tokens-1).value,0);
      if (value > best.value) best = { value, action };
    }
    memo.set(key,best); return best;
  }
  const solve = (state: S, tokens: number) => {
    try { return visit(state,tokens); }
    catch (error) { memo.clear(); throw error; } // No partially solved cache hits after a failed search.
  };
  return { solve, states: () => memo.size, clear: () => memo.clear() };
}
