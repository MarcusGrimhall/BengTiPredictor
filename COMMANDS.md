# Commands

Everything you can run, and every knob that changes an answer.

Run from the project root.

---

## Starting and stopping the site

```bash
npm install          # once, or after pulling changes
npm run dev          # start it — http://localhost:3000
```

Leave that terminal open; the site runs until you stop it.

**To stop:** press `Ctrl+C` in that terminal.

**If you started it in the background** and the terminal is gone:

```bash
# see whether it is running
lsof -i :3000

# stop it
pkill -f next-server
```

**To run it in the background** so the terminal is free:

```bash
nohup npm run dev > dev.log 2>&1 &
tail -f dev.log        # watch it start, Ctrl+C to stop watching
pkill -f next-server   # stop the server
```

**To check it is up:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

`200` means it is serving.

### The pages

| Page | What it is |
| --- | --- |
| http://localhost:3000 | Overview and the tournaments loaded |
| http://localhost:3000/fantasy | Banner builder, rankings, reroll simulator |
| http://localhost:3000/bracket | Bracket predictor |
| http://localhost:3000/information | Stat spreads, recent pro play, emblem mechanics |
| http://localhost:3000/method | How the numbers are made |

### Production build

```bash
npm run build        # builds; every page is prerendered static
npm run start        # serve the built site
```

---

## Training the fantasy model

Training means: **fit on professional matches played before an event, then see
how the picks would have done at it.** Nothing that touches the target event
feeds back into the model — that is the whole point.

### The three steps

```bash
# 0. See which tournaments you are missing
npm run discover

# 1. Fetch the tournaments to train ON (repeat per event, or use --fetch above)
npm run fetch -- 19269 --training

# 2. Fetch the event to predict
npm run fetch -- 19719

# 3. Merge the training events into one pre-event sample
npm run train -- 19719
```

`--training` events never appear in the app as "the tournament" — they exist to
fit the model. Step 3 refuses any training event whose last match runs into the
target, so the split cannot leak by accident.

### Then run it

```bash
npm run simulate -- --stage both --months 4
```

That reads: *train on the last four months of professional matches, and show me
both the group stage and the playoffs.*

### Every option

**Which data to train on**

| Flag | Default | Does |
| --- | --- | --- |
| `--months <N>` | all of it | Only train on the last N months of pro matches before the event |
| `--lookback <N>` | — | Same, in days. Overrides `--months` |
| `--since <date>` | — | Only train on events starting after `YYYY-MM-DD` |
| `--source training` | ✓ default | Fit on earlier tournaments — the honest setting |
| `--source event` | — | Fit on the target event's own games. In-sample, for comparison only — it will look far better than it is |
| `--league <id>` | newest | Which event to predict |
| `--min-games <N>` | `4` | Drop entries with fewer games |

**Which stage**

| Flag | Does |
| --- | --- |
| `--stage both` | Group stage and playoffs, one after the other (default) |
| `--stage groupStage` | Group stage only — 3 emblems, 40 rerolls |
| `--stage playoffs` | Playoffs only — 5 emblems, 30 rerolls |

The two are genuinely separate: different emblem counts, different eligible
players, different series counts, and no shared games.

**How much to simulate**

| Flag | Default | Does |
| --- | --- | --- |
| `--runs <N>` | `20000` | Simulated periods per entry |
| `--chances <N>` | `1` | You get N attempts and only the best counts |
| `--seed <text>` | `sim` | Change it for a different draw |

**What to show**

| Flag | Does |
| --- | --- |
| `--role core\|mid\|support\|all` | Which role (default all) |
| `--risk 0-100` | 0 floor, 50 typical, 100 ceiling (default 50) |
| `--banner optimise\|default` | Optimise the banner, or use a fixed one |
| `--top <N>` | How many entries to list (default 8) |
| `--compare-risk` | Sweep risk 0–100 and show how the pick changes |
| `--json` | Machine-readable output |

### Worked examples

