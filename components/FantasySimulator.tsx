"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, rankPlayers, riskToPercentile
} from "../lib/fantasy";
import { BANNER_SLOTS, Role, STAT_LABELS, StatKey, statsForColor } from "../lib/scoring";
import {
  RosterOffer, RosterOutcome, SKIP_ACTION,
  actionCatalogue, compareRosterOffers, randomBanner
} from "../lib/reroll";
import { STAGE_LABELS, STAGE_SLOTS, STAGE_TOKENS, type Stage } from "../lib/stages";
import { seededRandom } from "../lib/rng";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

// The presets sit at 25 and 75 rather than the ends of the bar. Risk 0 reads
// the 10th percentile and risk 100 the 95th, and the backtest found both to be
// worse picks than the middle of the range - the ends are there to be dragged
// to deliberately, not offered as one-click defaults.
const RISK_LABELS: Array<{ at: number; label: string; hint: string }> = [
  { at: 25, label: "Safe", hint: "the floor — what holds up on a bad day" },
  { at: 50, label: "Balanced", hint: "a typical run" },
  { at: 75, label: "Highroll", hint: "the ceiling — what a good run looks like" }
];

export function riskLabel(risk: number) {
  if (risk <= 37) return RISK_LABELS[0];
  if (risk >= 63) return RISK_LABELS[2];
  return RISK_LABELS[1];
}

/**
 * What a risk setting is actually asking for, in runs.
 *
 * Risk reads a percentile of your own outcome distribution, and the expected
 * best of N independent runs lands near the N/(N+1)th percentile. Inverting
 * that, a percentile p is the outcome you would target if you were going for
 * the best of
 *
 *     N = p / (1 - p)
 *
 * runs. So risk 50 is a typical run, risk 70 is about the best of two, risk 85
 * about the best of five, and risk 100 the best of twenty. That is the honest
 * reading of the slider: it is not "how brave am I", it is "how many attempts
 * am I effectively aiming to beat".
 */
export function riskAsRuns(risk: number): number {
  const p = riskToPercentile(risk) / 100;
  return p / Math.max(0.001, 1 - p);
}

export function riskAsOdds(risk: number): string {
  const n = riskAsRuns(risk);
  if (n < 1.3) return "a typical run";
  return `aiming for the best of about ${n < 2.5 ? 2 : Math.round(n)} runs`;
}

/** A small marker showing a heading carries an explanation. */
function Q() {
  return <span className="help-mark" aria-hidden="true">?</span>;
}

