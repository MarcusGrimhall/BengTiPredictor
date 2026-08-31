# Open questions

Things that are not settled, written down so they are not rediscovered from
scratch. Rules that *are* settled live in ASSUMPTIONS.md; this file is only what
is still open, plus the reasoning behind the calls that were close.

Last updated 2026-08-31.

---

## The reroll advice is honest about being uncertain, and it should stay that way

The simulator now says "take any" rather than "take this one" when it cannot
separate the leaders. That is not a hedge, it is the measurement:

```
best edge over six seeds:  23071, 22118, 22439, 22883, 23285, 24176
noise:                     ±655
lead, first over second:   ~404
```

**The lead is smaller than the noise.** Six seeds produced five different
winners. Any interface that crowns one of them is claiming a precision the
search does not have.

Two ways to make the advice sharper, if it ever needs to be:

- **Spend budget until the lead clears the noise**, rather than a fixed number of
  play-outs. Stop early when the field is clearly separated, keep going when it
  is not — and when it stays flat, report that no choice matters, which is
  usually the true answer.
- **Truncate the play-out depth.** Play-outs currently run all 40 rerolls. The
  marginal value of a reroll decays fast, so 5–8 rounds plus a fitted "what are
  N rerolls worth from here" term should cost about a fifth. The bias is the
  same for every candidate, so it would not disturb the ranking — but the fitted
  term needs its own validation before it can be trusted.

## `Best possible` ignores where you already are

Both calculator buttons re-optimise stats and traits from nothing. The only
difference is tiers: **Best possible** sets them freely, **Arrange what I hold**
redistributes the ones you have.

Neither credits traits you already rolled. If you are sitting on two Friendly on
Core, the sensible next move may well be to chase a third — but the optimiser
recomputes the global ideal and may propose an entirely different trait layout,
as though traits were free to acquire. They are not; they cost rerolls.

The missing mode is "given what I hold **and** my remaining rerolls, what should
I chase?" The simulator answers that, but only for the three options currently on
the table. A third button that locks the traits already held and optimises around
them would cover the gap.

## The Information page ships the whole dataset

`/information` is ~4.6 MB and takes about 3 seconds, and **98% of the payload is
serialised props**. `spread` alone is ~1,178 rows — one per league × stage × role
× stat, each carrying every player's value — because the page sends every
tournament so tab switching is instant.

It has always been this slow; it is a deliberate trade, not a regression. Sending
only the selected league and fetching the rest on demand is the real fix.

## Two stats nobody can check

**Teamfight participation** is the one derived field of the sixteen. It is
reconstructed as `(kills + assists) / the opposing team's total deaths`, which
reproduces the field exactly in 102 of 120 player-games and in 13 more with a
numerator one assist lower — 95.8% accounted for. The remaining 4.2% is not
explained. It matters because this is the second most valuable emblem.

**Stun duration** sums per hero hit, so a three-hero two-second stun counts as
six. That OpenDota does this is known; that Valve does the same is likely, since
both read the same combat log, but it is not verified. It systematically favours
wide AoE stuns.

## Unparsed matches vanish quietly

`extractMatch` returns null when a replay is not parsed, and the match is simply
dropped. That is the right call — half the stats would be empty — but nothing
checks whether the dropped matches are a random sample. If parsing correlates
with region, tier or recency, the training set is skewed in a way no test would
catch. `matchesSkipped` is already stored per league, so this is measurable
without fetching anything.

## Things that turned out not to be problems

Written down so they are not re-investigated:

- **Missing madstones and smokes really do mean zero.** Both fields appear for
  some players and not others *within the same match* — 7 of 12 matches are
  mixed, none is missing for all ten. Absence is a player who did nothing, not a
  parse gap, so `?? 0` is correct.
- **`roshan_kills` is a trap, but we use the right field.** It sums to 45 where
  the event log has 34 Roshan kills. `killed.npc_dota_roshan` matches the log
  exactly.
- **Making `contributions` lazy is slower, not faster.** A getter on the ranked
  object costs more than the work it defers — V8 loses the object shape and
  `sort` reads `total` on every one. Tried, measured, reverted.
