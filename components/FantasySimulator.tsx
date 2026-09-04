"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, bestTotal, rankPlayers, riskToPercentile
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
// the historical 10th percentile and risk 100 the 95th; neither is a calibrated
// forecast bound. The backtest found both to be worse picks than the middle of
// the range, so the ends must be dragged to deliberately.
const RISK_LABELS: Array<{ at: number; label: string; hint: string }> = [
  { at: 25, label: "Conservative", hint: "the lower end of recorded results" },
  { at: 50, label: "Balanced", hint: "the middle of recorded results" },
  { at: 75, label: "Upside", hint: "the upper end of recorded results" }
];

export function riskLabel(risk: number) {
  if (risk <= 37) return RISK_LABELS[0];
  if (risk >= 63) return RISK_LABELS[2];
  return RISK_LABELS[1];
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
      // bestTotal, not rankPlayers: this needs the top entry's score and
      // nothing else, and rankPlayers builds a full breakdown per entry to get
      // there. Same number, 5.2x cheaper - see lib/fantasy.ts.
      const value = bestTotal(shortlists[role] ?? [], role, banner, risk, seriesByTeam);
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
            whether any is worth using now.
          </p>
        </div>
        <span className="tag">{STAGE_LABELS[stage]} · {slots} emblems</span>
      </div>

      <div className="sub-card stack">
        <div className="row-between">
          <div>
            <h3>Risk</h3>
            <p className="faint" style={{ marginTop: 2 }}>
              {info.label} — {info.hint}. Reading the historical{" "}
              {Math.round(riskToPercentile(risk))}th percentile; this is not a
              calibrated probability for the next event.
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
          <span>Historical low</span><span>Typical</span><span>Historical high</span>
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
              This is how many more actions or full refreshes you can pay for.
            </Info>
          </small>
          <input
            type="number" min={0} max={60} value={rerolls} aria-label="Rerolls left"
            onChange={(e) => setRerolls(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            className="token-input"
          />
          <span className="faint">shared across all three banners</span>
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
          <span className="faint">take none is always compared too</span>
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
          and which banner to spend it on. Using one replaces all three. Taking none costs
          nothing and leaves the same three options on the table.
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
          onRefresh={() => {
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
                      <option key={trait} value={trait}>{trait}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="notice">
        Tier and trait roll probabilities are <strong>assumptions</strong> because
        their weights are not published. Every offered action costs one token.
      </p>
    </section>
  );
}

function Results({
  plan, rerolls, onSpend, onRefresh
}: {
  plan: OfferPlan;
  rerolls: number;
  onSpend: () => void;
  onRefresh: () => void;
}) {
  /**
   * Depth of evidence first, then the mean.
   *
   * The same rule `lib/offers.ts` sorts its decisions by, and it has to be the
   * same rule or the page contradicts itself. Sequential halving leaves the
   * survivors with several times the play-outs of the pairs it dropped early,
   * so their averages are not measured to the same precision: a pair eliminated
   * on 66 runs can post a flattering mean that one measured over 343 would
   * never sustain. Ranking those two by mean alone rewards the noisier estimate.
   */
  const byEvidence = (a: OfferDecision, b: OfferDecision) =>
    b.runsUsed - a.runsUsed || b.edge - a.edge;

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
      if (!acc[d.action.id] || byEvidence(d, acc[d.action.id]) < 0) acc[d.action.id] = d;
      return acc;
    }, {})
  ).sort(byEvidence);

  // Taken from the same ordered list the table renders, so the sentence below
  // and the "best" tag in the table cannot name different options. They could
  // before: this was plan.decisions[0], ordered by evidence, while the table
  // was ordered by mean.
  const best = bestPerOption[0];
  // Every option is already scored against refreshing, so "worth taking" is
  // simply beating that - and refreshing wins by default when none of them do.
  const worthTaking = Boolean(best && best.edge > 0);
  const refreshBest = rerolls > 0 && !worthTaking && plan.refreshEdge > 0;

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
      .sort(byEvidence);

  return (
    <div className="stack">
      <h3>Take one, refresh, or take none</h3>

      <div className="stat-tiles">
        <div className="stat-tile">
          <small>Roster now</small>
          <b>{fmt(plan.current)}</b>
          <span className="faint">before anything</span>
        </div>
        <div className="stat-tile">
          <small>
            If you take none{" "}
            <Info title="If you take none">
              What the roster is worth if you use none of these. It costs nothing and the
              same three options remain available. This is simply what you already hold.
            </Info>
          </small>
          <b>{fmt(plan.skipValue)}</b>
          <span className="faint">{plan.rounds} rerolls unspent</span>
        </div>
        <div className="stat-tile">
          <small>Verdict</small>
          <b style={{ color: worthTaking || refreshBest ? "var(--accent)" : "var(--muted)" }}>
            {refreshBest ? "Refresh" : !worthTaking ? "Take none" : tiedCount ? "Take any" : "Take one"}
          </b>
          <span className="faint">
            {refreshBest
              ? `${signed(plan.refreshEdge)} over taking none`
              : !worthTaking
              ? "none of them beat what you hold"
              : tiedCount
                ? `${tiedCount + 1} pairs too close to separate`
                : `${signed(best.edge)} over taking none`}
          </span>
        </div>
      </div>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Option</th><th>Apply to</th>
              <th style={{ textAlign: "right" }}>
                Right away <Info title="Right away" align="right">
                  What applying it does to the roster this instant, before any further
                  rolls. This is the damage you actually take on. A long budget repairs
                  most mistakes, so the column on the right can read as a wash while this
                  one is deeply negative — at all tier V every quality reroll is a certain
                  loss now, because a reroll never returns the tier it replaced.
                </Info>
              </th>
              <th style={{ textAlign: "right" }}>
                If you take it <Info title="If you take it" align="right">
                  Where the roster ends up if you spend a reroll on this pair and then keep
                  going with the {plan.rounds - 1} you have left, taking whatever the
                  reshuffles offer while it still helps. The smaller figure beneath is the
                  10th percentile — the future where the repair never turns up.
                </Info>
              </th>
              <th style={{ textAlign: "right" }}>
                Against refreshing <Info title="Against refreshing" align="right">
                  Taking it minus spending the same token on a refresh, which changes no
                  banner and deals three new options. Refreshing is the fair comparison
                  because it costs exactly the same and leaves you equally free
                  afterwards; measuring against standing pat instead made every option
                  score the value of playing at all, which is the same for all of them.
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
                  {d.improveChance === 0 && (
                    <span className="faint" style={{ display: "block", fontSize: "0.72rem" }}>
                      cannot improve — every outcome is worse
                    </span>
                  )}
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
                <td className="num" style={{
                  textAlign: "right", fontWeight: 650,
                  color: d.immediateDelta > 0 ? "var(--accent)"
                    : d.immediateDelta < 0 ? "var(--red)" : "var(--muted)"
                }}>
                  {signed(d.immediateDelta)}
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {fmt(d.takeValue)}
                  <span className="faint" style={{ display: "block", fontSize: "0.72rem" }}>
                    bad case {fmt(d.downside)}
                  </span>
                </td>
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
              <td>Refresh all three</td>
              <td className="muted">no banner changes</td>
              <td className="num muted" style={{ textAlign: "right" }}>±0</td>
              <td className="num" style={{ textAlign: "right" }}>{fmt(plan.refreshValue)}</td>
              <td className="num muted" style={{ textAlign: "right" }} title="Every option above is measured against this row">
                baseline
              </td>
              <td style={{ textAlign: "right" }}>
                <button onClick={onRefresh} disabled={rerolls <= 0}
                  title="Spend one token to replace all three options">
                  Refresh
                </button>
              </td>
            </tr>
            <tr className="row-skip">
              <td>Take none — stop here</td>
              <td className="muted">unspent tokens expire</td>
              <td className="num muted" style={{ textAlign: "right" }}>±0</td>
              <td className="num" style={{ textAlign: "right" }}>{fmt(plan.skipValue)}</td>
              <td className="num" style={{
                textAlign: "right", fontWeight: 650,
                color: plan.skipValue - plan.baseline < 0 ? "var(--red)" : "var(--muted)"
              }}>
                {signed(plan.skipValue - plan.baseline)}
              </td>
              <td style={{ textAlign: "right" }}>
                <span className="faint">costs nothing</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="verdict">
        {refreshBest ? (
          <>
            <strong>Refresh all three.</strong> None of these three beats spending the
            same token on a new deal, which is worth {signed(plan.refreshEdge)} over
            stopping and changes no banner.
          </>
        ) : worthTaking ? (
          <>
            <strong>Take &ldquo;{best.action.label}&rdquo;</strong> and apply it to{" "}
            <strong>{ROLE_LABELS[best.role]}</strong> — worth {signed(best.edge)} over
            refreshing instead.
            {best.immediateDelta < 0 && (
              <>
                {" "}It still costs you <strong>{signed(best.immediateDelta)}</strong> the
                moment you apply it; it comes out ahead only because you have{" "}
                {plan.rounds - 1} rerolls left to repair it.
              </>
            )}
          </>
        ) : (
          <>
            <strong>Take none.</strong> Nothing on the table, and no refresh, is worth a
            token. They remain available and nothing is spent.
          </>
        )}
      </div>

      <p className="faint" style={{ maxWidth: 740 }}>
        <strong>If you take it</strong> and <strong>Against refreshing</strong> both assume
        you keep rerolling afterwards while it still helps, over {plan.runs} simulated
        futures — what the reshuffles turn up is genuinely random, so there is nothing to
        enumerate. They are averages, and an average repairs mistakes it should not always
        get to repair, so read <strong>Right away</strong> and <strong>bad case</strong>
        {" "}beside them. Refresh spends one token, preserves every banner and replaces all
        three options.
      </p>
    </div>
  );
}
