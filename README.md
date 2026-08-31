# BengTiPredictor

Fantasy calculator and bracket predictor for The International, built on real
match data from OpenDota.

```bash
npm install
npm run dev      # http://localhost:3000
```

Four pages: **Fantasy** (banners, rankings, reroll simulator), **Bracket**,
**Information** (what stats are worth, and what the patch rewards), **Method**.

---

## What it does

Fetches a tournament from OpenDota, works out what every player produced, and
answers three questions:

- **Who should I pick?** Rankings per role, with a risk setting that chooses
  between a safe floor and a high ceiling.
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
| **[ASSUMPTIONS.md](ASSUMPTIONS.md)** | Every rule the calculator applies and where it came from — including the five things still assumed, and the ones I got wrong and fixed. |
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

- **Reroll odds are assumed uniform.** No source publishes the chance of landing
  on each quality or trait. It is the one assumption left in the reroll model.
- **Prefix titles cannot be valued.** They fire on the hero's colour group, and
  that classification is in no public API.
- **Two stats are unavailable** — lotuses (176 pts) and watchers (147 pts).
  OpenDota counts the interaction that grabs either one, but not which of the
  two it was, so they are marked missing rather than split on a guess. For a
  support that is a bigger blue emblem than wards, which is the largest known
  gap in the model.
- **Madstones are inferred, not counted.** OpenDota counts bundles, not stones,
  and a bundle only drops on a contested camp. The extractor corrects for that
  with a measured factor of 2.7, so the emblem is no longer understated — but
  the factor itself is an estimate, not a published number. See ASSUMPTIONS.md.
- **Roles are read from lane play, not from Valve.** The pro registry is a
  snapshot of today's roster and mislabels old events, so roles come from where
  each hero actually stood. It matches the registry wherever the registry is
  contemporaneous, but it is still inference.
- **Ratings are current, not historical.** They are graded per event and the app
  warns when they are worse than a coin flip, which happens for older events.
- **A period pays a maximum**, and a maximum is largely luck. Prior form picks
  well above average but will not rank the whole field reliably.

## Where the rules came from

Scoring, emblem colours, tiers and traits are the Compendium's own, from the
in-game rules text. Point values are cross-checked against a community-compiled
table as a standing test in `npm run validate` — 33 of 36 values agree within a
few percent. Everything else is built here from OpenDota match data.
