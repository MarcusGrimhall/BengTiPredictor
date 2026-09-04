# Open questions

What is not settled, written down so it is not rediscovered from scratch. Rules
that *are* settled live in ASSUMPTIONS.md; this file is what is still open, the
reasoning behind calls that were close, and ideas that have not been tried.

Last updated 2026-09-04, after auditing the reroll offer search.

---

## Rules the glossary does not answer

A full sweep of the in-game text settled most of the rule set — three of the four
places this disagreed with the other public calculator came back in our favour.
These are what it left open. Each is a real gap, not a wording quibble.

**Deaths: does the score floor at zero?** The single most consequential one. The
client wording gives the linear scale but does not mention a floor. A 2026
replay-based calculator at battlepass.ru explicitly reports that the game lets
the result become negative, so the current zero floor is now a disputed working
assumption rather than positive evidence. One actual in-client 11+ death result
would settle it cleanly. Eleven deaths is arithmetically −195. Only 1.0–1.7% of
TI player-games go past ten deaths, so the aggregate effect is ~0.3%, but this
is still the rule that makes pair-scoring order matter. **A screenshot of a
fantasy card where a player had 11+ deaths settles it.**

**Quality odds are measured rather than published.** Valve says only that higher
qualities are "more rare when crafting". A public log of 195 client rolls (163
informative) fits Tier I–V weights 5:4:3:2:1; its free fit is
32.8/28.5/22.1/11.7/5.0%, and uniform odds are rejected at p<1e-8. The model now
uses those weights, renormalised over the legal outcomes from the current tier.
There are no ordinary rerolls from Tier IV or V in the sample, so this remains
measured evidence rather than a published Valve rule.

**Trait rerolls have four alternatives, not five.** You confirmed on 2026-09-03
that every emblem always has one of the five traits and starts with a random
trait. `ROLLABLE_TRAITS` now excludes the internal analysis-only `"none"` state.
The five starting traits and four reroll alternatives are assumed uniform; no
public measurements of trait odds were found.

**Tier boundary handling.** Tier V is ineligible for an increase and Tier I for
a decrease. Wildcards choose only among directionally eligible targets before
anything moves; II/II/V therefore raises both IIs and must lower V.

**The complete reroll operation catalogue.** A complete captured list has 20:
Red is granular on Quality, Blue on Trait and Green on Stat; the other two
properties per colour are all-only, plus two colourless quality wildcards.
Valve's schema independently confirms that operations are delivered in buckets.

**Immediate deal repeats are assumed not to occur.** You instructed the model
on 2026-09-03 to proceed on that basis, but it is not directly captured and the
scope still matters: block all three previously shown options, only the option
used, or only declined options. `deal` currently has no memory and permits all
three interpretations' forbidden repeats.

**Wildcard semantics.** "Randomly increase one Quality", "increase two and reduce
one" appear in community material only. Whether the outcome resolves before or
after you apply it is unknown, and the project assumes before.

**Prefix + Suffix stacking.** Playoff result rows settle where the title layer
lands: Royal +10% on Noticed's purple heroes reproduces four client stat values
to the cent only when it multiplies the already quality/trait-adjusted emblem
score, per player and game. We proceed with Prefix and Suffix additive inside
that separate layer (`1 + prefix + suffix`); simultaneous activation has not
been captured, so that final plus sign remains an explicit assumption.

**Replay counters settle the vague stat definitions.** Teamfight is
`m_flTeamFightParticipation`; Tormentor participation is `m_iTormentorKills`;
Madstones score from `m_iNeutralTokensFound`; Watchers and Lotuses are separate
`m_iWatchersTaken` and `m_iLotusesTaken` counters. Exact overlays are present for
TI 2026, EWC 2026 and 1win Essence II. Older matches retain calibrated API
fallbacks, so their values remain less certain.

## The one mechanic we know about and do not model

**Refreshing the three options costs one Roll Token.** There is no free decline
that reshuffles: not using an option spends nothing and changes nothing, and the
tutorial says explicitly that replacing the options costs a token.

`playOut` in `lib/offers.ts` stops the moment nothing on the table has positive
gain. That was written as a floor when the mechanic was unknown; it is now a
known omission. With 30–40 tokens, paying one to see three new options is often
correct, and every plan the simulator produces is understated because it never
does. This is the largest single gap between the model and the game.

## Model gaps

**Shrinkage is calibrated on the wrong axis.** `lib/reliability.ts` trusts a stat
as far as it repeats, measured by split-half *within* an event. The ranking
predicts *across* months and roster changes, where transfer is lower. So the
weights are an upper bound and the correction is smaller than it should be —
wrong in the safe direction, but wrong. Calibrating on pre-event → event needs
training sets for the older four Internationals, which do not exist here.

