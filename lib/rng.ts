// Deterministic random generator (LCG).
//
// The point: identical input must always give identical simulation output.
// Otherwise the numbers flicker every time React re-renders, and two people
// with the same bracket would see different expected points.

export function seededRandom(seedText: string): () => number {
  let seed = Array.from(seedText).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    2166136261
  );
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
