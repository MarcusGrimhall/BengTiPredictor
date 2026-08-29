// Elo model for match and series outcomes.
//
// OpenDota maintains an Elo rating per team at /api/teams, updated after
// every professional match. We use it directly instead of asking the user to
// invent strength numbers, and instead of scraping betting sites (every odds
// API we checked - The Odds API, PandaScore, Abios - requires a paid key).
//
// Elo ratings are per MAP, because that is how OpenDota updates them.
// A best-of-3 or best-of-5 has to be derived from the per-map probability.

export const DEFAULT_ELO = 1300;

/** Standard Elo expectation: the chance A wins a single map against B. */
export function mapWinProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Chance A wins a best-of-N given the per-map probability.
 * A wins by reaching ceil(N/2) map wins first.
 */
export function seriesWinProbability(mapProb: number, bestOf: number): number {
  const need = Math.ceil(bestOf / 2);
  const q = 1 - mapProb;
  let total = 0;
  // Sum over the number of maps the loser takes before A closes it out.
  for (let lost = 0; lost < need; lost += 1) {
    total += binomial(need - 1 + lost, lost) * mapProb ** need * q ** lost;
  }
  return total;
}

/** Expected number of maps played in a best-of-N with per-map probability p. */
export function expectedMaps(mapProb: number, bestOf: number): number {
  const need = Math.ceil(bestOf / 2);
  const q = 1 - mapProb;
  let expected = 0;
  for (let lost = 0; lost < need; lost += 1) {
    const length = need + lost;
    // Either side can be the one closing it out at this length.
    const pA = binomial(length - 1, lost) * mapProb ** need * q ** lost;
    const pB = binomial(length - 1, lost) * q ** need * mapProb ** lost;
    expected += length * (pA + pB);
  }
  return expected;
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * How much a rating gap is worth, expressed as map win chance. Useful for
 * showing the user what the numbers mean without explaining Elo.
 */
export function describeGap(ratingA: number, ratingB: number): string {
  const pct = Math.round(mapWinProbability(ratingA, ratingB) * 100);
  return `${pct}% per map`;
}
