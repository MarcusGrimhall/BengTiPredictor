# What is known, and what is assumed

Every rule the calculator applies, and where it came from. Anything marked
**assumed** is a guess of mine and should be treated as provisional — if it is
wrong, the numbers that depend on it are wrong.

## Verified against a source

| Rule | Source |
| --- | --- |
| Point value of all 16 extractable stats | In-game rules, cross-checked against a community-compiled table and against my own data (31 of 36 values within a few percent) |
| Tier bonuses +10 / +30 / +60 / +100 / +150% | In-game rules |
| Trait effects (Fractal +60%, Benevolent +20% adjacent, Vampiric +50%/−10%, Unique +30%, Friendly +50%) | In-game rules |
| Slot colours per role | In-game rules |
| One stat per banner, never repeated | You |
| Core and Support are same-team pairs, Mid is one player | In-game rules |
| A pair is the **average** of its two players | You |
| A series is the **sum** of its two best games | You, and the in-game rules |
| A period pays only the **best single series** | In-game rules |
| The same three options serve every banner; you choose which to apply one to | In-game rules |
| A deal is **always exactly three options**, plus the standing option to use none — never more, never fewer | You. Enforced by `OPTIONS_DEALT` in `lib/offers.ts`, which the simulator's UI now also obeys |
| Using an option **replaces all three** | In-game rules |
| Titles are free to change and cost no rerolls | In-game rules |
| Group stage 3 emblems / 40 tokens, playoffs 5 / 30 | You |
| Tokens are one shared pool across all three banners | You |
| Three random options per deal, ~40 deals | You |
| The same option cannot be offered twice in a row | You |
| Skip is always available and free | You |
| A quality change lands on a **random** available tier, not ±1 | You |
| A reroll never returns the value it replaced | You |
| A tier V cannot be raised, a tier I cannot be lowered | You |
| The wildcard does what is possible, decided before anything moves | You, from four worked examples |
| **Every option costs one reroll** — there is no price list | In-game rules, corroborated by community guides |
| Reroll scopes: stat / quality / trait × all / first / last / random of a colour | Community guides |
| Compendium prediction payout scale | Community guides |
| Stage boundary, group stage format, series counts | Derived from the match data itself |
| Player names and roles | OpenDota's pro registry `fantasy_role`, authoritative where present — 621 of 651 entries (95.4%) across ten re-fetched leagues, and 80 of 80 at TI 2026. The last-hits heuristic is only the fallback |
| Team strength effect on scoring (1.84% per 100 Elo) | Measured here, n=2910, t=4.05 |
| Suffix trigger rates | Measured from the matches themselves |
| **No stat pays negative points** — the scale floors at zero, so ten-plus deaths pay 0 rather than a penalty | You |
| Smokes are **smokes used**, `item_uses.smoke_of_deceit` | Verified against STRATZ `itemUsed` item 188, 10/10 players on a checked match |
| Kills, deaths, last hits, GPM, courier kills, observer wards, camps stacked | Verified field by field against STRATZ on the same match, 10/10 players each |
| Roshan is the player credited with the kill | Sum of `killed.npc_dota_roshan` equals the count of `CHAT_MESSAGE_ROSHAN_KILL` events exactly, over 12 matches |
| First Blood | Sum of `firstblood_claimed` equals the count of `CHAT_MESSAGE_FIRSTBLOOD` events exactly |
| Tormentor is the player who last-hit it | Every `CHAT_MESSAGE_MINIBOSS_KILL` event carries a `player_slot`. STRATZ has no tormentor data at all |
| Runes count **power, bounty and bottled runes, but not Wisdom** | You, and `rune_pickups` matches that rule exactly — see below |
| A tower goes to whoever landed the **last hit** | You |
| Teamfight participation is a **0–1 share**, scored per unit and not per percentage point | You |
| One `madstone_bundle` is **one madstone** | You |
| Teamfight participation is **(kills + assists) / the opposing team's total deaths** — the standard share, not OpenDota's teamfight-graph clustering | Reconstructed from the data: reproduces the field exactly in 102 of 120 player-games, and in 13 more with a numerator one assist lower. 95.8% accounted for. Note the denominator is **deaths, not kills** — a hero killed by creeps or a tower raises it without being anyone's kill, which happened in 6 of 24 teams |
| `p.stuns` **sums per target hit** — a three-hero, two-second stun counts as six seconds | OpenDota reads `modifier_stunned` from the combat log per affected hero. Means the emblem systematically favours AoE stuns |

