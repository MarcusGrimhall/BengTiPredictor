# What is known, and what is assumed

Every rule the calculator applies, and where it came from. Anything marked
**assumed** is a guess of mine and should be treated as provisional — if it is
wrong, the numbers that depend on it are wrong.

## Verified against a source

| Rule | Source |
| --- | --- |
| **Creep Score is last hits AND denies** — +3 per last hit or deny | In-game stat glossary, read directly. This project counted last hits alone until then; denies are 2.3% of a core's total and 2.6% of a support's |
| Point value of all 16 extractable stats | In-game rules, cross-checked against a community-compiled table and against my own data (35 of 38 values within a few percent) |
| Tier bonuses +10 / +30 / +60 / +100 / +150% | In-game rules |
| Trait effects (Fractal +60%, Benevolent +20% adjacent, Vampiric +50%/−10%, Unique +30%, Friendly +50%) | In-game rules. Fractal's condition is **all emblem qualities on the banner different** — not "all five", so it also fires on a 3-emblem Group Stage banner. "Adjacent" is the immediate neighbouring slots only, with **no wrap** from first to last, demonstrated by a captured 3-slot banner where slot 1 does not affect slot 3 |
| **Quality and traits ADD inside the emblem multiplier** — tier V with an active Fractal is 100+150+60 = ×3.10, not 2.50×1.60 | In-game tutorials and captured banner. Playoff results then verify that Coaching Titles form a separate layer: four Royal +10% stat contributions for Noticed/Satanic reproduce the client to the cent only as `base × (1 + quality + trait) × (1 + active titles)` |
| Slot colours per role | In-game rules |
| One stat per banner, never repeated | In-game Emblem Stats glossary |
| Core and Support are same-team pairs, Mid is one player | In-game rules |
| A pair is the **average** of its two players, and it is the **scores** that are averaged, not the stat lines | In-game Fantasy glossary: *"We then average the score of all players for a role and use that to decide the final score for a game."* Corroborated by Valve's TI 2026 announcement on the roster shape. The other public calculator sums, and is wrong |
| A series is the **sum** of its two best games | In-game Fantasy glossary — the same paragraph as the averaging rule: the top two scoring games within a series decide the role's match score |
| A period pays only the **best single series** | In-game Fantasy glossary — same paragraph: where a role plays several series in a period, the best-scoring series is used |
| The same three options serve every banner; you choose which to apply one to | In-game rules |
| A deal is **always exactly three options**, plus the standing option to use none — never more, never fewer | You. Enforced by `OPTIONS_DEALT` in `lib/offers.ts`, which the simulator's UI now also obeys |
| Using an option **replaces all three** | In-game rules |
| Titles are free to change and cost no rerolls | In-game Coaching Titles glossary |
| Group stage 3 emblems / 40 tokens, playoffs 5 / 30 | In-game roster screen, which awards "+40 Group Stage Crafting Rolls" and "+30 The International Fantasy Crafting Rolls" |
| Tokens are one shared pool across all three banners | In-game: a single ROLL TOKENS counter sits beneath the roster while one banner is selected |
| Unused Group Stage tokens expire before playoffs | You, confirmed 2026-09-03; the separate 40- and 30-token grants do not carry over |
| Three options at a time, unique within the set | In-game rolling glossary |
| Refreshing the options **costs one Roll Token** | In-game crafting tutorial: to replace the options without applying one, you spend a token. There is no free decline that reshuffles — not using an option simply spends nothing and changes nothing. `playOut` in `lib/offers.ts` still models stopping rather than paying to refresh, so it understates a reroll plan |
| A quality change lands on a **random** available tier, not ±1 | You |
| A reroll never returns the value it replaced | You |
| Quality outcomes use Tier I–V weights **5:4:3:2:1**: reroll excludes the current tier, increase permits only higher tiers and decrease only lower tiers, with the weights renormalised inside each legal set | Measured from 195 client rolls (163 informative) containing all three operation types. Free fit 32.8/28.5/22.1/11.7/5.0%; the integer rule fits at LR p=0.75 and uniform odds are rejected at p<1e-8. Fitting the three operation types separately does not improve the fit significantly (p=0.20). Valve confirms only the decreasing shape, not the numbers |
| Every emblem always has one of the five traits and starts with a random trait; there is no `none` state | You, confirmed 2026-09-03 |
| Fresh emblems begin with uniformly random qualities (1:1:1:1:1), separately from measured reroll odds | User instruction 2026-09-03; deliberately assumed rather than inferred from reroll data |
| A tier V cannot be raised, a tier I cannot be lowered | You |
| The wildcard chooses only directionally eligible emblems, decided before anything moves: with II/II/V both IIs rise and V must fall; with I/V/V the I rises and one random V falls | You, from worked examples |
| The operation catalogue has 20 entries: Red is granular on Quality, Blue on Trait, Green on Stat; the other two properties are all-only, plus two quality wildcards | Complete community-captured list; corroborated by Valve's operation-bucket schema |
| **Every option costs one reroll** — there is no price list | In-game rules, corroborated by community guides |
| Compendium prediction payout scale | Community guides |
| Stage boundary, group stage format, series counts | Derived from the match data itself |
| A neutral top-four playoff path is **4.25 series** | Derived from the four finishing paths in the standard eight-team double-elimination bracket: 4, 5, 4 and 4 series. The user chooses which team reaches that point; ranking applies the same volume to all teams |
| Player names | OpenDota's pro registry |
| Roles | OpenDota's per-match lane detection, resolved per team. Agrees with the pro registry on 160 of 160 players and 32 of 32 mids across the two Internationals where the registry is contemporaneous, and no decision anywhere is close — across 88 squads the tightest mid is 69 percentage points clear and the tightest core/support boundary 114 last hits a game. Still a heuristic, not Valve's own assignment |
| Team strength effect on scoring (1.84% per 100 Elo) | Measured here, n=2910, t=4.05 |
| Suffix trigger rates | Measured from the matches themselves |
| Smokes are **smokes used**, `item_uses.smoke_of_deceit` | Verified against STRATZ `itemUsed` item 188, 10/10 players on a checked match |
| Kills, deaths, last hits, GPM, courier kills, observer wards, camps stacked | Verified field by field against STRATZ on the same match, 10/10 players each |
| Roshan is the player credited with the kill | Sum of `killed.npc_dota_roshan` equals the count of `CHAT_MESSAGE_ROSHAN_KILL` events exactly, over 12 matches |
| First Blood | Sum of `firstblood_claimed` equals the count of `CHAT_MESSAGE_FIRSTBLOOD` events exactly |
| Tormentor is the player the combat log credits with the kill | `killed.npc_dota_miniboss`. Cannot be made exact — the game credits everyone involved in the kill. The chat message was worse and has been dropped, see Retracted. STRATZ has no tormentor data at all |
| Runes count **bottled runes as well as taken ones** | In-game glossary: *"bottled or taken"*. It says nothing either way about Wisdom runes; that `rune_pickups` excludes them is a measured property of the data, not a stated rule — see below |
| A tower goes to whoever landed the **last hit** | You |
| Teamfight participation is a **0–1 share**, scored per unit and not per percentage point | You |
| Teamfight participation is the game's `CDOTA_PlayerResource … m_flTeamFightParticipation` end-of-game counter | Valve replay schema plus an open Clarity extractor. Against 1,470 TI 2026 player-games, OpenDota's field is identical within 1e-5 in 1,450 (98.6%) and its total differs by only 0.007%; the remaining 20 rows show why reconstructing it from K/A/deaths is not exact |
| `p.stuns` **sums per target hit** — a three-hero, two-second stun counts as six seconds | OpenDota reads `modifier_stunned` from the combat log per affected hero. Means the emblem systematically favours AoE stuns |