export default function FantasySimulator({
  playersByRole, banners, risk, stage, onRisk, seriesByTeam, onBanner
}: {
  playersByRole: Record<Role, PlayerEntry[]>;
  banners: Record<Role, Emblem[]>;
  risk: number;
  stage: Stage;
  onRisk: (risk: number) => void;
  seriesByTeam: Record<string, number>;
  onBanner: (role: Role, banner: Emblem[]) => void;
}) {
  const [tokens, setTokens] = useState<number>(STAGE_TOKENS[stage]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [offerRole, setOfferRole] = useState<Role>("core");
  // How many times each offer is rolled. More is tighter and slower; the
  // numbers stop moving meaningfully somewhere around 2,000.
  const [runs, setRuns] = useState(800);
  const [results, setResults] = useState<RosterOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = STAGE_SLOTS[stage];
  const budget = STAGE_TOKENS[stage];

  const staged = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, banners[r].slice(0, slots)])) as Record<Role, Emblem[]>,
    [banners, slots]
  );

  useEffect(() => { setResults(null); }, [banners, risk, tokens, runs]);
  useEffect(() => {
    setTokens(STAGE_TOKENS[stage]);
    setChosen([]);
    setResults(null);
  }, [stage]);

  const catalogue = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, actionCatalogue(r, slots)])) as Record<Role, ReturnType<typeof actionCatalogue>>,
    [slots]
  );

  // Rerolls are compared against a reduced field per role: the strongest
  // entries under the current banner. The best entry after a reroll is
  // essentially always among them, and it keeps this responsive in a browser.
  const shortlists = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [
      r,
      rankPlayers(playersByRole[r] ?? [], r, staged[r], risk, seriesByTeam).slice(0, 10).map((x) => x.player)
    ])) as Record<Role, PlayerEntry[]>,
    [playersByRole, staged, risk, seriesByTeam]
  );

  const valueOf = useMemo(
    () => (role: Role, banner: Emblem[]) =>
      rankPlayers(shortlists[role] ?? [], role, banner, risk, seriesByTeam)[0]?.total ?? 0,
    [shortlists, risk, seriesByTeam]
  );

  const roleValues = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, valueOf(r, staged[r])])) as Record<Role, number>,
    [valueOf, staged]
  );
  const rosterTotal = ROLES.reduce((sum, r) => sum + roleValues[r], 0);

  const key = (role: Role, id: string) => `${role}:${id}`;
  const toggle = (k: string) =>
    setChosen((now) => (now.includes(k) ? now.filter((x) => x !== k) : [...now, k]));

  const run = () => {
    const offers: RosterOffer[] = [];
    for (const role of ROLES) {
      for (const action of catalogue[role]) {
        if (chosen.includes(key(role, action.id))) offers.push({ role, action });
      }
    }
    if (!offers.length) return;
    // Skipping is always on the menu, so it is always in the comparison.
    offers.push({ role: "core", action: SKIP_ACTION });
    setBusy(true);
    setTimeout(() => {
      setResults(compareRosterOffers(offers, staged, valueOf, tokens, runs));
      setBusy(false);
    }, 0);
  };

  const rollFresh = (role: Role) => {
    const fresh = randomBanner(role, slots, seededRandom(`fresh-${role}-${Date.now()}`));
    onBanner(role, [...fresh, ...banners[role].slice(slots)]);
    setResults(null);
  };

  const update = (role: Role, index: number, patch: Partial<Emblem>) => {
    const next = [...banners[role]];
    next[index] = { ...next[index], ...patch };
    onBanner(role, next);
  };

  const info = riskLabel(risk);
  const chosenCount = chosen.length;

  return (
    <section className="card stack" id="simulator">
      <div className="row-between">
        <div>
          <h2>Fantasy simulator</h2>
          <p className="faint" style={{ marginTop: 2 }}>
            One pool of {budget} tokens for the whole roster — Core, Mid and Support
            share it. Tick the options the game is offering on each banner and see
            which one is worth spending on, or whether to keep the tokens.
          </p>
        </div>
        <span className="tag">{STAGE_LABELS[stage]} · {slots} emblems</span>
      </div>

      <div className="sub-card stack">
        <div className="row-between">
          <div>
            <h3>Risk</h3>
            <p className="faint" style={{ marginTop: 2 }}>
              {info.label} — {info.hint}. Reading the{" "}
              {Math.round(riskToPercentile(risk))}th percentile: {riskAsOdds(risk)}.
            </p>
          </div>
          <div className="pill-row">
            {RISK_LABELS.map((r) => (
              <button key={r.at} className="pill" aria-pressed={riskLabel(risk).at === r.at}
                onClick={() => onRisk(r.at)}>{r.label}</button>
            ))}
          </div>
        </div>
        <input
          type="range" min={0} max={100} step={1} value={risk}
          onChange={(e) => onRisk(Number(e.target.value))}
          aria-label="Risk" className="risk-slider"
        />
        <div className="row-between faint">
          <span>Floor</span><span>Typical</span><span>Ceiling</span>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <small>Tokens left</small>
          <input
            type="number" min={0} max={99} value={tokens} aria-label="Tokens left"
            onChange={(e) => setTokens(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="token-input"
          />
          <span className="faint">shared · stage grants {budget}</span>
        </div>
        <div className="stat-tile">
          <small>Roster now</small>
          <b>{fmt(rosterTotal)}</b>
          <span className="faint">
            {ROLES.map((r) => `${ROLE_LABELS[r]} ${fmt(roleValues[r])}`).join(" · ")}
          </span>
        </div>
        <div className="stat-tile">
          <small>Options ticked</small>
          <b>{chosenCount}</b>
          <span className="faint">skip is always compared too</span>
        </div>
        <div className="stat-tile">
          <small>Wildcard sampling</small>
          <select value={runs} onChange={(e) => setRuns(Number(e.target.value))}
            aria-label="Sampling runs for the wildcards" className="token-input">
            <option value={200}>200</option>
            <option value={800}>800</option>
            <option value={2000}>2,000</option>
            <option value={8000}>8,000</option>
          </select>
          <span className="faint">only the two wildcards need it</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <h3>Options on offer</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} className="btn-primary" disabled={!chosenCount || busy}>
              {busy ? "Simulating…" : `Compare ${chosenCount || ""}`}
            </button>
            <button onClick={() => { setChosen([]); setResults(null); }}>Clear</button>
          </div>
        </div>
        <p className="faint">
          Pick the banner the offer is on, then tick it. The game normally shows three
          at a time. Every reroll except the two wildcards has few enough outcomes to be
          worked out <strong>exactly</strong> rather than simulated — the page is doing
          arithmetic against the {tokens} tokens you have left, not running a simulation.
        </p>
        <div className="pill-row" role="tablist" aria-label="Offer banner">
          {ROLES.map((r) => (
            <button key={r} className="pill" role="tab" aria-pressed={offerRole === r}
              onClick={() => setOfferRole(r)}>
              {ROLE_LABELS[r]}
              {chosen.some((k) => k.startsWith(`${r}:`)) && (
                <span className="faint"> · {chosen.filter((k) => k.startsWith(`${r}:`)).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="option-grid">
          {catalogue[offerRole].map((action) => {
            const k = key(offerRole, action.id);
            return (
              <label key={k} className={`option-chip ${chosen.includes(k) ? "on" : ""}`}>
                <input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(k)} />
                <span>{action.label}</span>
                <em className="num">{action.cost}t</em>
              </label>
            );
          })}
        </div>
      </div>

      {results && (
        <Results
          results={results}
          rosterTotal={rosterTotal}
          tokens={tokens}
          onSpend={(cost) => setTokens((t) => Math.max(0, t - cost))}
        />
      )}

      <div className="stack" style={{ gap: 8 }}>
        <h3>What you hold now</h3>
        <p className="faint">
          Set each banner to what the game actually gave you. Stats already used on the
          same banner are hidden — one of each, always.
        </p>
        {ROLES.map((role) => (
          <div key={role} className="sub-card stack" style={{ gap: 6 }}>
            <div className="row-between">
              <strong>{ROLE_LABELS[role]}</strong>
              <span className="faint">
                {fmt(roleValues[role])}{" "}
                <button className="link-button" onClick={() => rollFresh(role)}>roll random</button>
              </span>
            </div>
            {staged[role].map((emblem, index) => {
              const color = BANNER_SLOTS[role][index];
              const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
              return (
                <div key={index} className="emblem-row">
                  <span className={`dot dot-${color}`} aria-label={color} />
                  <select value={emblem.stat} aria-label={`${ROLE_LABELS[role]} emblem ${index + 1} stat`}
                    onChange={(e) => update(role, index, { stat: e.target.value as StatKey })}>
                    {availableStats(staged[role], index, slotOptions).map((stat) => (
                      <option key={stat} value={stat}>{STAT_LABELS[stat]}</option>
                    ))}
                  </select>
                  <select value={emblem.tier} aria-label={`${ROLE_LABELS[role]} emblem ${index + 1} tier`}
                    onChange={(e) => update(role, index, { tier: e.target.value as Tier })}>
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>{tier} · +{TIER_BONUSES[tier]}%</option>
                    ))}
                  </select>
                  <select value={emblem.trait} aria-label={`${ROLE_LABELS[role]} emblem ${index + 1} trait`}
                    title={TRAIT_DESCRIPTIONS[emblem.trait]}
                    onChange={(e) => update(role, index, { trait: e.target.value as Trait })}>
                    {TRAITS.map((trait) => (
                      <option key={trait} value={trait}>{trait === "none" ? "—" : trait}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="notice">
        Token costs and the tier/trait roll distributions are <strong>assumptions</strong> —
        Valve publishes neither. They live in <code>ACTION_COSTS</code>,{" "}
        <code>TIER_WEIGHTS</code> and <code>TRAIT_WEIGHTS</code> in <code>lib/reroll.ts</code>.
      </p>
    </section>
  );
}

/** Plain-language notes for the column headers. */
const COLUMN_HELP: Record<string, string> = {
  cost: "Tokens this option costs each time you take it.",
  rolls: "How many times you could take this option with the tokens you have left.",
  oneRoll:
    "Average change to the roster from taking this option ONCE. Negative means a single roll is expected to leave you worse off.",
  improves:
    "How often a single roll came out better than what you already hold. A high average with a low improve rate is a gamble that pays big and rarely.",
  breakEven:
    "The first roll at which committing to this option overtakes doing nothing. \"3 rolls\" means the first two are expected to be a loss.",
  endOfBudget:
    "What this option is worth if you spend every affordable token on it and stop the moment you are happy. Never below zero, because holding is always allowed. This is the column to rank on."
};

function Results({
  results, rosterTotal, tokens, onSpend
}: {
  results: RosterOutcome[];
  rosterTotal: number;
  tokens: number;
  onSpend: (cost: number) => void;
}) {
  const best = results[0];
  const skipped = results.find((r) => r.action.target === "skip");
  const bestIsSkip = best.action.target === "skip";
  const rescued = results.filter((o) => o.action.target !== "skip" && o.delta < 0 && o.planDelta > 0);

  return (
    <div className="stack">
      <h3>Result — best over the whole budget first</h3>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Banner</th><th>Option</th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.cost}>Cost <Q /></th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.rolls}>Rolls <Q /></th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.oneRoll}>One roll <Q /></th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.improves}>Improves <Q /></th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.breakEven}>Break-even <Q /></th>
              <th style={{ textAlign: "right" }} title={COLUMN_HELP.endOfBudget}>End of budget <Q /></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((o, index) => (
              <tr key={`${o.role}:${o.action.id}`} className={o.action.target === "skip" ? "row-skip" : ""}>
                <td className="muted">{o.action.target === "skip" ? "—" : ROLE_LABELS[o.role]}</td>
                <td>
                  {index === 0 && <span className="tag" style={{ marginRight: 6 }}>best</span>}
                  {o.action.label}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}
                  title={o.action.target === "skip" ? "" : o.exact
                    ? "Every outcome enumerated — this number is exact."
                    : `Sampled: this action picks slots at random, so its outcomes were estimated over ${o.runs.toLocaleString("en-US")} rolls.`}>
                  {o.action.cost}{o.action.target !== "skip" && !o.exact && <span className="faint">*</span>}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {o.action.target === "skip" ? "—" : o.attempts || <span className="faint">n/a</span>}
                </td>
                <td className="num" style={{ textAlign: "right", color: o.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                  {o.action.target === "skip" ? "—" : signed(o.delta)}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {o.action.target === "skip" ? "—" : `${(o.improveChance * 100).toFixed(0)}%`}
                </td>
                <td className="num faint" style={{ textAlign: "right" }}>
                  {o.action.target === "skip"
                    ? "—"
                    : o.breakEvenAttempts === null
                      ? "never"
                      : `${o.breakEvenAttempts} roll${o.breakEvenAttempts === 1 ? "" : "s"}`}
                </td>
                <td className="num" style={{ textAlign: "right", fontWeight: 650, color: o.planDelta > 0 ? "var(--accent)" : "var(--muted)" }}>
                  {signed(o.planDelta)}
                </td>
                <td style={{ textAlign: "right" }}>
                  {o.action.target !== "skip" && (
                    <button
                      onClick={() => onSpend(o.action.cost)}
                      disabled={o.action.cost > tokens}
                      title={`Deduct ${o.action.cost} tokens — use this once you have actually taken the reroll in game`}
                    >
                      Take
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="faint">
        {results.every((r) => r.exact)
          ? "Every number here is exact — all outcomes enumerated, nothing sampled. "
          : "Rows marked * were sampled; the rest are exact. "}
        Hover any column heading for what it means. <strong>Take</strong> deducts the
        cost from your tokens — press it once you have actually taken the reroll in game.
      </p>

      <div className="verdict">
        {bestIsSkip ? (
          <>
            <strong>Skip.</strong> Nothing on offer beats the {fmt(rosterTotal)} the roster
            is already worth, even with all {tokens} tokens behind it. Keep them —
            a better offer costs nothing to wait for.
          </>
        ) : (
          <>
            <strong>Take &ldquo;{best.action.label}&rdquo;</strong> on{" "}
            <strong>{ROLE_LABELS[best.role]}</strong>. Committing the budget to it is worth{" "}
            {signed(best.planDelta)}, taking the roster to {fmt(best.rosterPlanValue)}.
            {best.breakEvenAttempts !== null && best.breakEvenAttempts > 1 && (
              <> It only pays from roll {best.breakEvenAttempts} onward, so start it only
                if you mean to keep going.</>
            )}
            {skipped && ` Skipping is worth ${fmt(rosterTotal)}.`}
          </>
        )}
      </div>

      {rescued.length > 0 && (
        <p className="faint" style={{ maxWidth: 720 }}>
          {rescued.length === 1 ? "One option is" : `${rescued.length} options are`} a loss on
          the next roll but a gain by the end of the budget. You never get a rerolled emblem
          back, but you do choose after every roll whether to stop, so a bad average with a
          fat upside is worth chasing when you can afford to chase it repeatedly.
        </p>
      )}
    </div>
  );
}
