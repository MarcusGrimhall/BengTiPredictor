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
| A series is the **sum** of its two best games | You, from a worked example |
| Group stage 3 emblems / 40 tokens, playoffs 5 / 30 | You |
| Tokens are one shared pool across all three banners | You |
| Three random options per deal, ~40 deals | You |
| The same option cannot be offered twice in a row | You |
| Skip is always available and free | You |
| A quality change lands on a **random** available tier, not ±1 | You |
| A tier V cannot be raised, a tier I cannot be lowered | You |
| Reroll scopes: stat / quality / trait × all / first / last / random of a colour | Reference project's guide |
| Compendium prediction payout scale | Reference project |
| Stage boundary, group stage format, series counts | Derived from the match data itself |
| Player names and roles | OpenDota's pro registry |
| Team strength effect on scoring (1.84% per 100 Elo) | Measured here, n=2910, t=4.05 |
| Suffix trigger rates | Measured from the matches themselves |

## Assumed — not verified anywhere

| Assumption | Where | What it affects |
| --- | --- | --- |
| **Token cost per action** (1 for random, 2 first/last, 4 all, 3–4 wildcards) | `ACTION_COSTS` in `lib/reroll.ts` | Which offers are affordable, and how many deals a budget buys |
| **Tier roll distribution** (40/28/18/10/4% for I–V) | `TIER_WEIGHTS` | The value of any quality reroll |
| **Trait roll distribution** (40% none, 12% each) | `TRAIT_WEIGHTS` | The value of any trait reroll |
| **A reroll costs one token**, so deals ≈ tokens | Default for "deals left" | How high the bar is for taking an offer |
| **Quality raises take the lowest tiers, reductions the highest** | `applyAction` | The two wildcards on an uneven banner |
| Hero colour/theme groups | `HERO_GROUPS`, empty | Prefix titles — reported as unknown rather than guessed |

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