## Assumed — not verified anywhere

| Assumption | Where | What it affects |
| --- | --- | --- |
| **Every trait outcome is equally likely** | `traitOptions` in `lib/reroll.ts` | The value of every trait reroll. Trait weights are unpublished. Every emblem always having one of five traits is user-confirmed, so a trait reroll has four alternatives rather than the five the current `none` state models. Quality is no longer part of this assumption: it uses the measured 5:4:3:2:1 weights. |
| **Prefix and Suffix add inside one separate Coaching Title layer** | `FantasyCalculator.tsx` | Playoff data proves the layer is applied after the emblem multiplier and per player/game. No captured game has both parts active simultaneously, so `1 + prefix + suffix` rather than multiplying the two title factors remains an explicit user-approved assumption. |
| **Deaths floor at zero rather than becoming negative after ten deaths** | `statToPoints` in `lib/scoring.ts` | This was the agreed working assumption, but external evidence now points the other way: the client only states `1950 - 195 per death`, while battlepass.ru's replay-based verifier explicitly says the game allows a negative result. Keep the current behaviour only provisionally until an actual 11+ death client result settles it. |
| Hero colour/theme groups | `HERO_GROUPS`, empty | Prefix titles — reported as unknown rather than guessed |
| **Older matches approximate Madstones as 3.17 × `item_uses.madstone_bundle`** | `MADSTONES_PER_BUNDLE` in `scripts/extract.mjs` | Replay-covered matches use the exact `m_iNeutralTokensFound` counter. The fallback factor is calibrated from exact/bundle totals: 3.177× at TI and EWC 2026 and 3.164× at 1win Essence II. |
| **None of the three shown options may be offered again in the immediately following deal** | User instruction 2026-09-03; `deal()` in `lib/offers.ts` draws freely | The value of a reroll. Public sources confirm only three unique options within one deal. Valve stores operations in buckets with a requested count, but the live bucket contents are not public and no consecutive-deal dataset was found. |
| **A stat is trusted as far as it repeats** | `lib/reliability.ts`, weights from `data/generated/reliability.json` | Every ranking. Each stat's estimate is pulled toward the field average by however unreliable the stat was measured to be — the standard regression-to-the-mean correction, with the weight measured rather than chosen. What is assumed is that split-half reliability WITHIN an event is a fair stand-in for how well a stat carries ACROSS months and roster changes. It is not: measured inside one event it is an upper bound, so the correction is smaller than it should be. Backtested rather than argued — see below. |
| **A role heuristic is a role** | `scripts/fetch-league.mjs` | Every ranking. Lane detection is OpenDota's reading of where a hero stood, not Valve's fantasy assignment. It has never disagreed where it can be checked and is never close, but it is inference. STRATZ exposes a real per-match `Position` (POSITION_1…POSITION_5) behind a free API token, which would remove the inference entirely. |

