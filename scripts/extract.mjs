// Extracts fantasy-relevant raw stats from an OpenDota match dump.
//
// Important: we store RAW VALUES (kills, obs_placed, ...), not finished
// fantasy points. If Valve changes the scale, only the constants in
// lib/scoring.ts change - no re-fetch needed.

// Which raw stats we can pull out of OpenDota, and from where.
export const RAW_STATS = [
  "kills", "deaths", "creeps", "gpm", "towers", "roshan", "tormentor",
  "courier", "firstBlood", "teamfight", "stuns", "wards", "stacks",
  "runes", "smokes", "madstones"
];

// Stats TI fantasy scores that we do not extract. Neither is named in the API:
// there is no "lotus" key but the item Lotus Orb, and no "watcher" key at all.
//
// They are not, however, invisible. Both a lotus pickup and a watcher capture
// go through the same generic interaction ability, and OpenDota does count it
// as `ability_uses.ability_lamp_use` - 9.35 a game for a support at TI 2026,
// which at 176 and 147 points apiece is a bigger blue emblem than wards. What
// the counter cannot do is say which of the two a given press was, so it is
// left out rather than split on a guess. See ASSUMPTIONS.md.
export const UNAVAILABLE_STATS = ["lotuses", "watchers"];

/**
 * Madstones per `madstone_bundle` event.
 *
 * A calibration, not a rule, and the one number in the extractor that is not
 * read straight off the match. Three independent lines of evidence put it
 * between 2.5 and 3:
 *
 *   1. The mechanic. A camp yields 2 stones to the clearer and 1 to a random
 *      ally, auto-collected unless an enemy hero is within 800 - only then is
 *      there a bundle, and only then an item event. Bundles land on about one
 *      camp in three here (1 per 9-11 neutral creeps).
 *   2. A community calculator that parses replays rather than reading the API
 *      states the API figure "counted as bundles instead of stones" falls
 *      threefold.
 *   3. A second, unrelated fantasy project's per-player table. Normalised on
 *      teamfight participation, where the two pipelines agree to 1.00, our
 *      madstone count is low by a median of 2.64x over 30 matched entries
 *      (mean 2.69, quartiles 2.26-3.04). That project's own older table shows
 *      the same correction applied internally: every other stat moves by the
 *      series factor of ~2.0 between their two tables, madstones by 5.37.
 *
 * 2.7 is the measured middle. It is a multiplier on a real observation rather
 * than a guess at an absolute, so it scales with how much a player actually
 * farmed. If the true figure is 3.0 the emblem is understated by 11%, which at
 * 664 points a game for a core is 73 points - it does not change a banner.
 */
export const MADSTONES_PER_BUNDLE = 2.7;


// OpenDota gives no reliable position. Heuristic per team:
//   1. Mid  = the player with lane_role 2 (most last hits if several).
//   2. Core = the two highest last hits of the remaining four.
//   3. Support = the last two.
// This matches how TI fantasy groups banners (Core pair, Mid, Support pair).
function assignRoles(teamPlayers) {
  const byLastHits = (a, b) => (b.last_hits ?? 0) - (a.last_hits ?? 0);
  const roles = new Map();

  const midCandidates = teamPlayers.filter((p) => p.lane_role === 2).sort(byLastHits);
  const mid = midCandidates[0] ?? [...teamPlayers].sort(byLastHits)[0];
  if (mid) roles.set(mid.player_slot, "mid");

  const rest = teamPlayers.filter((p) => p.player_slot !== mid?.player_slot).sort(byLastHits);
  rest.slice(0, 2).forEach((p) => roles.set(p.player_slot, "core"));
  rest.slice(2).forEach((p) => roles.set(p.player_slot, "support"));

  return roles;
}

// Suffix trigger conditions, as a bitmask per game. Keep in sync with
// SUFFIX_BITS in lib/titles.ts.
//
// Five of the eight Suffixes are decidable from a match; the other three
// (death to a Tormentor, a pre-horn first blood, a fountain kill) are not
// exposed by public match data and are reported as unknown rather than zero.
export const SUFFIX_LUCKY = 1;     // duration ends in the digit 8
export const SUFFIX_DECISIVE = 2;  // game ends before 25:00
export const SUFFIX_PATIENT = 4;   // no first blood before 10:00
export const SUFFIX_UNDERDOG = 8;  // this player's team lost
export const SUFFIX_CLUTCH = 16;   // the last possible game of the series

/**
 * `gameNumber` and `seriesGames` describe where this map sits in its series;
 * pass them when the whole event is known. Without them the Clutch bit is left
 * off rather than guessed.
 */
