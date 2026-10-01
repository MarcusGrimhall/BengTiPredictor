# Statistical audit and implementation report — 2026-09-10

This is a substantial data/decision-engine repair, **not completion of the full
production system requested**. Production forecasts are withheld; exact replay
recovery is resumable, and the new model/policy components require further work
before they can support near-optimal full-period advice.

## Findings and changes

| Finding traced in code | Consequence | Implemented response |
| --- | --- | --- |
| `extractMatch` calibrated Madstones, Watchers and Lotuses; Tormentor fell back to kill credit and Teamfight to API participation | Approximate observations treated like measured fantasy vectors | Separate exact fact extractor, provenance, full-match rejection; legacy descriptive extraction explicitly isolated |
| Training used the intersection of available stat columns and zero defaults | The effective fantasy problem could change with source coverage | All current required columns or rejection; no reduced-stat training |
| Parsed flag only needed one player's API participation; missing scalar fields defaulted to zero | Missing evidence looked like legitimate low production | Check all ten player identities, parse state, scalar presence and exact replay fields |
| `sampleReplayTitles` merely meant an overlay existed | Neither full fantasy counters nor all title triggers were proven | Dedicated five-counter validation; title coverage now checks the three actual boolean fields |
| Configured replay-overlay directory was empty locally; old cache held four-counter outputs | Committed generated “exact” rows could not be regenerated from that directory | Restored 364 public overlays, identity/range validation, local parser extended to Teamfight and replay match metadata |
| Java parser used zero defaults for absent properties | A schema change could manufacture exact zeros | Preserve null and fail checkpoint validation |
| A few OpenDota Stuns values were negative | Initially treated as invalid | The 2026-10-01 owner decision supersedes this: retain replay values, including negatives, without clamping |
| Old training copied weighted rows and manufactured match IDs, with at least one copy retained | Claimed decay weights differed from the distribution actually fitted | Keep original samples once; continuous weights in research fitting |
| Cutoffs used start times, sometimes event-level timestamp fallbacks | Completion-before-lock was not enforced at observation level | Explicit lock/roster manifest and strict per-map end time |
| Target roles were inferred from target lane performance; current rosters and ratings could be anachronistic | “Known at lock” was asserted without an attested snapshot | Pre-lock roster evidence required; historical context kept separately |
| Reliability and strength coefficients used target-era outcomes; group volume and top-four paths used retrospective/conditional assumptions | Pre-event rows alone did not establish leakage-free predictions | New research does not reuse fitted legacy reliability/strength; no production approval of those parameters |
| Pair builder only kept games where current partners both appeared | Newly formed pairs can lose useful individual history | New fact bank retains individual historical team/context; replacement joint generative model still needed |
| Stat reroll allowed its old stat | Violated adopted exclusion rule | Fixed sampled and enumerated transitions |
| Reroll continuation rolled every option, then picked the best realized result | Clairvoyance inflated continuation value | Choose using expected value first, observe only the chosen outcome |
| Future offers ignored the adopted previous-triple exclusion | Wrong state transition | Implemented configurable exclusion of all previous offers |
| Wildcards returned “not enumerable” | Unnecessary simulation noise | Exact slot/quality enumeration with probability aggregation |
| “Exact” action values flattened probabilities into at least one of 2,000 samples | Small-probability outcomes were overweighted | Weighted expectations/quantiles directly, no probability quantization |
| Zero-token plans could still value applying an offer | Impossible recommendation | Zero-token action list is empty; one-token plans exact |
| Browser top-ten shortlist lacked a regret bound | A different stat profile could make an excluded candidate best | Full field used; downstream runtime work remains |
| Old i.i.d. stopping test was discussed like policy validation | Passing did not establish actual reroll optimality | Relabeled legacy test, added state-dependent Bellman solver and reduced-game regret benchmark |

The old refresh omission had already been repaired in code; several notes still
said it was absent. Those notes are now explicitly superseded. No Deaths-floor,
pair averaging, best-two-games, best-single-series, or measured crafting-quality
rule was changed in this 2026-09-10 audit. Deaths and Stuns were later changed
on 2026-10-01 as documented in ASSUMPTIONS.md. Stat exclusion and no-repeat repair existing adopted rules.
Separate Group/Playoff banner state follows the owner's current instruction;
it is a product-policy override of the earlier carry-three-slots UI convention,
not newly established Valve evidence.

