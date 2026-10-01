# PGL Wallachia Season 9 research checkpoint

Snapshot taken 2026-09-24. This is an ongoing, held-out 16-team rehearsal, not
a published TI fantasy forecast.

## Identity and cutoff

- Organizer: [PGL event page](https://www.pglesports.com/dota2/wallachia-s9-2026/),
  listing 16 teams, Swiss Group and double-elimination playoffs, September 19–27.
- OpenDota league ID: `20279`, identified by `npm run leagues -- wallachia`.
- OpenDota match manifest acquired 2026-09-24 10:42 UTC: 83 maps. The cached
  maps run from 2026-09-19 07:00:37 UTC through 2026-09-24 09:21:18 UTC.
- A conservative pre-Group cutoff and all 80 player accounts/positions still
  need dated pre-event evidence. Current event rows may check identities after
  the fact; they cannot establish what was known before play.
- Group predictions reconstructed now are retrospective. A prediction saved
  before a future tournament starts is required for an actual forward test.

## Exact-data checkpoint

`npm run fetch -- 20279 --research-target` stored a generated league file and
raw matches without adding the event to the public league index. It has 16
teams, 80 observed players and 83/83 parsed maps. The file is local build output
and is ignored by Git while this tournament is ongoing.

`npm run replays -- 20279` produced 81/83 complete replay checkpoints. Two
replays failed because one player lacked a valid Teamfight participation value
(`9009368871`, `9013623742`). The full audit retained 79/83 exact matches,
or 95.18%, above the fixed 90% event gate. The other two excluded maps
(`9005881535`, `9010014985`) had negative OpenDota Stuns values; since the
2026-10-01 rule change those are retained, which gives 81/83 exact maps. One team has
8/10 exact maps; the audit reports this as a warning, not a statistically
significant concentrated-missingness failure.

The stage splitter currently reports one stage because the event is unfinished
and has no sufficiently long observed schedule break. Before period scoring,
the Group/Playoff boundary must be established from the actual schedule; do
not infer it from today's incomplete match list.

## Historical comparison and next work

The [raw-stat diagnostic](reports/model-comparison.json), rerun on
2026-10-01 after the Stuns/Deaths rule change and the S8 source recovery,
evaluates 24 event origins from 29 recovered exact events. It includes the
proposed 180-day cap with 60-day half-life. Across those origins its mean
CRPS is 197.23, compared with 196.72 for an uncapped 120-day half-life (lower
is better). The 2026-09-24 run gave 197.28 and 196.58 on 14 origins. This is a raw-stat diagnostic on players with enough shared history,
not a complete-roster comparison or a test of sparse-history fallback. It does
not settle the final lookback. Wallachia is explicitly excluded from model
selection even though its exact replay data is now cached.

Next: source pre-event rosters and positions for several older test origins and
Wallachia; specify cutoffs and source-event selection before evaluating their
results; compare role fallback and history policies on complete roster
decisions; then grade Wallachia with the chosen rules. Refresh the ongoing
league after play ends and re-audit its stage split and match coverage.