**The web calculator now uses pre-event form.** It previously passed the target
event's own stage rows into the Fantasy page, making it descriptive rather than
predictive. The page now requires `training-<id>.json`; only `/information`
continues to show what actually happened.

**The picks land near the middle of the field.** Across five Internationals,
group-stage form picks a playoff entry at about the 49th percentile — up from the
44th before shrinkage. Pre-event form at TI 2026 reaches the 61st on five
role-events. The pick captures 79% of the best possible, and the top of the field
is narrow, so this is not as bad as it reads. But it is a long way from the
confidence the interface projects.

**The winner's curse is uncorrected.** `valueOf` takes the maximum over a
shortlist of noisy estimates, which is biased high, and it compounds with the
shrinkage question above. Untouched.

**Unparsed matches vanish quietly.** `extractMatch` returns null on an unparsed
replay and the match is dropped. Right call — half the stats would be empty — but
nothing checks the dropped set is random. Measured today it is moot:
`matchesSkipped` is 0 across all 22 leagues, 2,540 of 2,540. The code path is
still live and silent, so a less-parsed event would reintroduce the question
without announcing it. **Worth a validator check that fails when the skip rate
rises above zero.**

**Roster-based pair selection is currently a no-op, and half-blind on old
events.** `buildLineups` now prefers players on the team's captured roster over
those with the most games, because picking by games played reads the event's own
scoreboard back into a decision made before it starts.

Two things to know about it. First it changes nothing today: across the five
Internationals every team resolves to exactly 2/1/2, so there is never a third
candidate to choose between, and it fires on 6 role-slots in 339 team-events —
all in training events with substitutes. Second, OpenDota's roster flag describes
TODAY, so it is only usable where it still matches the event. Of 339 team-events
**139 rosters were kept and 200 rejected as belonging to a later line-up**; TI
2026, 2025 and 2024 have full coverage while TI 2023 and 2022 have none at all,
which is exactly right and exactly what the guard is for.

The consequence worth remembering: this improves the newest event, which is the
one being predicted, and can never help a backtest of an old one. No public
source carries a historical roster.

## Prefix titles are unvalued, and might not have to be

`HERO_GROUPS` in `lib/titles.ts` is an empty object, so every Prefix is reported
as unknown. The blocker has always been that no public API classifies heroes by
colour or theme, and the glossary sweep confirmed no Valve-published table
exists.

But the other calculator on this machine ships `prefixStatsByPlayerId` — per
player trigger rates for all eight groups, for every TI 2026 entry. That is the
*output* of a classification, not the mapping. This project stores `sampleHeroes`
per game, so their rates and our hero data together constrain the hero → group
assignment: for each player, the fraction of their games on a group's heroes is
known, and the heroes they played are known. With ~80 players over ~120 heroes it
is underdetermined but heavily constrained, and a solve is worth attempting.

Retiring this would move a whole scoring feature from "reported as unknown" to
modelled.

## Two stats nobody can check

**Teamfight participation** is the one derived field of sixteen, reconstructed as
`(kills + assists) / the opposing team's total deaths`. It reproduces the field
exactly in 102 of 120 player-games and in 13 more with a numerator one assist
lower — 95.8% accounted for, 4.2% unexplained. It is the second most valuable
emblem in the game and, per the persistence work, one of the least predictive.

**Stun duration** sums per hero hit, so a three-hero two-second stun counts as
six. OpenDota does this; whether Valve does is likely but unverified. It
systematically favours wide AoE stuns, and ours runs 8–32% above the community
reference across all three roles, which is the signature of a definition
difference rather than a bug.

## The reroll search

**It is honest about being uncertain, and should stay that way.** The simulator
says "take any" rather than crowning a winner when it cannot separate the field:

    best edge over six seeds:  23071, 22118, 22439, 22883, 23285, 24176
    noise:                     ±655
    lead, first over second:   ~404

The lead is smaller than the noise; six seeds produced five different winners.

Three ways to sharpen it, none tried, in the order I would try them:

- **Control variates.** The exact immediate gain of an action is already computed
  for 24 of 26 options by `enumerateOutcomes`. It is a cheap, exactly-known,
  strongly-correlated covariate for the play-out value, so `V − β(G − E[G])`
  would cut that ±655 for almost nothing. This composes with both ideas below and
  is the best value of the three.
- **Spend budget until the lead clears the noise** rather than a fixed play-out
  count. Stop early when the field separates, keep going when it does not, and
  report "no choice matters" when it stays flat — usually the true answer.
- **Truncate play-out depth.** Play-outs run all 40 rerolls; marginal value decays
  fast, so 5–8 rounds plus a fitted "what are N rerolls worth from here" term
  should cost a fifth. The bias is common to every candidate so ranking survives,
  but the fitted term needs its own validation.