export function suffixFlags(match, won, { gameNumber, lastPossible } = {}) {
  let flags = 0;
  const duration = match.duration ?? 0;
  if (duration % 10 === 8) flags |= SUFFIX_LUCKY;
  if (duration > 0 && duration < 25 * 60) flags |= SUFFIX_DECISIVE;

  const firstBlood = (match.objectives ?? []).find((o) => o.type === "CHAT_MESSAGE_FIRSTBLOOD");
  if (!firstBlood || firstBlood.time >= 10 * 60) flags |= SUFFIX_PATIENT;

  if (!won) flags |= SUFFIX_UNDERDOG;
  if (gameNumber != null && lastPossible != null && gameNumber === lastPossible) flags |= SUFFIX_CLUTCH;

  return flags;
}

// Returns null if the match has no parsed data (half the stats would be empty).
export function extractMatch(match) {
  const players = match.players ?? [];
  if (players.length < 10) return null;

  // teamfight_participation only exists in parsed matches. If it is null
  // everywhere, OpenDota has not parsed the replay yet.
  const parsed = players.some((p) => p.teamfight_participation !== null && p.teamfight_participation !== undefined);
  if (!parsed) return null;

  const radiant = players.filter((p) => p.player_slot < 128);
  const dire = players.filter((p) => p.player_slot >= 128);
  const roles = new Map([...assignRoles(radiant), ...assignRoles(dire)]);

  const teamOf = (p) =>
    p.player_slot < 128
      ? { id: match.radiant_team?.team_id ?? null, name: match.radiant_team?.name ?? "Radiant" }
      : { id: match.dire_team?.team_id ?? null, name: match.dire_team?.name ?? "Dire" };

  return players.map((p) => {
    const team = teamOf(p);
    return {
      accountId: p.account_id ?? null,
      name: p.personaname ?? `slot ${p.player_slot}`,
      teamId: team.id,
      teamName: team.name,
      role: roles.get(p.player_slot) ?? "support",
      won: p.player_slot < 128 ? match.radiant_win : !match.radiant_win,
      // Match identity. Needed to add up a same-team pair game by game, and to
      // group a series so it can be scored as its two best games.
      matchId: match.match_id,
      // A series id of 0 means a standalone game; give it its own bucket.
      seriesId: match.series_id || -match.match_id,
      heroId: p.hero_id ?? 0,
      stats: {
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        // Creep Score is last hits OR DENIES, per the in-game stat glossary:
        // "+3 per last hit or deny". This project counted last hits alone until
        // the glossary was read directly. Denies are small - 2.3% of a core's
        // last hits, 2.6% of a support's - but they are in the rule.
        creeps: (p.last_hits ?? 0) + (p.denies ?? 0),
        gpm: p.gold_per_min ?? 0,
        towers: p.towers_killed ?? 0,
        roshan: p.killed?.npc_dota_roshan ?? 0,
        // From the combat log's kill credit, not from the chat message.
        //
        // CHAT_MESSAGE_MINIBOSS_KILL names one player per Tormentor, and it is
        // the wrong one: it lands on supports five times more often than an
        // independent per-role table says it should, while cores come out six
        // times too low. `killed.npc_dota_miniboss` inverts that and lands
        // core 0.73x, mid 1.18x, support 0.55x of the same table - the right
        // shape, and two of three roles inside the validator's band.
        //
        // Neither is exactly right, and cannot be: the game credits the kill
        // to everyone involved in it, which no single-player field reproduces.
        // The chat message additionally drops ~4% of kills with no player_slot
        // at all. This is the closest public data gets.
        tormentor: p.killed?.npc_dota_miniboss ?? 0,
        courier: p.courier_kills ?? 0,
        firstBlood: p.firstblood_claimed ?? 0,
        teamfight: p.teamfight_participation ?? 0,
        stuns: p.stuns ?? 0,
        wards: p.obs_placed ?? 0,
        stacks: p.camps_stacked ?? 0,
        runes: p.rune_pickups ?? 0,
        // Smokes USED, not bought. The emblem pays for a smoke that was
        // popped, and a support who buys one for a team-mate never pops it.
        // The two differ in 29 of 56 player-games that have the data, and
        // across TI 2026's supports by a factor between 0.67 and 1.03 per
        // player - so it reorders the ranking rather than just scaling it.
        // STRATZ settles which is right: its itemUsed for item 188 matches
        // item_uses on 10 of 10 players and purchase on 8.
        smokes: p.item_uses?.smoke_of_deceit ?? 0,
        // Estimated, and the estimate is a correction - see ASSUMPTIONS.md.
        //
        // OpenDota has no madstone field. It counts `madstone_bundle`, and a
        // bundle is not a madstone: clearing a camp gives 2 stones to whoever
        // cleared it and 1 to a random ally, and those fly straight to the
        // player. A bundle only drops - and only then leaves an item event -
        // when an enemy hero is within 800 of the camp. So the raw count is
        // the contested subset, not the total. The bundle count itself is
        // sound: it correlates r=0.87 with neutral_kills over 1,793
        // player-games, and is present in ~90% of parsed matches.
        madstones: MADSTONES_PER_BUNDLE * (p.item_uses?.madstone_bundle ?? 0)
      }
    };
  });
}
