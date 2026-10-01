# Exact pipeline and next-TI workflow

The implemented boundary is raw acquisition → exact normalized facts →
chronological research. A production tournament-scenario model, scalable
near-optimal reroll policy and public predictive artifact remain unfinished.

## Data contract

`scripts/exact-data.mjs` joins raw OpenDota matches to validated replay counters
by match ID and ten account IDs. Slots and heroes are checked where the overlay
supplies them. Local Clarity additionally reads the replay's own match ID.
Missing replay properties serialize as null, never a synthetic zero. Imports
and local parser checkpoints share the same five-field validator. SHA-256 input
fingerprints accompany normalized facts; writes use temporary files and rename.

OpenDota supplies the other adopted counters. A sparse `killed` or `item_uses`
dictionary can encode zero for an absent key only when the dictionary itself
exists and all players have parsed data. A missing dictionary is missing data.
The 18-stat vector is complete in every retained player-game. One incomplete
player excludes the whole match, preserving teammate/opponent alignment.

The exact-data gate is separate from the existing legacy regression suite:

- At least 90% exact matches in **each selected source event**; this threshold
  cannot be lowered by a CLI flag, and stat columns cannot be dropped.
- Coverage uses acquired league manifests, including matches omitted from
  generated summaries. Cached legacy counts alone cannot certify coverage.
- Team/stage/patch/week gaps are reported. A one-sided binomial test against
  10% missingness, Bonferroni-adjusted to a 1% family error rate, flags strongly
  concentrated missingness. Passing does not prove missing-at-random.
- At least 20 exact historical maps per target player. This is a provisional
  adequacy floor; uncertainty and required sample size still need calibration.
- Roles/rosters and cutoff must be explicitly supplied with pre-lock evidence.
  Lane inference and today's pro registry cannot establish that evidence.
- A map must finish strictly before lock. Playoffs may include completed Group
  maps from the same target league, but never its Playoff maps.

The audit records impossible negative counters (replay Stuns are allowed to be negative), duplicate identities, malformed series,
missing timestamps, source usage, all-zero fields and large weekly distribution
changes. Weekly changes are diagnostics: changing roster/patch composition can
explain them, and the tool does not silently rescale them.

## Preparation manifest

Supply JSON like the following, with **all five players for every target team**:

```json
{
  "targetLeagueId": 19719,
  "targetLeagueName": "The International",
  "stage": "groupStage",
  "cutoff": 1786590000,
  "rosterKnownAt": 1786500000,
  "rosterSource": "URL or local record of the announced pre-lock roster",
  "sourceLeagueIds": [19785, 20009],
  "roster": [
    {"accountId": 1, "name": "Carry", "teamId": 10, "teamName": "Example", "role": "core"},
    {"accountId": 2, "name": "Offlane", "teamId": 10, "teamName": "Example", "role": "core"},
    {"accountId": 3, "name": "Mid", "teamId": 10, "teamName": "Example", "role": "mid"},
    {"accountId": 4, "name": "Support 4", "teamId": 10, "teamName": "Example", "role": "support"},
    {"accountId": 5, "name": "Support 5", "teamId": 10, "teamName": "Example", "role": "support"}
  ]
}
```

Those identities/times are **illustrative**, not an attested historical roster.
Select sources for relevance/tier/history before examining predictive results;
do not cherry-pick only events whose replays were easiest to recover. A source
coverage failure stops training and writes a detailed preflight report.

`train` writes `data/normalized/training-ID-STAGE.json` and a complete match bank.
The normalized player table preserves original match ID, time, end time, source
league, series, historical team, lane classification and patch. There is no
frequency resampling, no rounding of source counters, and no zero-filled column
intersection. It does not mark a model validated or publish a browser forecast.

## Next tournament

