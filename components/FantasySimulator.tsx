"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, rankPlayers, riskToPercentile
} from "../lib/fantasy";
import { BANNER_SLOTS, Role, STAT_DEFINITIONS, STAT_LABELS, StatKey, statsForColor } from "../lib/scoring";
import { actionCatalogue, randomBanner } from "../lib/reroll";
import { OfferDecision, OfferPlan, RosterOffer, planOffers, OPTIONS_DEALT } from "../lib/offers";
import { STAGE_LABELS, STAGE_SLOTS, STAGE_TOKENS, type Stage } from "../lib/stages";
import { seededRandom } from "../lib/rng";
import Info from "./Info";

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
  // One counter. Every option costs one reroll, so "tokens left" and "deals
  // left" were the same number shown twice.
  const [rerolls, setRerolls] = useState<number>(STAGE_TOKENS[stage]);
  const [chosen, setChosen] = useState<string[]>([]);

  // How many times each offer is rolled. More is tighter and slower; the
  // numbers stop moving meaningfully somewhere around 2,000.
  const [results, setResults] = useState<OfferPlan | null>(null);
  const [busy, setBusy] = useState(false);

  // How many random futures to average when valuing "decline and wait". A
  // computation setting, not a game rule, so it is not on the page.
  const FUTURES = 200;

  const slots = STAGE_SLOTS[stage];
  const budget = STAGE_TOKENS[stage];

  const staged = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, banners[r].slice(0, slots)])) as Record<Role, Emblem[]>,
    [banners, slots]
  );

  useEffect(() => { setResults(null); }, [banners, risk, rerolls]);
  useEffect(() => {
    setRerolls(STAGE_TOKENS[stage]);
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

  /**
   * What a banner is worth, with a transposition table.
   *
   * The forward search re-visits the same banner constantly - 59% of lookups in
   * a measured 40-reroll plan were states already seen. Ranking is a pure
   * function of (role, banner) once the shortlist, risk and series counts are
   * fixed, so the answer can be cached. The cache is rebuilt whenever any of
   * those three change, which is what the dependency list is for.
   */
  const valueOf = useMemo(() => {
    const seen = new Map<string, number>();
    return (role: Role, banner: Emblem[]) => {
      let key = role;
      for (const e of banner) key += `|${e.stat}:${e.tier}:${e.trait}`;
      const hit = seen.get(key);
      if (hit !== undefined) return hit;
      const value = rankPlayers(shortlists[role] ?? [], role, banner, risk, seriesByTeam)[0]?.total ?? 0;
      seen.set(key, value);
      return value;
    };
  }, [shortlists, risk, seriesByTeam]);

  const roleValues = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, valueOf(r, staged[r])])) as Record<Role, number>,
    [valueOf, staged]
  );
  const rosterTotal = ROLES.reduce((sum, r) => sum + roleValues[r], 0);

  /**
   * One deal serves all three banners, so the options are a single list rather
   * than one per role. An option that only exists on some banners - "all blue
   * emblems" has no meaning on a Core banner - can still be dealt; it just
   * cannot be applied there.
   */
  const shared = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof actionCatalogue>[number]>();
    for (const role of ROLES) for (const a of catalogue[role]) if (!seen.has(a.id)) seen.set(a.id, a);
    return [...seen.values()];
  }, [catalogue]);

  /**
   * A deal is always exactly three options, so the form has exactly three slots.
   * The constraint is structural rather than a guard on a longer list - there is
   * no fourth box to refuse.
   */
  const setSlot = (index: number, id: string) =>
    setChosen((now) => {
      const next = [now[0] ?? "", now[1] ?? "", now[2] ?? ""];
      next[index] = id;
      return next.filter(Boolean).length === 0 ? [] : next;
    });

  /** The catalogue split by emblem colour, which is how the game groups them. */
  const byColour = useMemo(() => {
    const groups: Record<string, typeof shared> = {};
    for (const a of shared) (groups[a.color] ??= []).push(a);
    return groups;
  }, [shared]);

  const run = () => {
    const picked = chosen.filter(Boolean);
    const options = shared.filter((a) => picked.includes(a.id));
    if (options.length !== OPTIONS_DEALT) return;
    setBusy(true);
    setTimeout(() => {
      setResults(planOffers(staged, options, shared, catalogue, valueOf, rerolls, FUTURES));
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
  const chosenCount = chosen.filter(Boolean).length;

  return (
    <section className="card stack" id="simulator">
      <div className="row-between">
        <div>
          <h2>Fantasy simulator</h2>
          <p className="faint" style={{ marginTop: 2 }}>
            {budget} rerolls for the whole roster — Core, Mid and Support share them,
            and every option costs one. Record the three the game just dealt you and see
            whether any beats waiting for the next deal.
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
          <small>
            Rerolls left{" "}
            <Info title="Rerolls left">
              Every option costs the same — one reroll. There is no price list, so a
              wildcard that moves three emblems costs exactly what rerolling one stat
              costs. The stage grants {STAGE_TOKENS.groupStage} for the group stage and{" "}
              {STAGE_TOKENS.playoffs} for the playoffs.
              <br /><br />
              This is also how many more times you will be dealt three options, and that
              is what sets the bar: with thirty left you can decline a mediocre offer,
              with two left you cannot.
            </Info>
          </small>
          <input
            type="number" min={0} max={60} value={rerolls} aria-label="Rerolls left"
            onChange={(e) => setRerolls(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            className="token-input"
          />
          <span className="faint">three options dealt each time</span>
        </div>
        <div className="stat-tile">
          <small>Roster now</small>
          <b>{fmt(rosterTotal)}</b>
          <span className="faint">
            {ROLES.map((r) => `${ROLE_LABELS[r]} ${fmt(roleValues[r])}`).join(" · ")}
          </span>
        </div>
        <div className="stat-tile">
          <small>Options recorded</small>
          <b>{chosenCount} / {OPTIONS_DEALT}</b>
          <span className="faint">skip is always compared too</span>
        </div>

      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <h3>Options on offer</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={run} className="btn-primary"
                    disabled={chosenCount !== OPTIONS_DEALT || busy}>
              {busy
                ? "Simulating…"
                : chosenCount === OPTIONS_DEALT
                  ? "Compare all three"
                  : `Fill ${OPTIONS_DEALT - chosenCount} more`}
            </button>
            <button onClick={() => { setChosen([]); setResults(null); }}>Clear</button>
          </div>
        </div>
        <p className="faint">
          Record the <strong>three options the game is showing you</strong>, one per slot.
          They are the same three for every banner, so the answer is a pair: which option,
          and which banner to spend it on. Using one replaces all three, so declining means
          stopping rather than waiting.
        </p>
        <div className="offer-slots">
          {[0, 1, 2].map((i) => {
            const value = chosen[i] ?? "";
            const taken = chosen.filter((id, j) => id && j !== i);
            return (
              <label key={i} className={`offer-slot ${value ? "on" : ""}`}>
                <span className="offer-slot-n">{i + 1}</span>
                <select
                  value={value}
                  aria-label={`Option ${i + 1} the game dealt`}
                  onChange={(e) => { setSlot(i, e.target.value); setResults(null); }}
                >
                  <option value="">— pick the option —</option>
                  {Object.entries(byColour).map(([colour, actions]) => (
                    <optgroup key={colour} label={colour === "any" ? "Wildcards" : `${colour} emblems`}>
                      {actions.map((a) => (
                        <option key={a.id} value={a.id} disabled={taken.includes(a.id)}>
                          {a.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      {results && (
        <Results
          plan={results}
          onSpend={() => {
            // Using an option replaces all three, so the slots go back to empty
            // for whatever the game deals next.
            setRerolls((r) => Math.max(0, r - 1));
            setChosen([]);
            setResults(null);
          }}
          rerolls={rerolls}
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
                    title={STAT_DEFINITIONS[emblem.stat]}
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

function Results({
  plan, rerolls, onSpend
}: {
  plan: OfferPlan;
  rerolls: number;
  onSpend: () => void;
}) {
  const best = plan.decisions[0];
  const worthTaking = best && best.edge > 0;

  /**
   * One row per option, not one per option-and-banner.
   *
   * A deal is three options; the model scores each against every banner it can
   * legally go on, which is up to nine pairs. Listing all nine reads as though
   * the game dealt nine. So each option gets its best banner as the row, and the
   * runners-up are named beside it.
   */
  const bestPerOption = Object.values(
    plan.decisions.reduce<Record<string, OfferDecision>>((acc, d) => {
      if (!acc[d.action.id] || d.edge > acc[d.action.id].edge) acc[d.action.id] = d;
      return acc;
    }, {})
  ).sort((a, b) => b.edge - a.edge);

  /**
   * How many pairs the model cannot separate from the leader.
   *
   * When the field is this close, naming one of them "best" claims a precision
   * the search does not have - the lead is smaller than its own error bar. Say
   * they are equivalent and let the player pick on something else.
   */
  const tiedCount = plan.decisions.filter((d) => d.tied && d.edge > 0).length;

  const alternatives = (d: OfferDecision) =>
    plan.decisions
      .filter((x) => x.action.id === d.action.id && x.role !== d.role)
      .sort((a, b) => b.edge - a.edge);

  return (
    <div className="stack">
      <h3>Take one, or wait for the next deal</h3>

      <div className="stat-tiles">
        <div className="stat-tile">
          <small>Roster now</small>
          <b>{fmt(plan.current)}</b>
          <span className="faint">before anything</span>
        </div>
        <div className="stat-tile">
          <small>
            If you stop{" "}
            <Info title="If you stop">
              What the roster is worth if you use none of these. The three options only
              change when one is used, so declining is not waiting for something better —
              it is stopping. That makes this simply what you already hold.
            </Info>
          </small>
          <b>{fmt(plan.skipValue)}</b>
          <span className="faint">{plan.rounds} rerolls unspent</span>
        </div>
        <div className="stat-tile">
          <small>Verdict</small>
          <b style={{ color: worthTaking ? "var(--accent)" : "var(--muted)" }}>
            {!worthTaking ? "Decline" : tiedCount ? "Take any" : "Take one"}
          </b>
          <span className="faint">
            {!worthTaking
              ? "none of them beat what you hold"
              : tiedCount
                ? `${tiedCount + 1} pairs too close to separate`
                : `${signed(best.edge)} over stopping`}
          </span>
        </div>
      </div>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Option</th><th>Apply to</th>
              <th style={{ textAlign: "right" }}>
                If you take it <Info title="If you take it" align="right">
                  Where the roster ends up if you spend a reroll on this pair and then keep
                  going with the {plan.rounds - 1} you have left, taking whatever the
                  reshuffles offer while it still helps.
                </Info>
              </th>
              <th style={{ textAlign: "right" }}>
                Against stopping <Info title="Against stopping" align="right">
                  Taking it minus keeping what you hold. Using a reroll is also the only
                  way to see three new options, so a pair can be worth taking for the
                  reshuffle even when the option itself is unremarkable.
                </Info>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bestPerOption.map((d, index) => (
              <tr key={`${d.role}:${d.action.id}`}>
                <td>
                  {index === 0 && d.edge > 0 && !tiedCount && (
                    <span className="tag" style={{ marginRight: 6 }}>best</span>
                  )}
                  {(d.tied || (index === 0 && tiedCount > 0)) && d.edge > 0 && (
                    <span className="tag tag-tied" style={{ marginRight: 6 }}>tied</span>
                  )}
                  {d.action.label}
                </td>
                <td className="muted">
                  {ROLE_LABELS[d.role]}
                  <span className="faint" style={{ display: "block", fontSize: "0.72rem" }}>
                    {d.runsUsed.toLocaleString()} play-outs
                  </span>
                  {alternatives(d).length > 0 && (
                    <span className="faint" style={{ display: "block", fontSize: "0.78rem" }}>
                      or {alternatives(d).map((a) => `${ROLE_LABELS[a.role]} ${signed(a.edge)}`).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="num" style={{ textAlign: "right" }}>{fmt(d.takeValue)}</td>
                <td className="num" style={{
                  textAlign: "right", fontWeight: 650,
                  color: d.edge > 0 ? "var(--accent)" : "var(--red)"
                }}>
                  {signed(d.edge)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button onClick={onSpend} disabled={rerolls <= 0}
                    title="Spend one reroll — press once you have taken it in game">
                    Take
                  </button>
                </td>
              </tr>
            ))}
            <tr className="row-skip">
              <td>Stop — keep what you have</td>
              <td className="muted">—</td>
              <td className="num" style={{ textAlign: "right" }}>{fmt(plan.skipValue)}</td>
              <td className="num muted" style={{ textAlign: "right" }}>—</td>
              <td style={{ textAlign: "right" }}>
                <span className="faint">costs nothing</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="verdict">
        {worthTaking ? (
          <>
            <strong>Take &ldquo;{best.action.label}&rdquo;</strong> and apply it to{" "}
            <strong>{ROLE_LABELS[best.role]}</strong> — worth {signed(best.edge)} against
            keeping what you hold.
          </>
        ) : (
          <>
            <strong>Stop here.</strong> None of the three improves any banner enough to be
            worth a reroll, and spending one is the only way to see different options — so
            there is nothing to wait for. Your {plan.rounds} remaining rerolls are better
            unspent than spent making a banner worse.
          </>
        )}
      </div>

      <p className="faint" style={{ maxWidth: 740 }}>
        Each figure assumes you keep rerolling afterwards while it still helps, over{" "}
        {plan.runs} simulated futures — what the reshuffles turn up is genuinely random,
        so there is nothing to enumerate. The play-out never pays a small loss just to
        reshuffle, so these are a floor: a perfect player would sometimes burn a reroll on
        the least-bad option to see three new ones, and finish slightly ahead of this.
      </p>
    </div>
  );
}
