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
npm run discover-sources -- --target 19543 --observed-proxy --cutoff 1776495600 --days 365 --write
npm run discover-sources -- --target 19719 --config path/to/pre-lock-manifest.json --days 365 --write
npm run prepare-sources -- --target 19543 --config prelock-19543-groupstage.draft.json --identity-report docs/reports/roster-identity-19543.json --selection docs/reports/source-selection-19543.json --discovery-report data/audits/source-events-19543-prelock.json
npm run prepare-sources -- --target NEXT_ID --config path/to/pre-lock.json --identity-report path/to/identity-audit.json --selection path/to/source-selection.json --days 365
npm run recover-sources -- --target 19543 --config prelock-19543-groupstage.draft.json --selection docs/reports/source-selection-19543.json --dry-run
npm run recover-sources -- --target 19543 --config prelock-19543-groupstage.draft.json --selection docs/reports/source-selection-19543.json --raw-only
npm run recover-sources -- --target 19543 --config prelock-19543-groupstage.draft.json --selection docs/reports/source-selection-19543.json
npm run fetch -- 19785 --training
npm run fetch -- 19719
npm run fetch -- 20279 --research-target
npm run fetch -- 19719 --offline
npm run prepare-ti -- 19719 --acquire-manifests
npm run prepare-ti -- 19719 --recover
npm run audit-data -- 19719
npm run audit-data -- 19719 --json
npm run audit-data -- 19719 --write
node scripts/audit-player-coverage.mjs prelock-19543-groupstage.draft.json --discovery data/audits/source-events-19543-prelock.json --selection docs/reports/source-selection-19543.json
npm run train -- 19719 --config path/to/pre-lock-manifest.json
npm run prepare-ti -- 19719 --config path/to/pre-lock-manifest.json
```

`discover --target` uses the target's team IDs and searches before its first
match. It still needs an existing roster/league and fetches Tier 1/2 events;
player transfers to unrelated teams are not fully discovered automatically.
`discover-sources` instead searches OpenDota's match database by the target
players' account IDs, including their previous teams. The `--config` form uses
an explicit pre-lock manifest. `--observed-proxy` uses post-event player IDs
only for a diagnostic and requires an explicit Unix cutoff. `--days` defaults
to 365; `--write` saves a local report in `data/audits/`. It fetches no match
data and does not certify the roster, league tier, source coverage or model.
It inventories Group-stage sources; completed Group matches for a Playoff
update need the separate stage-specific preparation path.
`prepare-sources` checks the dated roster, five distinct positions per team,
unique account IDs and a separate pre-cutoff identity audit. It runs the existing
`discover-sources` command unless a previously verified discovery report is
supplied. Its classification file must cover every discovered league; only
reviewed international main events receive match-manifest requests. Qualifiers
stay separate and other leagues remain documented. `--limit N` caps new requests
per run; re-running skips valid cached manifests. OpenDota requests use the
shared 1.1-second limiter and 429/daily-quota handling, below the [upstream
free-tier 60/minute and 3,000/day settings](https://github.com/odota/core/blob/master/config.ts). Each event is atomically
checkpointed in `data/cache/leagues/ID.json` and progress is written to
`data/audits/prepare-sources-ID.json`. Exit 2 means a missing manifest or
unreviewed source. The report counts cached raw/replay files by existence only;
its exact audit status is separate. This command does not fetch raw matches or
replays, alter `data/generated/`, or train a model. For S8, the supplied cached
discovery report carries the account-set and cutoff-boundary reconciliation
documented in `docs/PRELOCK_19543.md` after live Explorer queries returned 522.
`recover-sources` requires that completed manifest report. Its dry run counts
valid raw and replay checkpoints before any large transfer. The raw phase uses
`fetch --training --source-recovery --league-name NAME`: it reuses the cached
manifest, skips today's registry/Elo/roster calls, and requests only missing or
invalid raw matches through the shared OpenDota limiter. `--training` records a
source in the generated index; it does **not** fit a model. The replay phase
calls the existing `replays` batch; those downloads use Valve replay URLs, not
OpenDota API calls. The exact `audit-data --write` gate runs per source, and
already passing sources are skipped. If required raw fields alone cap possible
coverage below 90%, replay downloads for that source are skipped and the error
is reported. `--raw-only`, `--league-limit N` and `--replay-limit N` allow small
checkpoint runs. Reports and stage logs live in `data/audits/recover-source-ID.*`
and `data/audits/recover-sources-TARGET.json`; reruns reuse atomically saved
match and replay files. No model training or history-window choice occurs.
Without `--target`, legacy discovery tracks every previously loaded team name.
Other discovery flags: `--tier premium|professional|both`, `--min-matches N`,
`--all` (allow events without tracked teams when fetching).

`fetch` produces legacy descriptive aggregates. `--training` preserves the
index's source/target distinction; `--min-games N` defaults to 2. Primary training
reads raw complete matches instead of these filtered/rounded aggregates.
`--research-target` writes a generated league file and raw cache for a held-out
event without adding it to `data/generated/index.json`, so an ongoing rehearsal
does not become the public website's default tournament. It cannot be combined
with `--training`. Its roster/role aggregates contain event results and must
not serve as a pre-event manifest or model input. Research mode also omits
current pro-registry names, team Elo and current-roster API calls; those are
not historical pre-event evidence.
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
`audit-player-coverage` reads cached raw and replay files before the manifest's
cutoff and writes `data/audits/player-coverage-ID.json`. It separates exact maps
in passing selected events, exact maps in ungated selected events, missing
replays, other incomplete selected maps, and exact maps outside the selection;
it also lists prior team IDs, 30–365-day exact-map counts and the effective
sample size of the 180-day/60-day-half-life candidate. It cannot infer player participation in uncached
raw maps. `--discovery` and `--selection` add account-linked leagues outside
the selected sources with their reviewed bank; these are participation leads,
not certified exact sample counts.

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
