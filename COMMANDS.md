# Commands

Every command, and every knob that changes an answer.

Run from the project root. Nothing here talks to the internet except
`leagues` and `fetch`.

---

## Quick reference

| Command | Does |
| --- | --- |
| `npm run dev` | Local site on http://localhost:3000 |
| `npm run build` | Production build (fully static) |
| `npm run leagues -- <term>` | Search OpenDota for a league ID |
| `npm run fetch -- <id>` | Fetch a tournament |
| `npm run fetch -- <id> --training` | Fetch an earlier event as model input only |
| `npm run train -- <id>` | Merge training events into a pre-event sample |
| `npm run simulate -- --help` | Simulate a roster (all options below) |
| `npm run study` | Backtest: what actually won fantasy at the last event |
| `npm run validate` | Grade the model against finished tournaments |

---

## Getting data

### Find a tournament

```bash
npm run leagues -- international
npm run leagues -- dreamleague
```

### Fetch it

```bash
npm run fetch -- 19719                    # The International 2026
npm run fetch -- 19719 --min-games 5      # drop players with under 5 games
npm run fetch -- 19719 --refresh          # ignore the local cache
npm run fetch -- 19269 --training         # model input only, never shown as "the tournament"
```

Raw match responses are cached in `data/cache/` (gitignored), so re-running is
free and instant. Set `OPENDOTA_API_KEY` to raise the rate limit; the client
speeds up on its own.

### Build the pre-event training sample

```bash
npm run train -- 19719
```

Merges every `--training` event into `data/generated/training-19719.json`,
refusing any whose last match runs into the target. Roster and roles come from
the target event, every stat line from before it.

---

## Simulating a roster

```bash
npm run simulate -- --help
```

### Data options

| Flag | Default | Does |
| --- | --- | --- |
| `--league <id>` | newest non-training | Which tournament to project |
| `--stage <name>` | `playoffs` | `groupStage` or `playoffs` |
| `--source <name>` | `training` | `training` = fit on earlier events; `event` = fit on the target's own games (in-sample, for comparison only) |
| `--since <date>` | — | Ignore training events starting before `YYYY-MM-DD` |
| `--lookback <N>` | — | Ignore training events older than N days before the target. Overrides `--since` |
| `--min-games <N>` | `4` | Drop entries with fewer games |

### Model options

| Flag | Default | Does |
| --- | --- | --- |
| `--risk <0-100>` | `50` | 0 = floor, 50 = typical, 100 = ceiling |
| `--runs <N>` | `20000` | Monte Carlo runs |
| `--chances <N>` | `1` | You get N attempts and only the best counts |
| `--role <name>` | `all` | `core`, `mid`, `support` or `all` |
| `--banner <mode>` | `optimise` | `optimise` for the best banner at this risk, `default` for a fixed one |
| `--seed <text>` | `sim` | Change it to get a different draw |

### Output options

| Flag | Does |
| --- | --- |
| `--top <N>` | How many entries to list (default 8) |
| `--compare-risk` | Sweep risk 0–100 and show how the model's pick changes |
| `--json` | Machine-readable output |

### Examples

```bash
# Five shots, only the best counts
npm run simulate -- --chances 5

# Does risk appetite change who you should pick?
npm run simulate -- --compare-risk --chances 5 --source event

# Only the last four months of form
npm run simulate -- --lookback 120

# Group stage, cores only, tighter estimate
npm run simulate -- --stage groupStage --role core --runs 100000

# Feed it to something else
npm run simulate -- --chances 5 --json > out.json
```

### Reading the output

| Column | Means |
| --- | --- |
| `avg` | Mean tournament total over the runs |
| `p10` / `p90` | 10th and 90th percentile of that total |
| `best of N` | Expected best result across N attempts |
| `lift` | `best of N` minus `avg` — what the extra chances buy |

Two sources of randomness are simulated: how many series the team plays (drawn
from the bracket simulation, not fixed at its average) and how the entry scores
in each (resampled from its own observed matches, so the tail keeps its shape).

---

## What actually wins

```bash
npm run study
```

A backtest, not a fit. Everything on the left of each comparison is decided from
data that existed **before** the event; everything on the right is what happened.
Nothing here tunes a parameter — the point is that the reasoning transfers to the
next event rather than to this one.

Six sections:

1. **Banner vs entry** — how much the emblems matter against picking the right duo
2. **Stats** — which paid at the event, and whether the pre-event data knew
3. **Traits** — what each is worth on a real banner, in every slot
4. **Tiers** — what a quality upgrade actually buys
5. **Suffixes** — trigger rates graded on what happened
6. **Risk** — what the model's pick at each risk level actually banked

---

## Checking the model

```bash
npm run validate
```

Grades the model against every finished tournament in `data/generated/`,
out of sample wherever possible and always against a baseline. Exits non-zero
if a check that should hold fails.

It runs nine groups of checks:

1. **Reroll planner** — the optimal-stopping formula against brute force
2. **Rating quality** — are the Elo ratings better than a coin flip for *this* event
3. **Map projection** — versus what was actually played, versus assuming the average
4. **Within-event** — group stage form predicting playoff scoring
5. **Pre-event** — fitted only on earlier tournaments, graded on the event
6. **Stage split** — how much using the wrong stage's numbers changes the board
7. **Risk calibration** — does the 95th percentile get cleared 5% of the time
8. **Invariants** — pairs, uniqueness, sorting, series collapsing
9. **Cross-check** — emblem values against an independently published table

---

## Typical workflows

### Add a new tournament and project it

```bash
npm run leagues -- "the international"
npm run fetch -- <id>
npm run train -- <id>          # if training events are already fetched
npm run simulate -- --league <id>
npm run validate
```

### Extend the training data

```bash
npm run leagues -- dreamleague
npm run fetch -- <id> --training
npm run train -- 19719         # rebuild the merged sample
npm run validate               # confirm it still holds up
```

### After changing anything in `lib/`

```bash
npm run validate && npm run build
```

Both compile `lib/` first, so a type error fails fast.