## Assumed — not verified anywhere

| Assumption | Where | What it affects |
| --- | --- | --- |
| **Every reroll outcome is equally likely** — a quality reroll on a tier II gives I, III, IV or V at 25% each; a trait reroll gives any of the other five at 20% each | `tierOptions`, `traitOptions` in `lib/reroll.ts` | The value of every quality and trait reroll. Searched for published odds and found none — no guide carries them. |
| Hero colour/theme groups | `HERO_GROUPS`, empty | Prefix titles — reported as unknown rather than guessed |

That is the whole list, and it is down to two. Runes, Towers, Teamfight and
Madstones were on it briefly: they were never new guesses, they were old guesses
that had never been written down, and you settled all four.

## What `rune_pickups` actually counts

Worth recording, because it took two sources to establish and it is easy to get
backwards. OpenDota's `rune_pickups` is **every rune the player took, including
ones that went through a bottle, minus Wisdom runes.**

Both halves are measured, not assumed. `rune_pickups` equals the player's own
rune map minus type 8 on 120 of 120 player-games. And STRATZ, which reports a
`PICKUP` and a `BOTTLE` action, turns out to emit `BOTTLE` as an *annotation on
a rune that is also counted as a `PICKUP`* — all 18 bottle events in a checked
match are followed by a pickup of the same rune type within 90 seconds, none
unmatched. So bottled runes are already in the number. STRATZ's pickup count
equals OpenDota's rune map on 10 of 10 players.

That is the rule you gave, so the field needs no adjustment. Had it excluded
bottled runes we would have been understating the emblem by about a fifth.

## Genuinely unavailable

**Lotuses Grabbed** and **Watchers Taken** are real emblem stats and are not in
the calculator, because no public source has them. Every one of OpenDota's 146
player fields was searched, along with the whole match object and every
objective type: the only `lotus` keys are the item Lotus Orb and its recipe,
and `watcher` does not appear anywhere at all. STRATZ's GraphQL schema has no
field for either — this is now checked rather than assumed: all 513 types were
introspected and searched, and `lotus`, `watcher` and `madstone` return zero
hits apiece. Getting them would mean parsing replays.

## Retracted

Things I asserted that turned out to be invented or wrong, and have been fixed:

- **"The card locks"** — I invented a deadline to justify a bounded number of
  reroll rounds. Nothing establishes one. The round count now comes from your
  own figure of 40.
- **A quality change moves one tier** — it lands on a random available tier.
- **A series is the average of its two best games** — it is the sum.
- **A pair is the sum of its two players** — it is the average.
- **"Highest" on the Information tab** — was the highest *average*, presented as
  though it were the biggest single series.
- **Group stage shape 5.5 Bo3 series per team** — true of two Internationals,
  hardcoded as though universal. TI 2022 ran 9.3 Bo2 series per team.
- **Stage split at the longest schedule gap** — TI 2022's longest gap is inside
  the playoffs, so the event came out unsplit.
- **A price list for rerolls** — I invented per-action token costs (1 for a
  random emblem, 4 for all of a colour, and so on). There is no price list.
  Every option costs one of your forty rerolls.
- **A quality reroll could return the tier it replaced** — it cannot.
- **Top teams ranked by pre-event win rate** — a win rate ignores who you
  played. Now an Elo built from the pre-event matches.
- **A period banks every series** — it banks only the best one. This inflated
  every score on the site by three to five times, and was the largest error in
  the project.
- **Reroll options are tied to a banner** — the same three serve all three
  banners, and you choose which to apply one to.
- **Declining waits for a better deal** — the options only change when one is
  used, so declining means stopping.
- **Smokes were smokes bought** — `purchase.smoke_of_deceit`, while the label
  said "Smokes used". The two differ in 29 of 56 player-games that have the
  data: a smoke bought and never used counted, one bought by a team mate and
  used by this player did not.
- **Deaths could pay a negative score** — 1950 − 195 a death crosses zero at ten
  deaths, and 5.9% of player-games are above that. No stat pays a penalty.
- **An emblem's average was scored from the average stat line** — scoring
  happens per game, so the average has to be taken over scored games. Identical
  for fifteen stats, which are linear; wrong for Deaths, which is floored. It
  understated Deaths by 3% across the board and by up to 4x for one player.
