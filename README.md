# BengTiPredictor

Fantasy calculator and bracket predictor for The International, built on real
match data from OpenDota.

```bash
npm install
npm run dev      # http://localhost:3000
```

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds a static export and
publishes it on every push to `main`. Enable **GitHub Actions** under
**Settings → Pages → Build and deployment** in the repository. The site will be
available at `https://marcusgrimhall.github.io/BengTiPredictor/`.

Four pages: **Fantasy** (banners, rankings, reroll simulator), **Bracket**,
**Information** (what stats are worth, and what the patch rewards), **Method**.

---

## What it does

Fetches a tournament from OpenDota, works out what every player produced, and
answers three questions:

- **Who should I pick?** Honest pre-event rankings per role, with a risk setting
  that chooses between a safe floor and a high ceiling. The Fantasy page never
  trains on the tournament it is predicting.
- **What should I reroll?** Given the three options the game just dealt you,
  which — if any — is worth one of your forty rerolls.
- **How will the bracket go?** Simulated from team ratings, with expected
  Compendium points for your picks.

Everything heavy runs at build time or from the command line. The site itself
does arithmetic, not simulation.

## What makes the numbers trustworthy

The model is fitted **only on tournaments played before** the event it predicts,
then graded on that event. Nothing about the target leaks back into the fit.

`npm run validate` runs that grading as a standing test — 37 checks across five
Internationals, always against a baseline, exiting non-zero if one fails.

The two rules that matter most, and that took a few tries to get right:

- A **series** scores as the sum of its two best games.
- A **period** pays only your **single best series**. Playing four series is four
  attempts at one number, not four numbers banked.

A perfect-hindsight group stage roster comes to 126,731 under those rules; the
real world best at TI 2026 was 106,966. That is the right relationship.

## Documentation

| File | What is in it |
| --- | --- |
| **[COMMANDS.md](COMMANDS.md)** | Every command. Starting and stopping the site, fetching data, training the model, and each flag grouped by what it decides. |
| **[ASSUMPTIONS.md](ASSUMPTIONS.md)** | Every rule the calculator applies and where it came from — including the six things still assumed, and the ones I got wrong and fixed. |
| `/method` in the app | The same, in the browser. |

## Layout

```
scripts/     data pipeline and command-line tools
lib/         the maths — pure functions, no React
components/  client components
app/         routes and one CSS file
data/
  generated/ committed, read at build time
  cache/     gitignored raw API responses
```

`lib/` has no React dependency, so it is tested standalone.

## Limitations

- **Quality odds are measured, trait odds are assumed uniform.** Quality uses
  tier weights 5:4:3:2:1, fitted from 195 client rolls (163 informative), then
  renormalised after removing the tier already held. Valve publishes only that
  higher qualities are rarer, not the exact weights. Fresh emblem qualities are
  separately assumed uniform 1:1:1:1:1. Trait odds remain unknown and are
  modelled uniformly over the five real traits (or the other four on a reroll).
- **Prefix titles cannot be valued.** They fire on the hero's colour group, and
  that classification is not yet imported into this project.
- **Five stats prefer replay counters.** Exact overlays are currently imported
  for TI 2026, EWC 2026 and 1win Essence II: Teamfight, Madstones, Watchers,
  Lotuses and Tormentor participation. Older events use documented OpenDota
  fallbacks; Watchers and Lotuses use ratios calibrated on all 3,630 exact
  player-games rather than being silently zero.
- **Roles are read from lane play, not from Valve.** The pro registry is a
  snapshot of today's roster and mislabels old events, so roles come from where
  each hero actually stood. It matches the registry wherever the registry is
  contemporaneous, but it is still inference.
- **Stats are trusted as far as they repeat.** Measured over five
  Internationals, a support's wards predict the next event at 0.95 and their
  Tormentor at 0.00. Unreliable stats are pulled toward the field average, so a
  duo that topped a fluky stat is not ranked as though they will do it again.
  Run `npm run persistence` to see the table. It is measured within events,
  which overstates how far a stat carries between them, so the correction is
  deliberately on the small side.
- **Ratings are current, not historical.** They are graded per event and the app
  warns when they are worse than a coin flip, which happens for older events.
- **A period pays a maximum**, and a maximum is largely luck. Prior form picks
  well above average but will not rank the whole field reliably.
- **Playoff team risk belongs to the user.** Every entry is scored with the same
  4.25-series top-four path. The calculator ranks fantasy production; it does
  not replace the user's view of which team advances with Elo.
- **Recency weighting is recorded but not enabled.** A 180-day window with a
  60-day half-life regressed on TI 2026. It remains experimental through
  `npm run train -- <id> --weighted` until older pre-event sets can calibrate it.

## Where the rules came from

Scoring, emblem colours, tiers and traits are the Compendium's own, from the
in-game rules text. Point values are cross-checked against a community-compiled
table as a standing test in `npm run validate` — currently 33 of 38 values are
within 45%, with three known Tormentor-definition disagreements. Everything
else is built here from OpenDota match data.
