import type { LeagueData } from "../lib/data";

/**
 * OpenDota rates teams as of now, not as of the event. For the tournament being
 * played that is the right number; for an older one a season of later results
 * has overwritten it. The fetch grades the ratings against the maps that were
 * actually played, and this says so when they failed.
 */
export default function RatingWarning({ check }: { check: LeagueData["ratingCheck"] }) {
  if (!check || check.usable) return null;
  return (
    <p className="notice notice-warn">
      <strong>Ratings are stale for this event.</strong> OpenDota&rsquo;s Elo is
      career-to-date as of the last fetch, not as of the tournament. Graded against
      the {check.maps} maps actually played here it called{" "}
      {(check.accuracy * 100).toFixed(1)}% correctly — a coin flip does 50%, and its
      log loss of {check.logLoss.toFixed(3)} is worse than the 0.693 you get by
      guessing. Anything derived from these ratings is unreliable for this
      tournament; map counts fall back to what was actually played.
    </p>
  );
}
