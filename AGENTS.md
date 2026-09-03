<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BengTiPredictor — working notes for agents

A fantasy calculator and bracket predictor for The International, built on
OpenDota match data. Next.js app in `app/` + `components/`, pure maths in
`lib/`, data pipeline in `scripts/`.

## Read these before changing anything

| File | Why you need it |
| --- | --- |
| **ASSUMPTIONS.md** | Every scoring rule and where it came from, split into *verified* and *assumed*, plus a Retracted list of things this project got wrong. **Read it before asserting what any stat counts.** |
| **COMMANDS.md** | Every command and flag. Don't re-derive the CLI from the source. |
| **THOUGHTS.md** | What is still open, and the reasoning behind calls that were close. Check here before "discovering" a known trade-off. |
| **README.md** | What the project is and its limitations. |

Keep them accurate when you change behaviour. A stale doc here is worse than no
doc: `STAT_DEFINITIONS` in `lib/scoring.ts` once shipped describing behaviour a
parallel branch had already replaced.

## Data in `data/generated/` is build output — never hand-edit it

It is committed, so it shows up in diffs and looks editable. It is not. Change
the extractor and regenerate:

```bash
npm run fetch -- <leagueId> [--training]   # one league
npm run train -- 19719                     # rebuild the pre-event sample after
npm run validate                           # the gate
```

The `--training` flag is not cosmetic: training leagues fit the model, the
target event is graded. Getting the split wrong leaks the answer into the fit.
`data/generated/index.json` records which is which — match it when regenerating.

## What `lib/data.ts` hands you is shared — treat it as read-only

`loadLeague`, `listLeagues`, `loadTraining` and `loadReliability` memoise the
parsed JSON, keyed on each file's mtime and size. Two calls for the same league
return **the same object**, not a copy. Sorting `league.teams` in place, or
pushing onto `league.results`, therefore corrupts it for every later caller in
that process. Copy first — `[...league.teams].sort(...)` — as the existing call
sites do.

`/information` memoises its whole render on top of that, since building it costs
seconds and `next dev` re-renders per request. Both caches key on the state of
`data/generated/`, so `npm run fetch` still shows up without a restart.

## You almost never need the network

`data/cache/` holds every raw match (~680 MB, ~2,540 matches, gitignored). Only
league metadata and the pro registry are fetched live, so a full regeneration of
all 22 leagues runs offline in minutes. Do **not** add `--refresh` — it discards
the cache and re-fetches everything.

## `npm run validate` is the gate

37 checks across five Internationals, plus a cross-check against an independent
community table (currently **35 of 38** values within 45%). It exits non-zero on
failure. Run it after any change to `lib/` or `scripts/`, and treat a drop in
that 33 as a regression to explain, not a number to update.

`npm run build` must also pass; both compile `lib/` first, so type errors fail
fast.

## Predictions are shrunk; the record is not

`lib/reliability.ts` pulls each stat toward the field average by however far it
has been measured NOT to repeat (`npm run persistence`, weights in
`data/generated/reliability.json`). It is applied to the predictor only — the
fantasy ranking, and the training entries in simulate/study/validate — never to
the truth a prediction is graded against, and never to `/information`, which
reports what happened. If you add a new prediction path, shrink its input; if
you add a new descriptive view, do not.

## The evidence bar

This project's norm is *verified field by field against OpenDota and STRATZ on
the same matches*, and every claim lands in ASSUMPTIONS.md as measured or
assumed. Match it. Three fields read the opposite of the obvious guess — wards
are **placed** not bought, stacks are **camps** not creeps, smokes are **used**
not purchased — and each was a bug here at some point.

If you cannot verify something, put it on the assumed list and say what it
affects. Growing that list is a correct outcome; quietly guessing is not.

## Conventions

- **Commits** carry prose bodies with the numbers and the evidence behind the
  change. Read `git log` for the register before writing one.
- `lib/` has no React dependency — keep it that way; it is compiled and tested
  standalone.
- `.env.local` holds `STRATZ_TOKEN`. Gitignored. Never commit it or echo it.
- The Next.js block above is rewritten by `next dev`; it only replaces text
  between its own markers, so anything outside them is safe.
