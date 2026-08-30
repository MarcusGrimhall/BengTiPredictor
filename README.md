# BengTiPredictor

Fantasy calculator and bracket predictor for The International, built on real
match data from OpenDota. Fetch whichever tournament you want to work on and the
tools adapt to it.

The model is fitted on tournaments played **before** the event it predicts, and
graded on the event itself — see [Does any of it work?](#does-any-of-it-work).

## Getting started

```bash
npm install
npm run leagues -- international    # find a league ID
npm run fetch -- 19719              # fetch the tournament
npm run dev                         # http://localhost:3000
```

## Where the data comes from

Everything is pulled from [OpenDota](https://docs.opendota.com/) — free, no API
key, 60 calls/minute and 3,000/day. Nothing is typed in by hand.

```
OpenDota /leagues/<id>/matches   ->  list of match IDs
OpenDota /matches/<id>           ->  per player, per game
                                     |
scripts/extract.mjs              ->  raw values + role
                                     |
scripts/fetch-league.mjs         ->  per-game averages, team strength
                                     |
data/generated/league-<id>.json  ->  read at build time
                                     |
lib/scoring.ts                   ->  raw values become fantasy points
```

The key decision: we store **raw values**, not finished points. If Valve changes
the scale, only the constants in `lib/scoring.ts` change — no re-fetch.

Raw match responses are cached in `data/cache/` (gitignored). Re-runs therefore
take seconds and you can recompute the aggregation without hitting OpenDota
again. `--refresh` forces a new fetch.

### Which stats are available

15 of the fantasy game's 18 stats can be derived:

| Fantasy stat | OpenDota field |
| --- | --- |
| Kills, Deaths | `kills`, `deaths` |
| Last hits, GPM | `last_hits`, `gold_per_min` |
| Towers | `towers_killed` |
| Roshan | `killed.npc_dota_roshan` |
| Tormentor | `objectives` → `CHAT_MESSAGE_MINIBOSS_KILL` per `player_slot` |
| Courier, First Blood | `courier_kills`, `firstblood_claimed` |
| Teamfight, Stuns | `teamfight_participation`, `stuns` |
| Wards, Camps, Runes | `obs_placed`, `camps_stacked`, `rune_pickups` |
| Smokes | `purchase.smoke_of_deceit` |

**Lotuses, Watchers and Madstones are missing.** They are real emblem stats in
the TI 2026 Compendium, but no public API exposes them:

- **OpenDota** — not in any of the 146 player fields, not in `objectives`
  (only `building_kill`, `ROSHAN_KILL`, `AEGIS`, `MINIBOSS_KILL`, `FIRSTBLOOD`,
  `COURIER_LOST`), not in `permanent_buffs` (those are hero buffs like
  `aghanims_shard`). The `lotus_orb` and `madstone_bundle` strings that do appear
  are items, not the map mechanics.
- **STRATZ** — its generated GraphQL schema has no lotus, watcher or madstone
  field either. It has runes (including the `WISDOM` rune type) and
  `campsStacked`, but nothing for these three.

Getting them means parsing replays yourself with Clarity or Manta and extracting
the events. The calculator shows fewer stats rather than guessed ones.

### Roles

OpenDota gives no position. Per team and match:

1. **Mid** = the player with `lane_role === 2` (most last hits if several).
2. **Core** = the two highest last hits of the remaining four.
3. **Support** = the last two.

A player's stored role is the one they held most often. On TI 2026 this produced
exactly 32 core / 32 support / 16 mid across 16 teams — 2/2/1 per team, as expected.

## How points are calculated

The point values are Valve's **official TI 2026 Compendium fantasy scale**
(+107 per kill, 1950 − 195 per death, +3 per last hit, GPM × 2, +352 per tower,
+117 per ward, +234 per camp stacked, and so on). They are declared in one place,
`POINT_VALUES` in `lib/scoring.ts`.

A banner has five emblems. Each emblem contributes:

```
points = statToPoints(stat, rawValue) × (1 + tierBonus) × traitFactor
```

Tiers give +10 / +30 / +60 / +100 / +150%. Traits are multiplicative and can hit
neighbouring emblems:

| Trait | Effect |
| --- | --- |
| Fractal | +60% if all five tiers are different |
| Benevolent | +20% to adjacent emblems |
| Vampiric | +50% to itself, −10% to neighbours |
| Unique | +30% if it is the only Unique on the banner |
| Friendly | +50% if the banner has at least three Friendly |

**A banner shows each stat once.** Three Last Hits emblems is not legal, so the
dropdowns hide stats already in use and `optimizeEmblems()` never proposes a
duplicate. It sweeps every legal stat per slot and also tries swapping two slots,
which a per-slot sweep alone cannot reach — traits depend on position, so moving
the same two stats around changes the score.

Slot colours, with the group stage running on the first three:

| Role | Main event | Group stage |
| --- | --- | --- |
| Core | 3 red, 2 green | 2 red, 1 green |
| Mid | 2 red, 1 blue, 2 green | one of each |
| Support | 3 blue, 2 green | 2 blue, 1 green |

### A series is the average of its two best games

Fantasy does not pay per map. **A series scores as the average of its two
highest games.** In a Bo3 you take the best two and average them; the third game
is worth nothing unless it displaces one of the first two. A one-game series
scores that game.

Worked through, for a real playoff series:

```
game 1   8,314   counted
game 2   7,505   counted
game 3   3,097   dropped
                 series score = (8,314 + 7,505) / 2 = 7,910
```

Because it averages, going the distance is worth nothing on its own. Scoring per
map and multiplying by expected maps would pay a team for playing a third game,
so the model counts **series** instead:

```
stage total = (score at your risk level, per match) × (expected series)
```

`matchScores()` in `lib/fantasy.ts` groups a player's games by series id and
averages the top two of each. That is the distribution the risk slider
reads percentiles from — floor, median and ceiling are all per match.

### Core and Support are pairs

A roster is **one Core pair, one Mid, one Support pair**, and each pair must come
from the same team. So those are the entries that get ranked: `buildLineups()`
combines two team-mates game by game, matched on match id, and the ranking lists
`Yatoro & Collapse` rather than two separate carries. Only Mid is a single
player.

A pair is valued as the **average** of its two members, not their sum, which
keeps all three roles on one scale so a title multiplier means the same thing
everywhere. It does not reorder anything within a role — every pair is halved by
the same factor — but it makes Core, Mid and Support directly comparable.

This is not cosmetic. A pair's line is the two players combined, so the optimal
banner for a pair is not always the optimal banner for either member.

## Team strength moves the score, but less than you would think

A player's past numbers were earned against whoever they happened to draw. Facing
a harder field should cost them something. How much is measured, not assumed:
regress each map's score on the Elo gap in that match, normalised by the
player's own mean so "good players are on good teams" cannot leak in.

```
score / own mean  =  1 + 0.0184 × (Elo edge / 100)
n = 2,910 player-games      SE 0.0045      t = 4.05      r = 0.075
```

A 200-point Elo advantage is worth about **3.7%** on a per-map score. Real — a
t of 4 is not noise — but small. A naive bucket average suggests +10%, and most
of that is the confound. `lib/strength.ts` applies the fitted version.

The stats that move most with a rating edge are GPM, runes, kills and towers,
and deaths move the other way. All of them weakly.

## The reroll budget is shared

40 tokens for the group stage and 30 for the playoffs, and they cover **all three
banners**. So the question is never "is this reroll good" but "is this reroll, on
this banner, the best thing to spend the roster's tokens on". The simulator holds
all three banners, takes offers tagged by role, and always compares **skip**
alongside them — a comparison without skip makes every option look like the best
option, because the only alternative is another option.

## Trainer titles

One **Prefix** and one **Suffix** apply to the whole roster, both as conditional
multipliers. The headline percentage is the wrong number to pick on:

```
expected multiplier = 1 + bonus% × how often the condition actually fires
```

The Lucky pays +21% but only when a game's duration ends in the digit 8. The
Underdog pays +6% on every game the team loses. Which is worth more depends
entirely on the frequency, so the app measures it from the fetched matches.

Five of the eight Suffixes are decidable from public match data:

| Suffix | Bonus | Fires when | Status |
| --- | --- | --- | --- |
| the Decisive | +24% | game ends before 25:00 | measured |
| the Patient | +23% | no first blood before 10:00 | measured |
| the Lucky | +21% | duration ends in the digit 8 | measured |
| the Clutch | +16% | last possible game of a match | measured |
| the Underdog | +6% | the player's team loses | measured |
| the Tormented | +23% | a roster player dies to a Tormentor | deaths are not attributed to the Tormentor |
| the Flayed Twins Acolyte | +9% | first blood before the starting horn | the horn is not a timestamped event |
| the Cruel | +13% | a player is killed at their own fountain | kill locations are not exposed |

Conditions are evaluated per game at fetch time and stored as a bitmask, so the
trigger rate is measured over the games each entry actually played rather than
assumed.

Measured across both TI group stages and playoffs:

| Suffix | Bonus | Fires | Worth |
| --- | --- | --- | --- |
| the Underdog | +6% | 53.8% | +3.23% |
| the Clutch | +16% | 19.3% | +3.10% |
| the Lucky | +21% | 13.4% | +2.81% |
| the Patient | +23% | 2.5% | +0.58% |
| the Decisive | +24% | 0.7% | +0.16% |

The Decisive pays the most and is worth the least: TI games are not short.

**Two of them depend on who you pick, not just on the title.** The Underdog pays
on a map your team *loses*, so it fires least on the strongest team — the one you
most want. At TI 2026:

```
Team Spirit    fires 27%    Underdog worth +1.60%
TEAM VISION    fires 43%                   +2.57%
Team Falcons   fires 67%                   +4.00%
Iron Wing      fires 80%                   +4.80%
```

The Clutch is the mirror image: it pays on the last possible game of a series,
which happens when sides are evenly matched.

Put together, the field-average table above is misleading for the pick you
actually want. For the TI 2026 champion:

```
the Clutch     fires 20%    worth +3.20%     <- best for them
the Lucky      fires 13%           +2.80%     <- indifferent to who you are
the Underdog   fires 27%           +1.60%     <- best on average, worst here
```

The Underdog tops the field average and is nearly the worst choice for the team
you most want to pick. The Lucky is the only one that does not care. Both rates therefore come from *simulating the stage* rather than from a
historical average — the bracket simulation already plays every series map by
map, so it reports maps lost and deciding maps alongside maps played. For a
stage that is already finished, the measured rate is used, because that is what
happened.

**Prefixes cannot be valued yet.** All eight fire on the hero's colour or theme
group — red, blue, green, purple, yellow/brown, elemental, otherworldly,
masked/cloaked — and that is Valve's classification. It is in no public API:
OpenDota's hero constants carry only primary attribute, attack type and roles.
The hero each player picked in every game *is* already in the data, so filling
`HERO_GROUPS` in `lib/titles.ts` is all that is needed; until then the app
reports Prefix rates as unknown rather than guessing.

## Fantasy simulator

40 tokens for the group stage, 30 fresh for the main event; unused group stage
tokens expire at roster lock. The menu rerolls the stat, the quality or the trait,
scoped to all / first / last / a random emblem of one colour, plus two wildcards
that shuffle qualities.

Type in the banner you actually hold, set how many tokens are left, tick the
options the game is offering. Each is rolled 800 times, and reported two ways —
what one roll does, and what the option is worth once the budget is played out.

```
option                                  cost  rolls   one roll        end   break-even
Wildcard · randomly increase one          3t     13   +9,226      +14,294        1 roll
Reroll quality · a random red emblem      1t     40  -16,630       +7,050      14 rolls
Reroll quality · a random green emblem    1t     40   -6,345       +4,157       8 rolls
```

The middle row is the whole point. One roll of that red emblem loses 16,630 on
average — every emblem is already tier IV and a fresh quality roll usually comes
out worse. But tier V exists, 40 tokens buys 40 tries, and you decide after each
roll whether to stop. From the 14th roll onward the plan overtakes standing pat,
finishing 7,050 ahead. Given only one affordable roll the same option is
correctly refused.

### How the end-of-budget number is computed

You never get a rerolled emblem back, but you do choose after every roll whether
to stop. That option is exactly what a one-step average throws away. With `k`
attempts left the banner is worth the classic optimal-stopping recursion

```
c₁ = E[X]
cₖ = E[max(X, cₖ₋₁)]
```

where `X` is the banner's value after one roll, sampled 800 times. `cₖ` climbs
towards the best outcome the action can reach. The plan value is
`max(current, c_attempts)` — never below holding, because holding is allowed —
and break-even is the first `k` where `cₖ` passes what you already have.

`stoppingCurve` in `lib/reroll.ts` does this in O(attempts · log runs) off a
sorted sample and a prefix sum, so the whole budget is planned for the same cost
as the old one-step estimate. It assumes the outcome distribution stays put as
the rest of the banner changes — close to exact for single-slot rolls, loosest
for the `all` scopes, which reroll the very emblems the distribution was
measured against.

**Token costs and roll distributions are assumptions.** Valve publishes neither
and no guide lists them. They are `ACTION_COSTS`, `TIER_WEIGHTS` and
`TRAIT_WEIGHTS` in `lib/reroll.ts` — correct them there and every number follows.
The number of affordable rolls comes straight from `ACTION_COSTS`, so a wrong
cost moves the break-even column more than anything else on the page.

## Team strength: no manual input, no betting APIs

Nobody types in strength numbers. OpenDota maintains an **Elo rating per team**
at `/api/teams`, free and without a key, updated after every professional match.
That is what drives the bracket.

Every betting/odds API checked requires a paid key: The Odds API (`INVALID_KEY`),
PandaScore (403), Abios (unreachable). None is needed — the Elo spread across the
TI 2026 field was 1128 to 1546, which gives the top seed a 92% map win chance
against the bottom seed. Simulating that bracket puts the favourite at ~46% to win
the event, against the reference site's 43%.

Elo is a **per-map** rating, so a series is derived from it:

```
map    P = 1 / (1 + 10^((Rb - Ra) / 400))
series P = chance of reaching ceil(N/2) map wins first
maps   E = the same sum weighted by how long each ending takes
```

A best-of-3 amplifies the favourite: 60% per map becomes 65% per series, and a
best-of-5 pushes it to 68%. The bracket is therefore simulated map by map, not
series by series — which also makes the map count a real draw rather than an average.

## Risk is a number of runs

The slider reads a percentile of your own outcome distribution, and the expected
best of N runs lands near the N/(N+1)th percentile. Inverting that, a percentile
`p` is what you would target if you were going for the best of `N = p / (1 - p)`
runs:

```
risk  50   →  53rd pct  →  a typical run
risk  70   →  70th pct  →  the best of about 2
risk  86   →  83rd pct  →  the best of about 5
risk 100   →  95th pct  →  the best of about 19
```

So the slider is not "how brave am I", it is "how many attempts am I effectively
aiming to beat". If you get five shots and only the best counts, risk 86 is the
setting that matches.

Measured on TI 2026, five chances is worth **+17.2%** over one:

```
 1 chance    168,044
 2 chances   182,166   +8.4%
 5 chances   196,927  +17.2%
10 chances   205,426  +22.2%
20 chances   212,822  +26.6%
```

And the lift depends on what you picked. The safe pick gains +4% from five
chances; the aggressive one gains +15%. Extra attempts are only worth having if
you spend them on variance.

## Risk: floor, median and ceiling

An average hides what matters in fantasy. Every individual game a player played is
stored (`samples` in the generated JSON, 1,470 rows for TI 2026) and re-scored
against your banner, giving a real distribution rather than one number. This
preserves the correlation between stats — a big game tends to have high kills *and*
high GPM at once, which a mean-and-standard-deviation model would throw away.

The risk slider reads a percentile of that distribution:

| Risk | Percentile | Answers |
| --- | --- | --- |
| 0 | 10th | Who holds up on a bad day |
| 50 | ~53rd | Who is best in a typical game |
| 100 | 95th | Who can actually highroll |

The spread is large enough to matter — a single TI 2026 core ranged from 1,491 at
the floor to 5,412 at the ceiling, a 3.6× swing on the same banner.

## Two fantasy periods, scored separately

TI runs two fantasy cards. The group stage card has three emblems and 40 reroll
tokens and scores over the group stage matches. The playoff card keeps those
three emblems, adds two, grants 30 fresh tokens, and scores over the playoff
matches. Group stage points do not carry into the playoff card.

Everything that feeds a projection differs between them:

| | Teams | Maps per team | Who scores |
| --- | --- | --- | --- |
| Group stage | 16 | 10–17 (mean 13.5) | everyone |
| Playoffs | 8 | 4–16 (mean 9.2) | only the eight who advanced |

So the stage tabs at the top of the calculator do not just resize the banner.
They change which games the averages come from, which map counts multiply them,
and which players are eligible at all — a team knocked out in groups scores
nothing in the playoffs, which is not the same as scoring a little.

### Finding the boundary

The split is read out of the schedule, not hardcoded. Group stage and playoffs
are separated by a multi-day break while the venue changes over:

```
event      boundary   next longest   group | playoffs
TI 2026       88.2h          13.2h     109 | 38
TI 2025       83.8h          13.5h     108 | 36
TI 2024       60.3h          15.5h      99 | 22
TI 2023      111.1h         108.5h     101 | 50
TI 2022       38.9h         135.6h     183 | 48
```

`scripts/stages.mjs` takes the **longest qualifying** gap: one that clears 36
hours and leaves at least 10% of the event on either side. Both conditions
matter. TI 2022 ran its main event over two weekends, which put its longest
break of all (135.6h) between the main event and the finals — a 95/5 split that
is not a stage boundary. Taking the longest gap outright finds nothing there;
taking the longest *qualifying* gap finds the real one at 38.9h.

### The format is not stable

Nothing about the group stage repeats reliably across Internationals:

```
TI 2022   20 teams   9.3 series per team   Bo2
TI 2023   20 teams   5.0                   Bo3
TI 2024   16 teams   5.9                   Bo3
TI 2025   16 teams   5.5                   Bo3
TI 2026   16 teams   5.5                   Bo3
```

TI 2022 ran nearly twice the group stage of TI 2023, and ran it Bo2. So the
shape is read off whichever event is being projected rather than assumed —
series per team and maps per series both come from the data, and the hardcoded
constant is only a fallback for an event that has not been played.

## From per game to per tournament

A player only scores in games their team actually plays, so a per-game score has
to be multiplied by a map count. Where that number comes from, in order:

1. **The bracket you built** on the Bracket page, simulated from Elo.
2. **What was actually played**, for a stage that is finished. Nothing beats it.
3. **A projection**, for a stage still ahead.

The playoff projection is real: a fixed eight-team double-elimination bracket,
Bo3 with a Bo5 grand final, simulated 20,000 times from the Elo ratings. It works
— see the validation below.

The group stage projection is deliberately weak, and it is worth saying why. A
team's group stage map count is driven mostly by *how many series it plays* (four
to six, decided by results) and only secondarily by *how long each series runs*
(two or three maps, which Elo can speak to). Only the second is predictable, so
the projection lands every team between about 12 and 14 maps where the truth ran
10 to 17. That barely matters for ranking: in the group stage every team plays
roughly the same number of maps, so the multiplier is near-constant across
players and per-game scoring decides the board. In the playoffs the spread is 4
to 16 maps and the multiplier decides everything — which is exactly where the
bracket simulation takes over.

## Training data comes from before the event

A projection for a tournament may only use matches played **before** that
tournament started. Fitting on the thing you are predicting flatters the model
and tells you nothing.

So the pipeline has two kinds of event:

```bash
npm run fetch -- 19269 --training     # an earlier tournament: model input only
npm run fetch -- 19719                # the target event: what we predict
npm run train -- 19719                # merge the earlier events into one sample
```

`--training` events never appear in the app as "the tournament" — they exist to
fit the model. `npm run train` merges them into `data/generated/training-<id>.json`,
refusing any event whose last match runs into the target.

**Roster from the event, form from before it.** Who plays for which team in which
role is known when fantasy locks, so that comes from the target event. Every stat
line the projection is built from comes only from earlier tournaments. A player
who changed teams keeps their form and gets their new team.

The training set for TI 2026 is nine tier-1 tournaments from the 2026 season,
picked for roster overlap with the event:

```
18988  DreamLeague Season 27          19422  ESL One Birmingham 2026
19099  BLAST SLAM VI                  19543  PGL Wallachia 2026 Season 8
19239  FISSURE Universe Episode 8     19101  BLAST SLAM VII
19269  DreamLeague Season 28          19696  DreamLeague Season 29
19435  PGL Wallachia 2026 Season 7
```

For comparison, the project this was inspired by used "1,601 matches across 13
Tier 1 tournaments" — a similar scale, hand-transcribed rather than fetched.

## Does any of it work?

`npm run validate` grades the model against the tournaments in `data/generated/`.
Everything that can be out-of-sample is: the model is fitted on the group stage
and graded on the playoffs, which it has not seen, and scored against a baseline
— "correlates with reality" means nothing if guessing the average does as well.

### The reroll planner is exact

The end-of-budget number comes from an optimal-stopping recursion, so it is
checked against brute force: literally roll `k` times, stop when the banner beats
the continuation value, average 60,000 runs.

```
 1 rolls  formula   660   simulated   661   0.14% apart
 2 rolls  formula   872   simulated   875   0.29% apart
 4 rolls  formula 1,153   simulated 1,153   0.03% apart
 8 rolls  formula 1,462   simulated 1,464   0.09% apart
12 rolls  formula 1,630   simulated 1,626   0.29% apart
```

### Picking entries works

Rank on group stage games alone, then score on what was actually banked in the
playoffs — pairs at Core and Support, individuals at Mid:

```
TI 2026            rank correlation          top pick    an average pick
core                     0.81                 270,242        165,383
mid                      0.81                 133,208         86,728
support                  0.71                 245,924        155,317
```

The top pick captured 95% of what a perfect hindsight pick would have scored and
beat an average pick in every role. With the real series counts substituted for
the projection, rank correlation rises to 0.94 — the residual error is the map
model, not the scoring.

### The risk slider is calibrated

Read a player's ceiling off their group stage games, then count how often their
playoff games — never seen — cleared it:

```
                      TI 2026   TI 2025   claimed
floor    (risk 0)      84.7%     73.1%      90%
median   (risk 50)     44.7%     35.6%      50%
ceiling  (risk 100)     6.3%      5.3%       5%
```

The ceiling is close to exact both years. The floor sits low because playoff
games are a tougher sample than group stage games, which is the right direction.

### Splitting the stages was not cosmetic

Ranking playoff players with the group stage's map counts instead of the
playoffs':

```
core     3 of the top 5 survive
mid      3 of the top 5 survive,  #1 changes
support  2 of the top 5 survive,  #1 changes
```

### What does not work: ratings on an old event

OpenDota rates teams **as of the last fetch, not as of the tournament**. Graded
against the maps actually played:

```
TI 2026   69.4% of maps called correctly   log loss 0.604   usable
TI 2025   52.7% of maps called correctly   log loss 0.801   worse than a coin flip
```

A coin flip scores 50% and 0.693. A year of later results has overwritten the
TI 2025 ratings, and everything Elo-driven collapses with them — playoff map MAE
3.81 against a 3.50 baseline, map-count rank correlation −0.11.

The damage is contained, and the decomposition shows where:

```
                          rank correlation, group stage -> playoffs
                          with projected maps    with real map counts
TI 2026                          0.79                   0.94
TI 2025                          0.18                   0.98
```

The per-game scoring model is sound both years. Only the map projection breaks,
and only because its input is stale. So:

- The fetch grades the ratings and stores the verdict. When they fail, the app
  says so at the top of the Fantasy and Bracket pages.
- A finished stage uses the maps that were actually played, so the default view
  never depends on the ratings at all.
- The ratings are right for the event being played now, which is the case the
  bracket simulator is for.

## Layout

```
scripts/     data pipeline and validation (run manually)
  stages.mjs   finds the group stage / playoff boundary
  validate.mjs grades the model against finished tournaments
lib/         calculations, pure functions, no React
  elo.ts       map/series probability and expected maps
  fantasy.ts   emblems, traits, series scoring, pairs, risk percentiles
  titles.ts    Prefix and Suffix definitions and trigger rates
  bracket.ts   generic bracket generation and simulation
  tiBracket.ts the fixed TI main event projection
  reroll.ts    reroll actions, roll distributions, optimal-stopping plans
  stages.ts    the two fantasy periods: slots, tokens, group stage shape
  groupStage.ts group stage map projection (and its limits)
  data.ts      stage-aware loading of the generated JSON
components/  client components
app/         routes + one CSS design system
data/
  generated/ committed, read at build time
  cache/     gitignored, raw API responses
```

`lib/` has no React dependency, so the maths can be tested standalone.

## Commands

Full reference with every flag: **[COMMANDS.md](COMMANDS.md)**.

| Command | Does |
| --- | --- |
| `npm run leagues -- <term>` | Search league IDs |
| `npm run fetch -- <id>` | Fetch a tournament |
| `npm run fetch -- <id> --refresh` | Ignore the cache |
| `npm run fetch -- <id> --min-games 5` | Raise the inclusion threshold |
| `npm run fetch -- <id> --training` | Fetch an earlier event as model input only |
| `npm run train -- <id>` | Merge training events into a pre-event sample |
| `npm run simulate -- --help` | Simulate a roster: risk, runs, chances, lookback |
| `npm run validate` | Grade the model against the fetched tournaments |
| `npm run dev` / `build` / `start` | Next.js |

Set `OPENDOTA_API_KEY` in the environment for a paid key — the script speeds up
automatically.

## How far back the data goes

Every stat the calculator needs survives back to at least TI 2018 — checked by
probing a match from the middle of each event:

```
event      maps   parsed   teamfight   stuns   wards   stacks   runes
TI 2024     121      yes         yes     yes     yes      yes     yes
TI 2023     151      yes         yes     yes     yes      yes     yes
TI 2022     231      yes         yes     yes     yes      yes     yes
TI 2021     487      yes         yes     yes     yes      yes     yes
TI 2019     461      yes         yes     yes     yes      yes     yes
TI 2018     401      yes         yes     yes     yes      yes     yes
```

The pipeline runs on them unchanged; the only cost is fetch time. TI 2022, 2023,
2024, 2025 and 2026 are included. Scores are computed under the **current**
scoring scale throughout, so an older event reads as "what this would have banked
under today's rules" rather than what it paid at the time.

One thing that does not degrade with age is what you would expect. The ratings
are unusable for TI 2025 (51.9%) and TI 2022 (48.4%) but fine for TI 2024 (64.5%)
and TI 2023 (63.4%) — so it is roster churn since the last fetch, not age.

## Names and roles come from the pro registry

Match data carries whatever Steam handle a player was using, which at TI 2026
included `fffffffffffffffffffffffffff`, `1` and `;]`. OpenDota's `/proPlayers`
resolves those to real names in one call, so the site shows **gpk~**, not a row
of f's.

The same endpoint carries an official `fantasy_role`, which is now used directly
and the lane heuristic is only the fallback. Checking one against the other is
also a free validation of the heuristic:

```
TI 2026   80 of 80 agree
TI 2025   72 of 75 agree
```

The three disagreements are all a mid the registry files as a core.

## What the backtest says

`npm run study` grades pre-TI decisions against what happened at TI 2026. Some
of it is not obvious.

**Traits are not worth what the tooltip implies.** On a tier III core banner:

```
vampiric     +12.4%   best on the last slot
unique        +7.9%
benevolent    +9.2%   best next to the biggest earners
fractal        0.0%   alone
friendly       0.0%   alone
```

Fractal and Friendly read zero because one of either never meets its own
condition. As a plan they are the strongest things on the board:

```
three Friendly                  +32.6%
Fractal + five different tiers   +8.8%
two Unique instead of one        −6.4%   they cancel each other
```

Three Friendly beats every single trait by a factor of three. It also costs the
most tokens to build, which is exactly what the reroll planner is for.

**Tiers are worth more than traits.** A whole banner at tier V banks 127% more
than the same banner at tier I. One emblem from III to V is worth +11% to +15%
depending on the slot — more than any single trait except Vampiric.

**Risk 0 was actively bad.** The model's pick at each risk level, graded on what
it actually banked in the playoffs:

```
risk    core        mid         support
   0    1 of 8      5 of 8      6 of 8
  50    1 of 8      1 of 8      3 of 8
  86    1 of 8      1 of 8      3 of 8
 100    1 of 8      1 of 8      3 of 8
```

Playing for the floor cost two of three roles. Risk 50–86 was the range, and
risk 100 slightly hurt the core pick.

**Everyone scores more at TI than before it.** Every stat came in above its
pre-TI level — last hits +52%, towers +37%, GPM +33%. Longer games and a higher
standard, so absolute pre-event projections read low across the board. The
*ranking* still holds, which is what the pick depends on.

## The Information tab

Two views.

**Stats** — one row per stat, one dot per duo, showing what everyone actually
produced. All stats share a scale, so a long row is genuinely worth more, and
the shape of a row is the point: a leader far clear of a tight cluster is a stat
somebody dominates; a row where every dot overlaps is a slot to fill with
whatever is cheapest to reroll. Selectable by tournament, stage and role.

The dots for the four teams that went deepest are marked separately, which
exposes something useful — the stats that separate good teams are the objective
ones, not the participation ones. TI 2026 playoff cores, top four against the
field:

```
Roshan kills            +32%
Towers                  +26%
Deaths (fewer of them)  +14%
Kills                    +8%
Teamfight participation  +1%
First Blood              −4%
```

Everyone shows up to fights. Not everyone takes Roshan.

**Emblem mechanics** — what each tier and trait is worth on a real banner, in
every slot, plus a trait-by-duo heatmap and the stage's records.

## Sharing a setup

Everything the calculator holds — three banners, risk, stage, both titles — is
also encodable as a URL. **Share setup** copies a link that reproduces exactly
what is on screen, so a roster can be sent to someone rather than described, and
two setups can be bookmarked and flipped between.

```
/fantasy?b=gpm.IV.vampiric,teamfight.III.none,creeps.V.fractal|…&r=86&s=playoffs&x=clutch
```

A link beats whatever this browser had saved, because opening one is an explicit
request to see that setup. Anything malformed is rejected whole rather than
partly applied — a link that half works is worse than one that plainly does not,
since the numbers would still look real.

## Credits and prior art

Inspired by [Kadadji1/dota2-fantasy-optimizer-2026](https://github.com/Kadadji1/dota2-fantasy-optimizer-2026)
([ti2026calculator.com](https://www.ti2026calculator.com/)). No code is shared —
that project's numbers are hand-transcribed constants, and building the data
pipeline underneath them was the point of this one — but it is the source for
several things that are not published anywhere official:

- the emblem slot colours per role, and the tier and trait percentages;
- the point value of every stat, including the ones no guide lists;
- the rule that a series scores as its **two highest games**;
- that Core and Support banners pick a **same-team pair**, not one player;
- the Compendium prediction payout scale, 120 points for one correct pick up to
  12,000 for all fourteen.

Their per-player Prefix trigger rates were **computed from real hero picks**, not
invented — the evidence is in the numbers. The eight percentages per player sum
to 172 on average with a tight spread, implying a hero sits in about 1.72 groups;
77 of 79 players have a greatest common divisor of 1, which is what rounding real
frequencies over differing sample sizes looks like; and the role signature is
coherent (mids trigger Otherworldly 41% against supports' 13%, supports trigger
Heroic 32% against mids' 10%). Nobody making numbers up produces that structure.
What they had and did not publish is the hero-to-group classification itself.

Its published table of average per-player emblem values is used as an
independent cross-check in `npm run validate` — different sample, different
pipeline, so agreement is real evidence. 31 of 36 values land within a few
percent. See the validation section for the one that does not.

## Limitations

- **Prefix titles cannot be valued.** The hero colour/theme classification they
  depend on is Valve's and is not in any public API. Three of the eight Suffixes
  are likewise underivable. Both are reported as unknown, never as zero.
- **Reroll token costs are assumed.** Valve publishes no price list and no guide
  carries one, so `ACTION_COSTS` is a placeholder and the break-even column
  moves with it.
- Floor and ceiling come from the games in the fetched sample. A player with few
  games has unstable percentiles — the games count is shown next to every name.
- Elo is career-wide, as of the last fetch, and lags a roster change. It is
  measured per tournament and the app warns when it grades worse than a coin
  flip — see the validation section.
- The group stage map projection is near-flat by construction; how many series a
  team plays is results-driven and cannot be read off a rating.
- Role assignment is a heuristic; a farming position 4 can land wrong in
  individual matches.
- Unparsed matches (OpenDota has not processed the replay) are skipped and
  counted in the output.

Data from OpenDota. Not affiliated with Valve Corporation.
