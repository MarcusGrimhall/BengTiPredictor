# TI 2026 Group Stage pre-lock evidence

Audited 2026-09-15 for `prelock-19719-groupstage.draft.json`.

## Conservative cutoff

The manifest uses **2026-08-13 02:00:00 UTC** (`1786586400`). Valve's pre-event
announcement says predictions had to be submitted before the first match at
10:00 CST on August 13 and tells players to finish crafting their fantasy
rosters before Group play. The public schedule also places the start at that
time. OpenDota records the first parsed match at 03:03:26 UTC; using that later
timestamp as the training cutoff was not justified. The earlier scheduled start
is retained as the conservative leakage boundary even though no archived public
source exposes the fantasy timer itself to the second.

Sources:

- [Valve: The International — Predictions, Fantasy, and Supporter Bundles](https://steamcommunity.com/ogg/570/announcements/detail/678505520073540064), published 2026-07-30.
- [Valve: The International — Streams, Secret Shop, and More](https://store.steampowered.com/news/posts/?appids=570), published 2026-08-11.

## Roster and roles

The base roster is pinned to
[`player_roster.csv` at commit `ed4c7bcd`](https://github.com/saalocin/dotaTI2026/blob/ed4c7bcd0fcdd46eb390eb8040bbdb29fa3b882c/seeds/player_roster.csv).
The commit is dated 2026-08-03 10:43:57 UTC, before lock, and records 80 Steam
account IDs with positions 1–5. Positions map to this project's fantasy roles
as 1+3 Core, 2 Mid and 4+5 Support.

An automated account-ID comparison against the manifest found:

- 80 source rows and 80 manifest rows;
- no role differences among matching accounts;
- one removed account: TaiLung, LGD position 2;
- one added account: Topson, LGD Mid.

The sole difference is supported by LGD's public replacement announcement on
August 9 and contemporaneous reporting that names the full replacement roster:
[Topson joins LGD for TI 2026 to replace banned TaiLung](https://dotesports.com/dota-2/news/topson-lgd-ti-2026-tailung-ban).

The manifest records `rosterKnownAt` as **2026-08-11 00:00:00 UTC**
(`1786406400`). This is a conservative "known by" boundary after the public
replacement and before Valve's August 11 pre-event announcement; it is not
presented as the exact second the roster became public.

## Name handling

The generated target league currently spells `Nigma Galaxy` with a trailing
space. The manifest preserves that exact team key so its projection can join
the generated league and series tables. Fixing it requires normalization in the
extractor followed by regeneration; `data/generated/` must not be hand-edited.

## Remaining scope decision

The 17 `sourceLeagueIds` are the existing research selection, not a validated
model choice. Before a production claim, their inclusion rule must be stated in
terms available before the target result (date, event tier, patch/context and
roster relevance) and evaluated through nested chronological tests.

The first exact-training attempt on 2026-09-15 accepted the manifest and all 17
selected source-event gates, then failed the per-player adequacy requirement on
`Topson: 0`. TI 2024 contains 22 legacy maps for Topson, but a fresh audit found
0/121 exact usable matches and no acquired expected-match manifest. It is not an
eligible primary source until its manifest and replay counters are recovered.
The 20-map requirement remains unchanged.