**Results are ordered by depth of evidence, not by value.** `decisions.sort` puts
`runsUsed` before `edge`, so a candidate eliminated early can never outrank a
survivor even when its mean is genuinely higher. Defensible, but the displayed
order is not a value order and nothing says so. The page now applies that same
rule (`byEvidence` in `FantasySimulator.tsx`); it used to sort the table by mean
alone while the verdict sentence read `decisions[0]`, so with one pair on 343
play-outs and another on 66 the sentence and the table's "best" tag could name
different options.

### An option was scored against the wrong alternative

Fixed, and worth recording because the symptom was so easy to misread.

`edge` was `takeValue − skipValue`, where `takeValue` plays the whole remaining
budget forward and `skipValue` is a static `current` that spends nothing.
Subtracting one from the other therefore measured *"is it worth playing at
all"*, which is identical for every option, and buried the option's own
contribution inside it. On an all-tier-I roster worth 32,826 with 40 tokens:

    tier-last-red   +47412      tier-last-red    +258   (immediate +2437)
    trait-all-blue  +47276  ->  trait-all-blue   +121   (immediate  +934)
    refresh         +47154      refresh          baseline
    stat-all-green  +47095      stat-all-green    −59   (immediate −2647)

The tell is the refresh row: it changes no banner by construction, and it scored
among the options. The differences that decide the pick were 300 points inside a
47,000 point number. Scoring against `max(refreshValue, current)` fixes it —
refreshing costs the same one token, ends in the same fresh deal and leaves the
banners alone, so both sides carry the play-out and only the option is left.
Stopping is the baseline only when no tokens remain, since unused tokens expire.
`stat-all-green` turning negative is the point: it was always worse than
refreshing and the old number could not say so.

### A mean repairs mistakes it should not always get to repair

Also fixed. `OfferDecision` kept only the average of its play-outs, so a
guaranteed immediate loss read as neutral whenever the budget was long enough to
undo it. At all tier V every quality reroll is a certain downgrade — a reroll
never returns the tier it replaced, so from V the only outcomes are I–IV — and
`tier-last-red` still showed +0, because 39 remaining tokens repair it in
essentially every simulated future.

That is a true statement about where you end up and a useless one about what you
are being offered. The decision now also carries `immediate` / `immediateDelta`
(the roster the instant the option lands), `improveChance` (zero here, and the
page says *cannot improve — every outcome is worse*) and `downside` (p10 of the
play-outs). The same banner now reads: immediate −2,736, edge +0, cannot
improve. Both numbers are true; only one of them was being shown.

Open: `skipValue` is still a static `current` in its own tile and row. That is
the right number for "what do I hold", but it means the take-none row is the one
place on the page not measured over a play-out.

### Shared futures have to consume the stream at the same rate

`planOffers` gives competing candidates the same `futureRandom` per run index so
their outcomes can be differenced run for run — that pairing is what makes the
`tied` test tighter than two means subtracted. It only holds while every
candidate draws the same number of values.

Three places drew conditionally: `takeRandom`'s `while` loop stopped early on a
short pool, the raise loop iterated over however many targets it found, and the
stat branch skipped its draw when every stat of that colour was taken. All three
depend on the banner, which is exactly what differs between candidates, so an
all-tier-V candidate and a mixed one walked off the stream at the first wildcard
and every deal after that point was a different deal. Draws are now
unconditional and the count is fixed per action — two values for `qualityUp`,
six for `qualityUpTwoDownOne`. Spending a value on an empty pool is the cheap
half of that bargain.

Not measured: how much this was actually costing the `tied` test. It affected
only the two wildcards, so probably little, but "probably little" is a guess and
the six-seed spread above was measured before the fix.

## `Best possible` ignores where you already are

Both calculator buttons re-optimise stats and traits from nothing; the only
difference is that **Best possible** sets tiers freely while **Arrange what I
hold** redistributes the ones you have. Neither credits traits already rolled. If
you hold two Friendly on Core, chasing a third is often right — but the optimiser
recomputes the global ideal as though traits were free, and they cost rerolls.

The missing mode is "given what I hold **and** my remaining rerolls, what should
I chase?" The simulator answers that only for the three options on the table. A
third button that locks held traits and optimises around them would cover it.

## Ideas not tried

- **Stat correlation within an entry.** Filling three slots with stats the same
  player dominates concentrates risk rather than spreading it. The spread chart
  cannot show this — it is one stat at a time — and nothing in the optimiser
  accounts for it.
- **Pick on the ceiling rather than the mean.** A period pays a maximum, and the
  risk slider already exposes the distribution, but the ranking optimises a
  percentile rather than the shape.
- **Calibrate recency on several pre-event tests.** Per-map timestamps and an
  experimental 180-day/60-day-half-life mode now exist. TI 2026 regressed on
  all three summary measures, so enabling or tuning it from that one target
  would be overfitting. Build comparable training sets for TI 2023–2025 first.
