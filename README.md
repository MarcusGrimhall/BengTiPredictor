# BengTiPredictor

The International Fantasy scoring tools and an exact-data prediction pipeline.
Next.js static website, TypeScript scoring/decision engines, Node acquisition,
and a Java/Clarity replay parser.

**The new production prediction model is not ready.** The audit found approximate
training counters, incomplete provenance and an optimistic reroll continuation.
Primary training now requires complete, semantically correct match records and
an explicit pre-lock roster/cutoff. The Fantasy page withholds the old forecast
until a validated replacement is published. Information and Bracket remain
available; their historical/legacy numbers are not exact-data model validation.

```bash
npm install
npm run dev
npm test
npm run validate
npm run build
```

Current rules retain score-each-player → pair average → two best games per
series → single best series per period. Group and Playoff state are independent,
with 3/40 and 5/30 slots/tokens respectively.

```bash
# Recover/audit the existing source population. Completed caches are reused.
npm run prepare-ti -- 19719 --acquire-manifests
npm run prepare-ti -- 19719 --recover
npm run audit-data -- 19719 --write

# After supplying a pre-lock roster and the selected source events:
npm run train -- 19719 --config path/to/pre-lock-manifest.json

# Research diagnostics, not permission to publish a model:
npm run compare-models
npm run benchmark-policy
```

The main changes and measured limitations are in
[the statistical audit](docs/STATISTICAL_AUDIT.md). See
[the pipeline architecture and next-TI workflow](docs/EXACT_PIPELINE.md),
[commands](COMMANDS.md), [adopted mechanics](ASSUMPTIONS.md) and
[rule audit](RULE_AUDIT.md).

`lib/current-rules.json` centralizes current coefficients, stat colours, banner
slots, tier bonuses, trait parameters, initial/crafting quality weights and stage
budgets. Titles remain modular in `lib/titles.ts`. New stat semantics or entirely
new trait mechanics still need an extractor/implementation and evidence.

No paid service is required. Raw API and replay checkpoints, normalized training
banks and detailed local audits are gitignored. Small research reports live in
`docs/reports/`. GitHub Pages static export remains supported by the existing
workflow; this task does not deploy the changes.
