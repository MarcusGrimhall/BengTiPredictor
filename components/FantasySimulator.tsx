"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, rankPlayers, riskToPercentile
} from "../lib/fantasy";
import { BANNER_SLOTS, Role, STAT_LABELS, StatKey, statsForColor } from "../lib/scoring";
import { ActionOutcome, actionCatalogue, compareActions, randomBanner } from "../lib/reroll";
import { STAGE_LABELS, STAGE_SLOTS, STAGE_TOKENS, type Stage } from "../lib/stages";
import { seededRandom } from "../lib/rng";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

const RISK_LABELS: Array<{ at: number; label: string; hint: string }> = [
  { at: 0, label: "Safe", hint: "ranks players by their floor — who holds up on a bad day" },
  { at: 50, label: "Balanced", hint: "ranks players by a typical game" },
  { at: 100, label: "Highroll", hint: "ranks players by their ceiling — who can spike hardest" }
];

export function riskLabel(risk: number) {
  if (risk <= 25) return RISK_LABELS[0];
  if (risk >= 75) return RISK_LABELS[2];
  return RISK_LABELS[1];
}

export default function FantasySimulator({
  players, role, roleLabel, stage, banner, risk, onRisk, seriesByTeam, onApply
}: {
  players: PlayerEntry[];
  role: Role;
  roleLabel: string;
  /** Which fantasy card this is. Chosen above, so the whole page agrees. */
  stage: Stage;
  banner: Emblem[];
  risk: number;
  onRisk: (risk: number) => void;
  seriesByTeam: Record<string, number>;
  onApply: (banner: Emblem[]) => void;
}) {
  const [tokens, setTokens] = useState<number>(STAGE_TOKENS[stage]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [results, setResults] = useState<ActionOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = STAGE_SLOTS[stage];
  const budget = STAGE_TOKENS[stage];
  const staged = useMemo(() => banner.slice(0, slots), [banner, slots]);
  const catalogue = useMemo(() => actionCatalogue(role, slots), [role, slots]);
  const slotOptions = useMemo(
    () => BANNER_SLOTS[role].slice(0, slots).map((color) => statsForColor(color)),
    [role, slots]
  );

  // A changed banner, role or risk level invalidates any result on screen.
  useEffect(() => { setResults(null); }, [banner, role, risk, tokens]);

  // Switching card resets the budget to what that stage actually grants.
  useEffect(() => {
    setTokens(STAGE_TOKENS[stage]);
    setChosen([]);
    setResults(null);
  }, [stage]);

  // Rerolls are compared against a reduced field: the strongest players under
  // the current banner. The best player after a reroll is essentially always
  // among them, and it keeps the simulation fast enough to run in the browser.
  const shortlist = useMemo(
    () => rankPlayers(players, role, staged, risk, seriesByTeam).slice(0, 10).map((r) => r.player),
    [players, role, staged, risk, seriesByTeam]
  );

  const valueOf = useMemo(
    () => (candidate: Emblem[]) =>
      rankPlayers(shortlist, role, candidate, risk, seriesByTeam)[0]?.total ?? 0,
    [shortlist, role, risk, seriesByTeam]
  );

  const current = useMemo(() => valueOf(staged), [valueOf, staged]);

  const toggle = (id: string) =>
    setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  const update = (index: number, patch: Partial<Emblem>) => {
    const next = [...banner];
    next[index] = { ...next[index], ...patch };
    onApply(next);
  };

  const run = () => {
    const actions = catalogue.filter((a) => chosen.includes(a.id));
    if (!actions.length) return;
    setBusy(true);
    // Yield once so the button can render its busy state before we block.
    setTimeout(() => {
      setResults(compareActions(staged, role, actions, valueOf, 800, tokens));
      setBusy(false);
    }, 0);
  };

  const rollFresh = () => {
    const fresh = randomBanner(role, slots, seededRandom(`fresh-${Date.now()}`));
    // Keep any slots beyond this stage untouched.
    onApply([...fresh, ...banner.slice(slots)]);
    setTokens(budget);
  };

  const info = riskLabel(risk);

  return (
    <section className="card stack" id="simulator">
      <div className="row-between">
        <div>
          <h2>Fantasy simulator</h2>
          <p className="faint" style={{ marginTop: 2 }}>
            Enter the banner you actually hold, say how many tokens are left, tick the
            options the game is offering — and see which one is worth taking once the
            whole budget is played out, not just on the next roll. Switch card with the
            tabs at the top of the page; each stage has its own emblems and its own tokens.
          </p>
        </div>
        <span className="tag">{STAGE_LABELS[stage]} · {slots} emblems</span>
      </div>

      <div className="sub-card stack">
        <div className="row-between">
          <div>
            <h3>Risk</h3>
            <p className="faint" style={{ marginTop: 2 }}>
              {info.label} — {info.hint}. Reading the {Math.round(riskToPercentile(risk))}th
              percentile of each player&rsquo;s own games. This drives the ranking above and
              every number below.
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
          aria-label="Risk"
          className="risk-slider"
        />
        <div className="row-between faint">
          <span>Floor</span><span>Typical</span><span>Ceiling</span>
        </div>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <small>Tokens left</small>
          <input
            type="number" min={0} max={99} value={tokens}
            aria-label="Tokens left"
            onChange={(e) => setTokens(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="token-input"
          />
          <span className="faint">{STAGE_LABELS[stage].toLowerCase()} starts with {budget}</span>
        </div>
        <div className="stat-tile">
          <small>Banner as it stands</small>
          <b>{fmt(current)}</b>
          <span className="faint">projected tournament total · best {roleLabel.toLowerCase()}</span>
        </div>
        <div className="stat-tile">
          <small>Starting roll</small>
          <button onClick={rollFresh} style={{ marginTop: 4 }}>Roll a random banner</button>
          <span className="faint">or type yours in below</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>What you hold now</h3>
        <p className="faint">
          Set each emblem to what the game actually gave you. Stats already used
          elsewhere on the banner are hidden — one of each, always.
        </p>
        {staged.map((emblem, index) => {
          const color = BANNER_SLOTS[role][index];
          return (
            <div key={index} className="emblem-row">
              <span className={`dot dot-${color}`} aria-label={color} />
              <select value={emblem.stat} aria-label={`Held emblem ${index + 1} stat`}
                onChange={(e) => update(index, { stat: e.target.value as StatKey })}>
                {availableStats(staged, index, slotOptions).map((stat) => (
                  <option key={stat} value={stat}>{STAT_LABELS[stat]}</option>
                ))}
              </select>
              <select value={emblem.tier} aria-label={`Held emblem ${index + 1} tier`}
                onChange={(e) => update(index, { tier: e.target.value as Tier })}>
                {TIERS.map((tier) => (
                  <option key={tier} value={tier}>{tier} · +{TIER_BONUSES[tier]}%</option>
                ))}
              </select>
              <select value={emblem.trait} aria-label={`Held emblem ${index + 1} trait`}
                title={TRAIT_DESCRIPTIONS[emblem.trait]}
                onChange={(e) => update(index, { trait: e.target.value as Trait })}>
                {TRAITS.map((trait) => (
                  <option key={trait} value={trait}>{trait === "none" ? "—" : trait}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <h3>Options on offer</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} className="btn-primary" disabled={!chosen.length || busy}>
              {busy ? "Simulating…" : `Compare ${chosen.length || ""}`}
            </button>
            <button onClick={() => { setChosen([]); setResults(null); }}>Clear</button>
          </div>
        </div>
        <p className="faint">
          Tick the options the game is showing you — normally three. Each is rolled
          800 times against the banner above.
        </p>
        <div className="option-grid">
          {catalogue.map((action) => (
            <label key={action.id} className={`option-chip ${chosen.includes(action.id) ? "on" : ""}`}>
              <input type="checkbox" checked={chosen.includes(action.id)} onChange={() => toggle(action.id)} />
              <span>{action.label}</span>
              <em className="num">{action.cost}t</em>
            </label>
          ))}
        </div>
      </div>

      {results && <Results results={results} current={current} tokens={tokens} />}

      <p className="notice">
        Token costs and the tier/trait roll distributions are <strong>assumptions</strong> —
        Valve publishes neither and no guide lists them. They live in{" "}
        <code>ACTION_COSTS</code>, <code>TIER_WEIGHTS</code> and <code>TRAIT_WEIGHTS</code> in{" "}
        <code>lib/reroll.ts</code>. Correct them there and every number here follows.
      </p>
    </section>
  );
}

function Results({
  results, current, tokens
}: {
  results: ActionOutcome[];
  current: number;
  tokens: number;
}) {
  const best = results[0];
  const rescued = results.filter((o) => o.delta < 0 && o.planDelta > 0);

  return (
    <div className="stack">
      <h3>Result — best over the whole budget first</h3>
      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Option</th>
              <th style={{ textAlign: "right" }}>Cost</th>
              <th style={{ textAlign: "right" }}>Rolls you can afford</th>
              <th style={{ textAlign: "right" }}>One roll</th>
              <th style={{ textAlign: "right" }}>Improves</th>
              <th style={{ textAlign: "right" }}>Break-even</th>
              <th style={{ textAlign: "right" }}>End of budget</th>
            </tr>
          </thead>
          <tbody>
            {results.map((o, index) => (
              <tr key={o.action.id}>
                <td>
                  {index === 0 && o.planDelta > 0 && (
                    <span className="tag" style={{ marginRight: 6 }}>best</span>
                  )}
                  {o.action.label}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>{o.action.cost}</td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {o.attempts || <span className="faint">can&rsquo;t afford</span>}
                </td>
                <td className="num" style={{ textAlign: "right", color: o.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                  {signed(o.delta)}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>
                  {(o.improveChance * 100).toFixed(0)}%
                </td>
                <td className="num faint" style={{ textAlign: "right" }}>
                  {o.breakEvenAttempts === null
                    ? "never"
                    : `${o.breakEvenAttempts} roll${o.breakEvenAttempts === 1 ? "" : "s"}`}
                </td>
                <td className="num" style={{ textAlign: "right", fontWeight: 650, color: o.planDelta > 0 ? "var(--accent)" : "var(--red)" }}>
                  {signed(o.planDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="verdict">
        {best.planDelta <= 0 ? (
          <>
            <strong>Hold.</strong> None of these beats the {fmt(current)} you already have,
            even with all {tokens} tokens behind them. Bank the tokens.
          </>
        ) : (
          <>
            <strong>Take &ldquo;{best.action.label}&rdquo;.</strong> Committing the budget to it
            is worth {signed(best.planDelta)} over standing pat, reaching {fmt(best.planValue)}.
            {best.breakEvenAttempts !== null && best.breakEvenAttempts > 1 && (
              <> It only pays from the {best.breakEvenAttempts}
                {best.breakEvenAttempts === 2 ? "nd" : best.breakEvenAttempts === 3 ? "rd" : "th"} roll
                onward, so start it only if you mean to keep going.</>
            )}
          </>
        )}
      </div>

      {rescued.length > 0 && (
        <p className="faint" style={{ maxWidth: 720 }}>
          {rescued.length === 1 ? "One option is" : `${rescued.length} options are`} a loss on the
          next roll but a gain by the end of the budget — that is the whole point of the last
          column. You never get a rerolled emblem back, but you do choose after every roll
          whether to stop, so a bad average with a fat upside is worth chasing when you can
          afford to chase it repeatedly.
        </p>
      )}

      <p className="faint" style={{ maxWidth: 720 }}>
        <strong>One roll</strong> is the average change from a single reroll.{" "}
        <strong>End of budget</strong> is what the option is worth if you spend every
        affordable token on it and stop the moment you are happy — always at least zero,
        because holding is allowed. <strong>Break-even</strong> is the first roll at which
        the plan overtakes doing nothing.
      </p>
    </div>
  );
}