- **Add madstones to the persistence table's calibration.** It is the least
  reliable red stat measured and the most assumed in extraction; those two facts
  have never been looked at together.

## Performance

`/information` is 2.84 MB of HTML over a 2.37 MB RSC payload, down from 5.23 MB
once the per-entry fields moved out of the per-stat rows. Still ~98% serialised
props.

The render itself is no longer the cost. It was rebuilt from scratch on every
request — 44 `loadLeague` parses, a spread per meta window, an emblem search per
role and stage — so `next dev` spent 5.8-7.0s on a page whose inputs are files on
disk, and three overlapping requests (reload, prefetch, RSC fetch) queued behind
each other at 18s apiece. Parsed files and the whole page are now memoised on the
state of `data/generated/`: 0.29s warm, 3.1s cold, 0.65-1.70s for the same three
in parallel.

**Whether the payload is worth splitting is now an open question, not a given.**
Measured in Chromium: in the production build, clicking to `/information`
takes 72-78 ms and fetches ZERO bytes, because the layout's nav links have
already prefetched it; the main thread is never blocked. The whole prefetch set
is 0.56 MB gzipped, of which `/information` is 0.41 MB. What is slow is `next
dev`, which refetches the full 2.4 MB payload on every navigation — 833-1442 ms
per click against 218 ms for `/method`.

So the remaining fix is worth 1.74 MB (the 21 meta windows are 84% of the spread
and you see one at a time, 85 KB each), but it buys developer-loop time, not
visitor time, and it costs a build artifact in `data/generated/` that can fall out
of sync with `lib/`. Deferred deliberately, not forgotten.

`npm run study` takes 30s against validate's 10s and simulate's 5.6s. It is the
outlier if anyone iterates on it; never profiled.

## Settled since this file was last written

Kept short so none of it is reopened. Detail is in ASSUMPTIONS.md.

- **Pairs average, they do not sum**, and it is the *scores* that are averaged,
  not the stat lines. The ordering error that hid behind that cost a whole
  emblem in the worst pair-game.
- **Bonuses add against the base score**, so tier V with an active Fractal is
  ×3.10. The other calculator's multiplicative model is wrong.
- **A period pays the best single series.** The other calculator averages every
  match instead, which is the error this project retracted long ago.
- **Creep Score counts denies** as well as last hits. Small — 2.5% — but it was
  simply missing.
- **Tormentor cannot be improved.** All four public fields were tested over 2,540
  matches; `damage` is the kill counter renamed, `damage_taken` is participation
  of the wrong kind (supports get hit and walk away, scoring them 9.18×). The
  kill credit in use is the least wrong. The community reference cannot arbitrate
  either — its own companion table disagrees with it by up to 17× on this stat.
- **The Core skew in reroll advice is correct.** Core 49% / Mid 35% / Support 18%
  tracks banner value, which is the right shape.
- **Support courier kills at TI 2026 are a real feature of the event**, not a
  defect: 436 against ~250 at every earlier International, with `courier_kills`
  reconciling to 0.906 of the objective log.

## Things that turned out not to be problems

Written down so they are not re-investigated:

- **Missing madstones and smokes really do mean zero.** Both fields appear for
  some players and not others *within the same match* — 7 of 12 matches are
  mixed, none missing for all ten. Absence is a player who did nothing.
- **`roshan_kills` is a trap, but we use the right field.** It sums to 45 where
  the event log has 34 kills. `killed.npc_dota_roshan` matches the log exactly.
- **Making `contributions` lazy is slower, not faster.** A getter costs more than
  the work it defers — V8 loses the object shape and `sort` reads `total` on
  every one. Tried, measured, reverted.
- **React Flight already dedupes the shared spread reference.** The meta windows
  point `groupStage` and `playoffs` at one object; the payload counts confirm it
  is serialised once. No saving available there. Re-confirmed by deleting the
  `playoffs` copy outright — a window declares one stage and the chart hides the
  toggle for it, so nothing read it — which saved 1.6 KB, not the 440 KB it looks
  like it should. The dead write is gone; the conclusion stands.
- **The Information page's cost was never hydration or React.** Long-task
  measurement puts the blocked main thread at 0-122 ms across every navigation
  and tab switch. It is transfer and parse of the serialised props, nothing else.
  `bestTraitArrangement` was the one real client-side cost — 7,776 arrangements,
  240-295 ms per role or stage click — and it now comes down solved from the
  server for 828 bytes.
- **Averaging a pair does not halve it against a Mid.** It puts both on the same
  per-player scale — Core sits at 1.41× Mid. A prior suspicion that averaging
  biased the reroll search toward Mid was wrong, and backwards.