That is the whole list, and it is seven. Runes, Towers and Teamfight were on it
briefly: they were never new guesses, they were old guesses that had never been
written down, and you settled all three. Two came back the other way. Madstones,
because the bundle count is measured but the stones-per-bundle factor that turns
it into the scored stat is not. And the no-repeat rule, which had been sitting in
the verified table on the strength of an observation that turned out not to be a
careful one — a reminder that "You" is a source like any other, and worth
re-checking rather than promoting.

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

## Not in ordinary APIs, but recoverable from replays

Four things TI fantasy scores that OpenDota and STRATZ do not report correctly.
They are nevertheless present as end-of-game network properties in Valve
replays and an open Clarity extractor now exposes them directly:

| Stat | Exact replay field | Ordinary-API error at TI 2026 |
| --- | --- | --- |
| **Watchers Taken** (147 pts) | `m_iWatchersTaken` | OpenDota lamp uses are 1.48× the exact TI count |
| **Lotuses Gained** (176 pts) | `m_iLotusesTaken` | OpenDota Famango uses are only 41% of the exact TI count |
| **Madstones Collected** (13 pts) | `m_iNeutralTokensFound` | OpenDota bundles are 3.177× below the exact TI total |
| **Tormentor participation** (879 pts) | `m_iTormentorKills` | OpenDota last-hit credit is 3.169× below the exact TI participation total |