```bash
# The default: both stages, all history
npm run simulate

# Only the last four months of pro play — tracks the current patch
npm run simulate -- --months 4

# Group stage only, cores, tighter estimate
npm run simulate -- --stage groupStage --role core --runs 100000

# Five shots and only the best counts
npm run simulate -- --chances 5

# Does risk appetite change who to pick?
npm run simulate -- --compare-risk --chances 5

# How much does the training window matter?
npm run simulate -- --months 3  --role core --top 3
npm run simulate -- --months 12 --role core --top 3

# Feed it to something else
npm run simulate -- --json > out.json
```

### Reading the output

| Column | Means |
| --- | --- |
| `avg` | Mean period score over the runs |
| `p10` / `p90` | 10th and 90th percentile of that |
| `best of N` | Expected best result across N attempts |
| `lift` | `best of N` minus `avg` — what extra chances buy |

A period pays an entry's **best single series**, so more series is more attempts
at one number rather than a bigger total. Both sources of randomness are drawn
rather than averaged: how many series the team plays, and how the entry scores
in each.

---

## Getting data

### Keeping up to date

Run this whenever you want to know what you are missing. It walks OpenDota's
pro-match feed backwards, groups by tournament, and compares that against what
is already in `data/generated/`.

```bash
npm run discover                     # last 2 months, tier 1 + 2
npm run discover -- --months 6       # look further back
npm run discover -- --tier premium   # tier 1 only
npm run discover -- --fetch          # fetch every relevant new event
npm run discover -- --fetch --all    # take everything, not only tracked teams
```

The column that matters is **tracked** — how many of that event's matches had a
team you already follow in them. Pro Dota runs hundreds of regional events a
year and almost none contain a TI roster, so raw match count is a bad signal
and tracked-team count is a good one. Events with zero are listed separately
and skipped by `--fetch` unless you pass `--all`.

Rows marked `[after cutoff]` overlap or follow the event the site is currently
showing. Fetch them anyway: `npm run train` excludes them automatically, and
they become training data the moment you point the site at a newer tournament.

After fetching, rebuild:

```bash
npm run train -- 19719
npm run build
```

### By hand

```bash
npm run leagues -- international     # search for a league ID
npm run leagues -- dreamleague

npm run fetch -- 19719               # fetch a tournament
npm run fetch -- 19719 --min-games 5 # drop players with under 5 games
npm run fetch -- 19719 --refresh     # ignore the local cache
npm run fetch -- 19269 --training    # model input only
```

Raw responses are cached in `data/cache/` (gitignored), so re-running is free and
instant. Set `OPENDOTA_API_KEY` to raise the rate limit; the client speeds up on
its own.

---

## Checking a number by hand

```bash
npm run explain -- --stat creeps --role core --stage playoffs --tier V
```

Prints every step from the raw match files to the figure on the page: the point
scale, the tier multiplier, how the two players in a slot combine, which games in
a series count, and how series become a period score.

| Flag | Default |
| --- | --- |
| `--league <id>` | newest |
| `--stat <key>` | `creeps` |
| `--role <name>` | `core` |
| `--stage <name>` | `playoffs` |
| `--tier <I-V>` | `III` |

---

## What actually wins

```bash
npm run study
npm run study -- --runs 100000
```

A backtest, not a fit. Everything on the left of each comparison is decided from
data that existed before the event; everything on the right is what happened.

---

## Checking the model

```bash
npm run validate                              # defaults
npm run validate -- --runs 100000             # tighter
npm run validate -- --runs 2000 --brute 5000  # fast pass while iterating
```

Grades the model against every finished tournament, out of sample wherever
possible and always against a baseline. Exits non-zero if a check fails.

---

## What runs where

**The site does not simulate.** Everything heavy happens at build time or in a
command, and the pages read the answer.

| Where | What it does |
| --- | --- |
| Reroll comparison | Enumerates every outcome exactly — 24 of 26 options |
| Reroll wildcards | Sampled; they pick emblems at random |
| Bracket picks | Counted against a build-time ensemble, ~6ms |
| Map and series projections | Computed at build time |

---

## Typical workflows

### Add a tournament and predict it

```bash
npm run leagues -- "the international"
npm run fetch -- <id>
npm run train -- <id>
npm run simulate -- --league <id> --stage both
npm run validate
```

### Retrain on a narrower window

```bash
npm run simulate -- --months 4 --stage both
```

### After changing anything in `lib/`

```bash
npm run validate && npm run build
```

Both compile `lib/` first, so a type error fails fast.
