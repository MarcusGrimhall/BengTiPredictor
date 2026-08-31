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

// Stats TI fantasy uses but OpenDota does not expose at all. Searched every
// one of the 146 player fields, the whole match object and every objective
// type: the only "lotus" keys are the item Lotus Orb, and "watcher" does not
// appear anywhere. We do not pretend to have them.
export const UNAVAILABLE_STATS = ["lotuses", "watchers"];

function tormentorKillsBySlot(match) {
  const counts = new Map();
  for (const obj of match.objectives ?? []) {
    if (obj.type !== "CHAT_MESSAGE_MINIBOSS_KILL") continue;
    const slot = obj.player_slot;
    if (slot === undefined || slot === null) continue;
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  return counts;
}

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

  const tormentors = tormentorKillsBySlot(match);
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
        creeps: p.last_hits ?? 0,
        gpm: p.gold_per_min ?? 0,
        towers: p.towers_killed ?? 0,
        roshan: p.killed?.npc_dota_roshan ?? 0,
        tormentor: tormentors.get(p.player_slot) ?? 0,
        courier: p.courier_kills ?? 0,
        firstBlood: p.firstblood_claimed ?? 0,
        teamfight: p.teamfight_participation ?? 0,
        stuns: p.stuns ?? 0,
        wards: p.obs_placed ?? 0,
        stacks: p.camps_stacked ?? 0,
        runes: p.rune_pickups ?? 0,
        // Smokes USED, not bought. purchase.smoke_of_deceit counts what the
        // player paid for, which is a different number in 29 of 56 player-games
        // with data - a smoke bought and never used counted, one bought by a
        // team mate and used by this player did not. STRATZ's itemUsed for item
        // 188 matches item_uses 10/10 on a checked match, purchase 8/10.
        smokes: p.item_uses?.smoke_of_deceit ?? 0,
        // Derived, not labelled: OpenDota has no madstone field, but it counts
        // madstone_bundle events, which correlate r=0.87 with neutral_kills
        // over 1,793 player-games at about one per three camps - the shape of
        // madstone pickups, not of a player activating an item twelve times.
        // Present in ~90% of parsed matches. See ASSUMPTIONS.md.
        madstones: p.item_uses?.madstone_bundle ?? 0
      }
    };
  });
}