Neither a lotus nor a watcher is named in the ordinary OpenDota/STRATZ payloads;
the exact counters come from the replay's replicated team-player array instead.
STRATZ's schema was read directly rather than assumed — all 513 types were
introspected, and `lotus`, `watcher` and `madstone` return zero hits apiece.
Two other Tormentor fields exist in OpenDota and both were tested against all 2,540 cached
matches rather than a sample. `damage.npc_dota_miniboss` is a kill counter under
a different name: across 3,826 credited player-games there are **zero** where a
player dealt damage without also being credited the kill, so it carries no extra
participation. `damage_taken.npc_dota_miniboss` genuinely is a participation
signal — 2.65 players per kill took damage — but it is the wrong participation:
scored as credit it lands core 1.28x, mid 3.13x and support **9.18x** of the
reference, because supports get hit by a Tormentor and walk away. Splitting the
credit by share of damage taken is no better (0.45 / 0.96 / 2.86). The plain
kill credit remains the least wrong of the four. Getting real numbers for
any of the four means parsing replays, which is what the community calculators
that do have them are doing.

For a support, watchers plus lotuses are worth more than Observer Wards. That is
the largest known gap in this model.

### Why the old 2.7 Madstone factor was replaced

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
   correction internally. Between them every other stat moves by a flat factor
   — 2.0 for Core and Support, 1.0 for Mid — while madstones moves by 5.37 and
   3.05. That factor is a **pair** factor, not a series one: their pair entries
   are two players ("YSR-04E & niu") and their mid entries are one, so they sum
   a pair where this project averages. Dividing it out, their implied madstone
   correction is 2.69 for Core and 3.05 for Mid.

The direct replay comparison supersedes those indirect estimates. Exact totals
over 3,630 player-games give a stable 3.16–3.18 stones per recorded bundle, so
the uncovered-match fallback is now 3.17. Covered matches use no factor.

## What shrinking unreliable stats did

`npm run persistence` measures, per stat, whether the player who led beforehand
still leads afterwards. Pooled over five Internationals the answer ranges from
0.95 (a support's wards) to 0.00 (a support's Tormentor). Teamfight
participation sits at 0.38–0.51 while paying 2,124 a unit, the second highest
in the game, and First Blood at 0.11–0.30 while paying 1,934.

So the ranking now trusts each stat by that measurement. Graded both ways, on
the two out-of-sample tests the validator already ran:

| | without | with |
| --- | --- | --- |
| Group → playoffs, mean percentile of the pick (5 events, 15 role-events) | 44th | **49th** |
| Group → playoffs, share of the best possible pick captured | 76.8% | **79.0%** |
| Group → playoffs, mean rank correlation | 0.07 | **0.10** |
| Pre-event → event, mean percentile (TI 2026) | 51st | **61st** |
| Pre-event → event, picks that beat the field | 3 of 5 | **4 of 5** |

Every summary moved the right way and none moved back. It is a modest gain, not
a transformation, and the samples behind it are small — 15 role-events and 5.
The single largest move, a mid playoff pick going from the 50th percentile to
the 100th, is one role at one event and should not be read as the size of the
effect.

Two things it deliberately does not do. It does not shrink game-to-game spread,
only the player's level, so the floor and ceiling the risk slider reads still
come from real variation. And it does not touch `/information`, which reports
what entries produced rather than what to expect from them.

## Recency weighting: measured and held back

Every generated player sample now carries its match time. Training also records
its source league, role/team relationship to the target roster and whether exact
replay data was available. `npm run train -- <id> --weighted` can apply a
180-day window, 60-day half-life and modest same-team/same-role/data-quality
weights.

It is deliberately not the default. On the only complete pre-event test, TI
2026, it moved the average pick from the 76th to the 68th percentile, picks above
the field from 4/5 to 3/5, and rank correlation from 0.35 to 0.32. One event is
not enough to tune those constants without overfitting.

## How a pair is scored — settled, and the order matters

The in-game Fantasy glossary says it directly:

> We then average the score of all players for a role and use that to decide the
> final score for a game.

So a pair is the **average**, not the sum. This project already averaged; the
other public calculator sums, and its stored value for `Ame & Xxs` is 1.02x our
sum on GPM and 1.03x on Deaths — about twice the correct figure. That convention
came from a table its author transcribed from an unnamed source, which is why it
carries no authority against the client's own text.

