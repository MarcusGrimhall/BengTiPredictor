// Splitting a tournament into its two fantasy periods.
//
// TI runs two separate fantasy cards: one for the group stage, one for the
// playoffs. They score independently - a player's group stage points do not
// carry into the playoff card - so the two have to be aggregated separately or
// every projection is wrong.
//
// The split is in the data, not in a hardcoded date. Group stage and playoffs
// are separated by a multi-day break while the venue changes over, and nothing
// inside either stage comes close to that gap:
//
//   TI 2026  biggest gap 88.2h, next biggest 13.2h
//   TI 2025  biggest gap 83.8h, next biggest 13.5h
//
// So the split is the largest gap that both clears the overnight breaks by a
// wide margin AND leaves a plausible amount of play on either side.
//
// Both conditions matter, and the second is not a formality. TI 2022 ran its
// main event across two weekends, which put its *longest* break (135.6h) between
// the main event and the finals - a 95/5 split that is not a stage boundary at
// all. The real boundary was the second-longest gap, 38.9h, at 79%. Taking the
// longest qualifying gap rather than the longest gap finds it.

export const STAGES = ["groupStage", "playoffs"];

/** A gap has to beat this to count as the stage break, not just a night off. */
export const STAGE_GAP_HOURS = 36;

/** Neither side of the split may be smaller than this share of the event. */
const MIN_SHARE = 0.1;

/**
 * Splits matches into stages by the longest break in the schedule.
 *
 * Returns a stage index per match id (0 = group stage, 1 = playoffs) plus the
 * evidence for the decision, so the fetch log can show why it split where it
 * did. If no gap qualifies - a single-stage event, or one still in progress -
 * everything is reported as the group stage and `split` is false.
 */
export function splitStages(matches) {
  const ordered = [...matches]
    .filter((m) => m?.match_id && m?.start_time)
    .sort((a, b) => a.start_time - b.start_time);

  const stageOf = new Map(ordered.map((m) => [m.match_id, 0]));
  const none = { stageOf, split: false, gapHours: 0, runnerUpHours: 0, boundary: null };
  if (ordered.length < 10) return none;

  const gaps = ordered
    .slice(1)
    .map((m, i) => ({ index: i + 1, hours: (m.start_time - ordered[i].start_time) / 3600 }))
    .sort((a, b) => b.hours - a.hours);

  const qualifies = (g) => {
    const share = g.index / ordered.length;
    return g.hours >= STAGE_GAP_HOURS && share >= MIN_SHARE && share <= 1 - MIN_SHARE;
  };

  const boundary = gaps.find(qualifies);
  if (!boundary) {
    return { ...none, gapHours: gaps[0]?.hours ?? 0, runnerUpHours: gaps[1]?.hours ?? 0 };
  }

  // The longest gap that is NOT the boundary, for the log - it is what the
  // decision was made against.
  const nextBest = gaps.find((g) => g !== boundary)?.hours ?? 0;

  for (const m of ordered.slice(boundary.index)) stageOf.set(m.match_id, 1);
  return {
    stageOf,
    split: true,
    gapHours: boundary.hours,
    runnerUpHours: nextBest,
    boundary: ordered[boundary.index].start_time
  };
}
