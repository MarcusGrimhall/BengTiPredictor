# Open questions

What is not settled, written down so it is not rediscovered from scratch. Rules
that *are* settled live in ASSUMPTIONS.md; this file is what is still open, the
reasoning behind calls that were close, and ideas that have not been tried.

Last updated 2026-09-01, after reading the in-game Fantasy glossary directly.

---

## Rules the glossary does not answer

A full sweep of the in-game text settled most of the rule set — three of the four
places this disagreed with the other public calculator came back in our favour.
These are what it left open. Each is a real gap, not a wording quibble.

**Deaths: does the score floor at zero?** The single most consequential one. The
glossary gives 1,950 − 195 a death and says nothing about clamping, so eleven
deaths is arithmetically −195. This project floors at zero; the other calculator
explicitly does not. Only 1.0–1.7% of TI player-games go past ten deaths so the
aggregate effect is ~0.3%, but the floor is what makes the pair-scoring order
matter at all, and it is currently an unsourced coin-flip in the model. **A
screenshot of a fantasy card where a player had 11+ deaths settles it.**

**Reroll odds are known to be non-uniform, and we model them as uniform.** This
is worse than an unverified assumption — it is an assumption now known to be
wrong in shape. The glossary says higher qualities are "more rare when crafting".
No weights are published. Every quality-reroll valuation in the project inherits
this.

**A quality reroll may be able to return the tier it replaced.** Stat and Trait
rerolls are explicitly guaranteed to return something different; Quality carries
no such promise. `tierOptions` excludes the current tier, which may be wrong.

**Trait rerolls may have four options, not five.** `ALL_TRAITS` in `lib/reroll.ts`
includes `"none"`, so the model lets a reroll land on no trait at all. The
glossary names five traits and no null state. If every emblem always carries a
trait, rerolling one is a choice among the other four and this systematically
undervalues trait rerolls.

**Tier boundary handling.** What an increase does to a tier V, or a decrease to a
tier I, is not stated anywhere. The project assumes both are refused.

**The complete reroll operation catalogue.** Captured screens prove examples —
"Reroll Quality for Red Emblems", "Reroll Trait for the Last Blue Emblem" — but
nothing establishes the full stat/quality/trait × all/first/last/random product
this project enumerates. Community guides publish an asymmetric list, which is
not a source.

**Wildcard semantics.** "Randomly increase one Quality", "increase two and reduce
one" appear in community material only. Whether the outcome resolves before or
after you apply it is unknown, and the project assumes before.

**Prefix × Suffix stacking.** Both are percentages. Whether two active titles add
or multiply is not stated.

**Stat definitions the glossary leaves vague.** Wisdom runes: it says "bottled or
taken" and never mentions Wisdom, so our exclusion is a measured property of
`rune_pickups`, not a rule. Teamfight participation: only a 2,124 maximum is
published, no formula — ours is reconstructed and reproduces the field in 95.8%
of player-games, with the remaining 4.2% unexplained. Tormentor: "per Tormentor
kill" with no crediting rule. Madstones: "per Madstone collected", with no
statement about bundles, which is the whole basis of the ×2.7 correction.

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
order is not a value order and nothing says so.

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
- **Weight recent events above older ones** inside the training window. The
  pooling in `build-training.mjs` treats a match from eight months ago the same
  as one from last week.
- **Add madstones to the persistence table's calibration.** It is the least
  reliable red stat measured and the most assumed in extraction; those two facts
  have never been looked at together.

## Performance

`/information` is ~2.75 MB, down from 5.23 MB once the per-entry fields moved out
of the per-stat rows. Still ~98% serialised props. Sending only the selected
league and fetching the rest on demand is the remaining fix and is worth roughly
another 2 MB.

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
  is serialised once. No saving available there.
- **Averaging a pair does not halve it against a Mid.** It puts both on the same
  per-player scale — Core sits at 1.41× Mid. A prior suspicion that averaging
  biased the reroll search toward Mid was wrong, and backwards.