Provenance, precisely: the wording above is Valve-authored text shown in the Dota
2 client, but it was read from a screenshot hosted in a third-party repository
rather than from a Valve domain. Valve's own TI 2026 announcement independently
confirms the roster shape — "both supports from one team, the safelaner and
offlaner from one team, and then your favorite midlaner" — but does not spell out
the averaging sentence. Treat the rule as confirmed and the hosting as incidental.

The same sentence settles two more rules for free. The top two scoring games in a
series decide the match score, and where a role plays several series in a period
the best-scoring one is used. Both were previously credited to observation.

### The order is the part that bit

"Average the **score**" is not the same as averaging the stat lines and scoring
once. For the fifteen linear stats it is; Deaths are floored at zero, and a
2-death game beside an 18-death game averages to exactly ten deaths, which scores
nothing — while the two scores average to 780. This project had it the wrong way
round, in 246 of 3,176 pair-games across five Internationals (7.7%),
understating pair Deaths by 1.34% overall and by a whole emblem in the worst
case. `pairUp` now scores each player, averages, and converts back through
`pointsToStat`. Rankings and the backtest are unchanged, which is what a 1.34%
correction on one stat should do.

Note this only bites if Deaths really do floor at zero, which is still on the
assumed list and is the next thing worth asking about.

## The reference table cannot settle Tormentor

Worth knowing before anyone grades against it again. The community table this
project cross-checks has a companion per-player table in the same repository,
and the two are a constant factor apart for every stat — 2.0 for pairs, 1.0 for
mid — with two exceptions. Madstones, which is the correction described above.
And Tormentor, where the two tables disagree by **2.0x for Core, 3.5x for Mid
and 17.1x for Support**.

Whatever that pipeline does with Tormentor, it does not reproduce itself. So
`support/tormentor 0.55x` is not evidence this project is wrong; it is a
disagreement with a number its own author's two tables disagree about far more
violently. It stays reported and stays out of the unexplained count.

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
  said "Smokes used". The emblem pays for a smoke that was *popped*: a support
  who buys one and hands it to a team-mate never pops it, and a smoke bought by
  a team mate and used by this player did not count at all. The two differ in
  29 of 56 player-games that have the data, and by a factor between 0.67 and
  1.03 per player across TI 2026's supports — so it reordered the support
  ranking rather than just scaling it. Now `item_uses.smoke_of_deceit`.
- **Deaths could pay a negative score** — 1950 − 195 a death crosses zero at ten
  deaths, and 5.9% of player-games are above that. No stat pays a penalty.
- **An emblem's average was scored from the average stat line** — scoring
  happens per game, so the average has to be taken over scored games. Identical
  for fifteen stats, which are linear; wrong for Deaths, which is floored. It
  understated Deaths by 3% across the board and by up to 4x for one player.
- **Tormentor goes to whoever the chat message names** - `CHAT_MESSAGE_MINIBOSS_KILL`
  names a support five times more often than an independent per-role table says
  it should, and a core six times too rarely. The combat log's kill credit,
  `killed.npc_dota_miniboss`, has the right shape instead: core 0.73x, mid
  1.18x, support 0.55x. Neither can be exact, because the game credits the kill
  to everyone involved in it.
- **The pro registry is the best source of roles** — it is a snapshot of who
  plays what *today*, so applied to an old event it is an anachronism: it files
  Team Liquid's TI 2022 mid as a core, because core is what he plays in 2026. It
  is also thin on mid — only a few dozen players worldwide carry
  `fantasy_role: 4` — so most mids came back labelled core. Read one player at a
  time that left squads with three cores and no mid, and `buildLineups` then
  dropped their Mid entry entirely and mixed a mid's farm into the Core pair: TI
  2022 shipped 13 mids for 20 teams, TI 2023 fourteen for 20. Roles now come
  from the lane detection in each event's own replays and are resolved per team
  — one mid each, and a five-player squad is filled out to the only line-up a
  fantasy roster can have. It reproduces the registry exactly where the registry
  is contemporaneous, and all five Internationals now offer a complete set of
  entries for every team.
