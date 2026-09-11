# Commands

Run from the repository root. Java 17, Maven, curl, bunzip2 and zstd are required
for replay parsing. Node dependencies: `npm install`.

## Website and checks

```bash
npm run dev
npm test                      # deterministic mechanics/data/chronology tests
npm run validate              # existing legacy regression and community checks
npm run build                 # static export into out/
GITHUB_PAGES=true npm run build
```

`npm run start` requires a server build and is not the static-export preview.
Serve `out/` with any static HTTP server. Stop a foreground server with Ctrl+C.

## Acquisition and strict data preparation

```bash
npm run leagues -- international
npm run discover -- --target 19719 --months 12
npm run discover -- --target 19719 --months 12 --fetch
npm run fetch -- 19785 --training
npm run fetch -- 19719
npm run fetch -- 19719 --offline
npm run prepare-ti -- 19719 --acquire-manifests
npm run prepare-ti -- 19719 --recover
npm run audit-data -- 19719
npm run audit-data -- 19719 --json
npm run audit-data -- 19719 --write
npm run train -- 19719 --config path/to/pre-lock-manifest.json
npm run prepare-ti -- 19719 --config path/to/pre-lock-manifest.json
```

`discover --target` uses the target's team IDs and searches before its first
match. It still needs an existing roster/league and fetches Tier 1/2 events;
player transfers to unrelated teams are not fully discovered automatically.
Without `--target`, legacy discovery tracks every previously loaded team name.
Other discovery flags: `--tier premium|professional|both`, `--min-matches N`,
`--all` (allow events without tracked teams when fetching).

`fetch` produces legacy descriptive aggregates. `--training` preserves the
index's source/target distinction; `--min-games N` defaults to 2. Primary training
reads raw complete matches instead of these filtered/rounded aggregates.
Do not use `--refresh` for normal recovery: it bypasses completed caches.

`prepare-ti` without a config audits all already selected training events that
start before the target, plus the target. `--acquire-manifests` retrieves the
complete API match lists, establishing the coverage denominator. `--recover`
retrieves missing raw matches and reuses the resumable replay batch. Failures
are audited; a failed match does not discard completed work in other leagues.
This is preparation, not an automatic final tournament-model build.

`audit-data` exits 0 on data-gate pass and 2 on failure. `--write` writes detailed
JSON to `data/audits/league-ID.json`. Missing, impossible, duplicate, uncertain
roster/role, stage, patch, source and distribution diagnostics are included.
A data pass does not certify a predictive model or the target roster.

`train` requires the [pre-lock configuration](docs/EXACT_PIPELINE.md). It rejects
incomplete source coverage, post-lock matches, unconfirmed roster evidence and
players with fewer than 20 exact historical maps. It writes complete normalized
banks to `data/normalized/`, not a public forecast. There is no approximate or
reduced-column fallback. The old `--weighted` frequency-copying mode is removed.
Playoffs use a separate config with a later cutoff and may include completed
Group matches from the target league. Target Playoff rows are always excluded.

## Replay checkpoints

```bash
npm run import-replays -- /path/to/Calculator-for-DOTA2-TI-Fantasy
npm run replay -- 8892829232
npm run replays -- 19890 --limit 2
npm run replays -- 19890
```

Import checks the match, all ten accounts, slots/heroes where supplied, and all
five required replay counters against cached OpenDota identities. It atomically
writes `data/cache/replay-fantasy/matches/ID.json` with provenance. The local
parser now also extracts Teamfight and validates the replay's internal match ID.
Absent properties remain null and fail the checkpoint; they never become zero.
Old `data/cache/replay-stats/` files cannot establish complete exactness.

Batches use three workers, reuse validated checkpoints, and exit 2 until every
listed replay is available. That stricter acquisition completion status is
separate from the audit's 90% statistical data gate. `--refresh` reparses a
checkpoint only when explicitly needed. Temporary compressed/decompressed
replays are cleaned after each attempt. Detailed failure reports are in
`data/cache/replay-fantasy/league-ID.json`.

## Statistical and policy diagnostics

```bash
npm run compare-models         # event-forward raw-stat distributions, exact rows
npm run benchmark-policy       # exact reduced-game policy regret
```

Reports are written to `docs/reports/`. `compare-models` uses the recovered
complete-row cohort and common evaluation players across candidate windows.
It is a diagnostic under event/roster conditioning, not a validated final entry
forecaster. The runner does not select or publish a winner from a short history.
It compares 30/60/90/120/180/270/365-day windows, exponential half-lives of
60/120 days and one restrained same-team variant. Exact event completion before
the target cutoff is required. No frequency duplication or random game split.

`benchmark-policy` evaluates an exact two-slot, three-quality reduced game over
all 27 starting states and 1–40 tokens. It is not an optimality certificate for
the full three-banner game. Full-game rollout remains approximate.

## Legacy research commands

```bash
npm run simulate -- --legacy --league 19719 --stage both
npm run study
npm run persistence
npm run explain -- --stat creeps --role core --stage playoffs --tier V
```

These consume existing descriptive/approximate generated datasets. They are
retained to inspect earlier claims, and must not be used as the primary exact
model or its validation. `simulate` now refuses to run without `--legacy`.
Its existing `--help` lists window, stage, run count, seed, risk, banner and
JSON flags. `study --runs N` and `validate --runs N --brute N` retain their prior
arguments. `persistence` writes the old reliability table; the new diagnostic
does not use that table to avoid cross-event fitted-parameter leakage.
