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
| Player names | OpenDota's pro registry |
| Roles | OpenDota's per-match lane detection, resolved per team. Agrees with the pro registry on 160 of 160 players and 32 of 32 mids across the two Internationals where the registry is contemporaneous, and no decision anywhere is close — across 88 squads the tightest mid is 69 percentage points clear and the tightest core/support boundary 114 last hits a game. Still a heuristic, not Valve's own assignment |
| Tormentor attribution | The combat log's kill credit. Cannot be made exact - the game credits everyone involved |
| Team strength effect on scoring (1.84% per 100 Elo) | Measured here, n=2910, t=4.05 |
| Suffix trigger rates | Measured from the matches themselves |

## Assumed — not verified anywhere

| Assumption | Where | What it affects |
| --- | --- | --- |
| **Every reroll outcome is equally likely** — a quality reroll on a tier II gives I, III, IV or V at 25% each; a trait reroll gives any of the other five at 20% each | `tierOptions`, `traitOptions` in `lib/reroll.ts` | The value of every quality and trait reroll. Searched for published odds and found none — no guide carries them. |
| Hero colour/theme groups | `HERO_GROUPS`, empty | Prefix titles — reported as unknown rather than guessed |
| **Madstones are 2.7 × `item_uses.madstone_bundle`** | `MADSTONES_PER_BUNDLE` in `scripts/extract.mjs` | The Madstones emblem. OpenDota has no madstone field; it counts bundles, and a bundle is not a stone. Three independent sources put the ratio between 2.5 and 3 — see below. At TI 2026 the emblem is worth 663 points a game to a core, level with Kills and still well behind Last hits at 1,512. |
| **A role heuristic is a role** | `scripts/fetch-league.mjs` | Every ranking. Lane detection is OpenDota's reading of where a hero stood, not Valve's fantasy assignment. It has never disagreed where it can be checked and is never close, but it is inference. STRATZ exposes a real per-match `Position` (POSITION_1…POSITION_5) behind a free API token, which would remove the inference entirely. |

That is the whole list. It used to be six entries; the token costs turned out
not to exist, and the rest were replaced by rules you confirmed.

## Genuinely unavailable

Four things TI fantasy scores that **no public API exposes**. Checked in both
OpenDota and STRATZ field by field, not assumed:

| Missing | What exists instead | How far off |
| --- | --- | --- |
| **Watchers Taken** (147 pts) | `ability_uses.ability_lamp_use` — 9.35 a game for a support | Merged with lotuses; a naive read runs ~1.5× high |
| **Lotuses Gained** (176 pts) | the same counter | Merged with watchers |
| **Madstones Collected** (13 pts) | `item_uses.madstone_bundle` | Bundles, not stones — about 2.7× low, corrected in the extractor |
| **Tormentor participation** (879 pts) | `killed.npc_dota_miniboss` | The game credits everyone involved, ~3.7 players a kill. Every public field carries exactly 1.00 |

Neither a lotus nor a watcher is named anywhere. Both are taken through the same
generic interaction, and that interaction is the only trace either leaves.
STRATZ's schema was read directly — `MatchPlayerType`, `MatchPlayerStatsType`
and every `MatchPlaybackData*Event` type — and has no lotus, watcher or madstone
field either; its playback events cover only buildings, couriers, Roshan, runes,
towers and wards. `damage.npc_dota_miniboss` looked like a way to find everyone
who fought a Tormentor, but it is a kill counter under a different name: it
fires in exactly the same 203 player-games as `killed`. Getting real numbers for
any of the four means parsing replays, which is what the community calculators
that do have them are doing.

For a support, watchers plus lotuses are worth more than Observer Wards. That is
the largest known gap in this model.

### Where 2.7 madstones per bundle comes from

Three independent lines, and they converge:

1. **The mechanic.** Clearing a camp gives 2 stones to whoever cleared it and 1
   to a random ally, and they fly straight to the player. A bundle only drops —
   and only then leaves an item event — when an enemy hero is within 800 of the
   camp. Here that is about one camp in three: 1 bundle per 9–11 neutral creeps.
2. **A replay-parsing community calculator** states the API figure, "counted as
   bundles instead of stones", falls threefold. The same source names three
   other API errors — watchers 1.5× high, lotuses a fifth low, Tormentor
   credited to the last hitter — and all three check out against our own data.
3. **A second, unrelated fantasy project's per-player table.** Normalised on
   teamfight participation, where the two pipelines agree to 1.00, our madstone
   count is low by a median of **2.64×** across 30 matched entries (mean 2.69,
   quartiles 2.26–3.04). That project's own two tables show it applying the same
   correction internally: between them every other stat moves by the series
   factor of ~2.0, madstones by 5.37 and Tormentor by 3.95.

2.7 is the measured middle. It multiplies a real observation rather than
replacing it, so it still scales with how much a player farmed.

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
- **Smokes are what a player bought** — the emblem pays for a smoke that was
  popped. Scoring `purchase.smoke_of_deceit` credited a support for smokes they
  bought and handed to a team-mate; it is now `item_uses.smoke_of_deceit`. The
  two differ by a factor between 0.67 and 1.03 per player, so it reordered the
  support ranking rather than just scaling it.
- **Tormentor goes to whoever the chat message names** - `CHAT_MESSAGE_MINIBOSS_KILL`
  names a support five times more often than an independent per-role table says
  it should, and a core six times too rarely. The combat log's kill credit,
  `killed.npc_dota_miniboss`, has the right shape instead: core 0.73x, mid
  1.18x, support 0.55x. Neither can be exact, because the game credits the kill
  to everyone involved in it.
- **The pro registry is the best source of roles** - it is a snapshot of who
  plays what *today*. Applied to an old event it is an anachronism: it files
  Team Liquid's TI 2022 mid as a core, because core is what he plays in 2026.
  Roles now come from the lane detection in each event's own replays, which
  reproduces the registry exactly where the registry is contemporaneous.
- **The pro registry's role is authoritative player by player** — it is right
  about core vs support, but only a few dozen players worldwide carry
  `fantasy_role: 4`, so most mids are filed as core. Read one player at a time
  that left teams with three cores and no mid, and `buildLineups` then dropped
  their Mid entry entirely and mixed a mid's farm into the Core pair: TI 2022
  shipped 13 mids for 20 teams, TI 2023 fourteen for 20. Roles are now resolved
  per team — one mid each, and a five-player squad is filled out to the only
  line-up a fantasy roster can have. All five Internationals now offer a
  complete set of entries for every team.
