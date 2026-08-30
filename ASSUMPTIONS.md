# What is known, and what is assumed

Every rule the calculator applies, and where it came from. Anything marked
**assumed** is a guess of mine and should be treated as provisional — if it is
wrong, the numbers that depend on it are wrong.

## Verified against a source

| Rule | Source |
| --- | --- |
| Point value of all 15 extractable stats | Reference project's table, cross-checked against my own data (31 of 36 values within a few percent) |
| Tier bonuses +10 / +30 / +60 / +100 / +150% | Reference project |
| Trait effects (Fractal +60%, Benevolent +20% adjacent, Vampiric +50%/−10%, Unique +30%, Friendly +50%) | Reference project |
| Slot colours per role | Reference project, confirmed by you |
| One stat per banner, never repeated | You |
| Core and Support are same-team pairs, Mid is one player | Reference project, confirmed by you |
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
| **Every option costs one reroll** — there is no price list | You, and [Escorenews](https://escorenews.com/en/dota-2/article/71615-fantasy-guide-for-the-international-2026-compendium-best-player-picks-and-rolls-for-ti15-fantasy) ("Players get 40 rerolls") |
| Reroll scopes: stat / quality / trait × all / first / last / random of a colour | Reference project's guide |
| Compendium prediction payout scale | Reference project |
| Stage boundary, group stage format, series counts | Derived from the match data itself |
| Player names and roles | OpenDota's pro registry |
| Team strength effect on scoring (1.84% per 100 Elo) | Measured here, n=2910, t=4.05 |
| Suffix trigger rates | Measured from the matches themselves |

## Assumed — not verified anywhere

| Assumption | Where | What it affects |
| --- | --- | --- |
| **Every reroll outcome is equally likely** — a quality reroll on a tier II gives I, III, IV or V at 25% each; a trait reroll gives any of the other five at 20% each | `tierOptions`, `traitOptions` in `lib/reroll.ts` | The value of every quality and trait reroll. Searched for published odds and found none — no guide carries them. |
| Hero colour/theme groups | `HERO_GROUPS`, empty | Prefix titles — reported as unknown rather than guessed |

That is the whole list. It used to be six entries; the token costs turned out
not to exist, and the rest were replaced by rules you confirmed.

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