1. Edit `lib/current-rules.json`: coefficients, colours, slot patterns, quality
   weights/bonuses, trait parameters, stage slots/tokens and offer assumptions.
   Titles remain in `lib/titles.ts`. New stat semantics/trait algorithms require
   code and evidence; JSON cannot safely describe an unimplemented mechanic.
2. Capture target rosters, positions, lock and format before play. Create a
   preparation manifest. For existing targets, `discover --target ID` narrows
   Tier 1/2 event discovery by team ID and date. Automatic transfer-aware player
   discovery and automatic identification of a future TI are still incomplete.
3. Fetch selected leagues with `--training`. Acquire manifests using
   `prepare-ti --acquire-manifests`; recover with `prepare-ti --recover`.
   All completed work is cached; old unavailable replays remain explicit holes.
4. Run `audit-data --write`, inspect missingness/discontinuities, then `train`
   with the manifest. A failed gate must be resolved before heavy model fitting.
5. Run `compare-models` for diagnostic event-forward raw-stat forecasts. It
   deliberately does not certify a period/entry model from these metrics.
6. **Remaining implementation:** nested selection on adequate exact history,
   coherent tournament futures, period/entry calibration, policy precompute
   and a validated public artifact. The Fantasy page waits for that artifact.
7. After Groups, create a **new Playoff manifest** with updated roster and lock,
   include the target league among sources, and rerun preparation. Only completed
   Group rows enter this update. Group banner state and tokens do not transfer.

## Prediction and decisions

`lib/jointFantasy.ts` exhaustively optimizes legal complete entries against common
scenario columns and checks player exclusivity. It implements expected score,
lower-tail mean and upper-tail mean (default tail mass 20%, a preference choice).
It never independently samples roles. The supplied columns must already come
from a coherent scenario producer; that producer is not yet implemented.

For mean total score, if all cross-role choices are legal,
`E[C+M+S] = E[C]+E[M]+E[S]`, hence maximizing each component is sufficient.
This says nothing about independence. With player conflicts, the legal domain
does not factor; with tail utility, the objective does not factor. The current
module enumerates all combinations for every objective rather than assume either.

Paired differences report Monte Carlo standard error and a fixed-sample normal
interval separately from probability of beating another entry. Those intervals
are not model uncertainty, predictive ranges, or sequential confidence sequences.

`lib/finiteHorizon.ts` computes sparse exact Bellman recursion with memoization,
explicit terminal stop and one-token actions, including refresh. The state key
must encode banner slot order and current offers. A configurable reachable-state
limit fails explicitly rather than silently truncating an optimality claim.
The supplied reduced-game benchmark solves the complete reachable small game.

Full-game `planOffers` enumerates one-token decisions exactly; longer horizons
remain rollouts under a greedy expectation policy. The repaired continuation
chooses before observing the outcome. All wildcard transitions are enumerable,
and all eligible candidates replace the previous top-ten shortlist. The full
policy still needs regret/convergence work and a worker/precompute architecture.

## Storage, compute and deployment

Raw responses/replay overlays: `data/cache/`. Audits: `data/audits/`.
Normalized facts: `data/normalized/`. All are gitignored. Small research reports
are in `docs/reports/`. Existing `data/generated/` files are legacy build output;
they were not hand-edited or relabeled as exact models.

Replay acquisition uses three CPU workers and bounded temporary files. OpenDota
requests are serialized even when callers use `Promise.all`, have timeouts and
retries, respect Retry-After and stop on a reported daily quota exhaustion.
Long jobs report progress and resume from atomic validated checkpoints. There is
no paid dependency. STRATZ's free quotas agree with the owner's figures
([official rate-limit guidance](https://github.com/STRATZ-Esports/knowledge-base/issues/15));
an empirically verified STRATZ fantasy/position adapter is not implemented.

The website still exports static HTML. No giant scenario bank or backend was
introduced. No GPU speedup is claimed: the work implemented here is primarily
replay parsing and finite decision trees. A GPU benchmark becomes relevant when
the vectorized tournament scenario workload exists.