## Data evidence

The initial source audit covered **1,746 pre-TI maps in 17 selected events**.
After restoring the public replay overlays, **216 maps (12.37%)** met the full
exact-vector contract. The entire source selection failed the 90% gate. This
cannot be repaired by silently selecting only the two easiest source events.

| Initial recovered event | Expected maps | Complete exact maps | Excluded |
| --- | ---: | ---: | ---: |
| EWC, 19785 | 157 | 156 | 1 negative Stuns value under the former gate |
| 1win Essence II, 20009 | 60 | 60 | 0 |
| Target TI, 19719 | 147 | 145 | 2 negative Stuns values under the former gate |

The target TI rows cannot train its Group forecast. They can supply held-out
truth, or completed Groups can update a later Playoff forecast.

[The baseline report](reports/data-baseline.json) preserves these counts.
Expanded local replay recovery was subsequently started across the selected
sources; the baseline must not be mistaken for its final coverage. Its progress
and failures are checkpointed in `data/cache/replay-fantasy/league-ID.json`.
Re-run `prepare-ti -- 19719` for a complete updated audit when acquisition ends.

The public overlay source was
[TinyKiecoo's replay parser at revision 6507914](https://github.com/TinyKiecoo/Calculator-for-DOTA2-TI-Fantasy/tree/650791432c9d1a882ae996c75d66ccb9267c450c).
All 364 imported maps were identity-checked against the raw cache. The revised
local parser reproduced the four integer counters for all ten players in match
8892829232 and Teamfight within float-serialization precision. Two older North
American qualifier replays also parsed successfully; historical recovery is
therefore feasible for at least some previously uncovered data.

The term exact remains conditional on the adopted stat semantics. Stun-duration
semantics, Wisdom rune eligibility and negative Deaths scoring retain their documented
uncertainty. STRATZ Position is not promoted to official fantasy-role truth
merely because it is a named API field; a validated adapter remains outstanding.

## Chronological model comparison

The first reproducible diagnostic used the three recovered events. Predictions
used only completed earlier events; all candidates used a common test cohort
with at least ten historical maps under every window. Metrics average absolute
error and empirical CRPS over all 18 stats on their current point scales. This
is a **raw-stat forecast diagnostic**, not series/entry decision performance.
The origin is the event's first recorded match, not an attested fantasy lock;
the team-context variant conditions on recorded target team membership.

| Diagnostic | Window 30 | Windows 60–365 | Decay 60 | Decay 120 |
| --- | ---: | ---: | ---: | ---: |
| EWC → 1win CRPS, 576 common player-games | 208.462 | 208.462 | 208.306 | 208.381 |
| Earlier events → TI CRPS, 714 common player-games | 215.091 | 207.594 | 207.936 | 207.729 |

Lower is better. Decay's direction changes between tests. Windows 60–365 use the
same available history, so this evidence **cannot identify the best lookback**.
The common TI cohort covers only 714 of 1,450 exact player-games, making the
decision-quality limitation material rather than a footnote.

`compare-models` can be rerun as coverage grows. It rejects event cohorts below
90% exact coverage or without a manifest. Its nested diagnostic selection uses
only at least three **completed earlier** event evaluations, and otherwise
abstains. It never promotes the result to a validated production model.
[Machine-readable results](reports/model-comparison.json) contain per-stat
metrics, source fingerprint, exclusions and chronological selection evidence.

Still required: trustworthy pre-lock historical manifests, adequate source
coverage, patch/context/opponent comparisons, period-tail calibration and
complete-entry regret. A better raw-stat CRPS alone cannot settle the product's
model choice.

## Joint-entry and reroll architecture

`jointFantasy.ts` consumes common scenario columns, exhaustively searches legal
Core/Mid/Support combinations and offers mean, lower-tail mean and upper-tail
mean objectives. A diversification fixture demonstrates that the preferred
complete entry changes when joint downside replaces mean. Paired Monte Carlo
error is distinct from realized fantasy variability. A coherent scenario
producer and calibration of user-facing strategies are still missing.

The full game is not amenable to a naive Cartesian table. With six stats per
colour and five tiers/traits, a three-slot Core or Support has 2,812,500 legal
banner states and Mid 3,375,000. Their product is about 2.67×10^19 before offers
or tokens. Five-slot banner products are about 6.52×10^31. These are combinatorial
upper counts, **not measured reachable-state counts**. Slot permutation is not
used as a symmetry: adjacency and offer scopes preserve ordering information.

`finiteHorizon.ts` memoizes sparse reachable states and solves exact Bellman
values. Stop is free and leaves the state; apply/refresh consumes a token.
Reaching its configured state cap throws and clears partial results, rather
than returning an unjustified “optimal” value.

`endgame.ts` additionally computes exact last-two-token action values for the
full mechanics under an additive terminal oracle. It integrates the next
three-offer deal using an order-statistic identity rather than enumerating
all triples. Uniform dealing and the adopted no-repeat rule are assumptions.
This reference is not yet connected to the browser recommendation flow.

The existing runtime planner is exact for one token and remains a rollout for
longer budgets. Its repaired greedy continuation is non-clairvoyant, but no
near-optimality claim is made. The current sequential finite sampling budget,
tie inference and static banner-value objective still need replacement or
validation against the stronger decision architecture.

The exact reduced game has two ordered slots, three weighted qualities and one
current offer (left/right/both). All 27 starting states are evaluated. It
includes paid refresh, current-quality exclusion and no-repeat between deals.
The terminal utility includes a synergy, exposing a genuine greedy trap.

| Tokens | Exact optimal mean | Greedy mean regret | Greedy maximum regret |
| ---: | ---: | ---: | ---: |
| 2 | 9.881 | 0.183 | 1.500 |
| 5 | 12.913 | 1.386 | 5.406 |
| 30 | 20.491 | 5.233 | 14.394 |
| 40 | 20.832 | 5.420 | 14.800 |

These are the reduced game's utility units, not TI fantasy points. The DP has
zero solver regret by exhaustive Bellman evaluation in that finite model; the
comparison measures the expectation-greedy baseline. It does **not** measure
full-game rollout regret. [Reproducible report](reports/policy-benchmark.json).

## Performance and verification

- Initial 18-league raw-cache audit: 134.5 seconds summed audit time. Replay
  acquisition is the dominant ongoing operation; completed work is resumable.
- Reduced policy benchmark: 1,107 memoized states, about 0.08 seconds locally.
- Full-mechanics two-token reference with a **synthetic cheap terminal oracle**:
  10,785 cached expectations, seven candidate actions, 0.214 seconds. This is
  not a website or real forecast-oracle latency claim.
- Initial chronological diagnostic: 2.39 seconds. Initial JSON report 48,682
  bytes, 4,272 bytes gzip; later reruns change its cohort and size.
- Policy report: 1,603 bytes, 605 bytes gzip.
- Static Fantasy status page: 8,438-byte HTML, 2,323 bytes gzip in the measured
  build. No public scenario bank exists; these numbers do not measure the
  completed prediction site's initial load.
- Local Java build, new deterministic tests, legacy `npm run validate` and
  static `npm run build` passed. The independent comparison remains 33/38.
  GitHub Pages CI now also runs the mechanics/data tests and legacy checks.

No GPU acceleration, full model-fit memory benchmark, full-budget policy
precompute or browser fallback latency is claimed. Those workloads have not
been implemented/calibrated. No deployment or commit was made by this task.

## Remaining definition-of-done work

1. Finish exact recovery, diagnose remaining gaps and acquire dated historical
   roster/role/format manifests; confirm adequacy and non-systematic missingness.
2. Select and calibrate a joint period model with nested chronological tests,
   including genuine Group → Playoff updates and advancement/opportunity risk.
3. Evaluate complete-entry decision regret, tails, history/context sensitivity
   and model uncertainty on those honest targets.
4. Develop/measure a scalable near-optimal shared-token policy, common-random
   full-game policy comparisons, adaptive precision and token-value curves.
5. Build versioned compressed predictive/value artifacts, worker fallback,
   latency/size benchmarks and the final user-facing entry/reroll flow.

The implementation intentionally fails the production gate rather than calling
an approximate dataset or an unvalidated continuation policy the finished system.
