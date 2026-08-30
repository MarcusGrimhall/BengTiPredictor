"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, rankPlayers, riskToPercentile
} from "../lib/fantasy";
import { BANNER_SLOTS, Role, STAT_LABELS, StatKey, statsForColor } from "../lib/scoring";
import { actionCatalogue, randomBanner } from "../lib/reroll";
import { OfferPlan, RosterOffer, planOffers } from "../lib/offers";
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
  const [tokens, setTokens] = useState<number>(STAGE_TOKENS[stage]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [offerRole, setOfferRole] = useState<Role>("core");
  // How many times each offer is rolled. More is tighter and slower; the
  // numbers stop moving meaningfully somewhere around 2,000.
  const [runs, setRuns] = useState(800);
  const [results, setResults] = useState<OfferPlan | null>(null);
  // How many more times the game will deal you three options. The stage grants
  // 40 tokens for the group stage and 30 for the playoffs, and a reroll is
  // taken to cost one, so the default is the token count. Editable because the
  // per-action costs are not published and may not all be one.
  const [rounds, setRounds] = useState(STAGE_TOKENS[stage]);
  const [busy, setBusy] = useState(false);

  const slots = STAGE_SLOTS[stage];
  const budget = STAGE_TOKENS[stage];

  const staged = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, banners[r].slice(0, slots)])) as Record<Role, Emblem[]>,
    [banners, slots]
  );

  useEffect(() => { setResults(null); }, [banners, risk, tokens, runs, rounds]);
  useEffect(() => {
    setTokens(STAGE_TOKENS[stage]);
    setRounds(STAGE_TOKENS[stage]);
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
    setBusy(true);
    setTimeout(() => {
      setResults(planOffers(staged, offers, catalogue, valueOf, tokens, rounds, Math.max(60, Math.round(runs / 4))));
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
          <small>
            Deals left{" "}
            <Info title="Deals left" align="right">
              How many more times the game will deal you three options. This is what
              decides whether an offer is worth taking: with thirty deals left you can
              decline a mediocre one, with two left you cannot.
              <br /><br />
              Defaults to the stage&rsquo;s token count — {STAGE_TOKENS.groupStage} for the
              group stage, {STAGE_TOKENS.playoffs} for the playoffs — which assumes a
              reroll costs one token. Editable because the per-action costs are not
              published, so that assumption is not verified.
            </Info>
          </small>
          <input
            type="number" min={1} max={60} value={rounds} aria-label="Deals left"
            onChange={(e) => setRounds(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            className="token-input"
          />
          <span className="faint">three random options per deal</span>
        </div>
        <div className="stat-tile">
          <small>
            Accuracy{" "}
            <Info title="Accuracy" align="right">
              What comes up in future deals is random, so the value of declining an offer
              has to be estimated by playing the rest out many times and averaging. This is
              how many times. More is steadier and slower.
            </Info>
          </small>
          <select value={runs} onChange={(e) => setRuns(Number(e.target.value))}
            aria-label="How many futures to simulate" className="token-input">
            <option value={200}>rough</option>
            <option value={800}>normal</option>
            <option value={2000}>fine</option>
            <option value={8000}>very fine</option>
          </select>
          <span className="faint">futures simulated per option</span>
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
          Tick the <strong>three options the game just dealt you</strong>, on whichever
          banners they landed. The question is not which is best in the abstract — it is
          whether any of them beats declining and seeing the next deal — and with{" "}
          {rounds} deals left that bar is high.
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
          plan={results}
          onSpend={(cost) => {
            setTokens((t) => Math.max(0, t - cost));
            setRounds((r) => Math.max(1, r - 1));
          }}
          tokens={tokens}
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

function Results({
  plan, tokens, onSpend
}: {
  plan: OfferPlan;
  tokens: number;
  onSpend: (cost: number) => void;
}) {
  const best = plan.decisions[0];
  const worthTaking = best && best.edge > 0;

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
            If you decline{" "}
            <Info title="If you decline">
              What the roster is worth if you take none of these and play the remaining{" "}
              {plan.rounds} deals out. It is far above what you hold now, because more
              offers are coming and some of them will be good. That is the number every
              offer has to beat.
            </Info>
          </small>
          <b>{fmt(plan.skipValue)}</b>
          <span className="faint">over {plan.rounds} more deals</span>
        </div>
        <div className="stat-tile">
          <small>Verdict</small>
          <b style={{ color: worthTaking ? "var(--accent)" : "var(--muted)" }}>
            {worthTaking ? "Take one" : "Decline"}
          </b>
          <span className="faint">
            {worthTaking ? `${signed(best.edge)} over waiting` : "none of them beat waiting"}
          </span>
        </div>
      </div>

      <div className="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Banner</th><th>Offer</th>
              <th style={{ textAlign: "right" }}>
                Cost <Info title="Cost">Tokens this costs. The three banners share one pool.</Info>
              </th>
              <th style={{ textAlign: "right" }}>
                If you take it <Info title="If you take it" align="right">
                  What the roster ends up worth if you take this now and then play the
                  remaining deals out. It already includes everything you expect to gain
                  from future offers, which is why it is close to the decline figure.
                </Info>
              </th>
              <th style={{ textAlign: "right" }}>
                Against waiting <Info title="Against waiting" align="right">
                  Taking it minus declining. Positive means this offer is better than the
                  next deal is expected to be. Small numbers are normal — one offer out of
                  many rarely decides a card.
                </Info>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plan.decisions.map((d, index) => (
              <tr key={`${d.role}:${d.action.id}`}>
                <td className="muted">{ROLE_LABELS[d.role]}</td>
                <td>
                  {index === 0 && d.edge > 0 && (
                    <span className="tag" style={{ marginRight: 6 }}>best</span>
                  )}
                  {d.action.label}
                </td>
                <td className="num muted" style={{ textAlign: "right" }}>{d.action.cost}</td>
                <td className="num" style={{ textAlign: "right" }}>{fmt(d.takeValue)}</td>
                <td className="num" style={{
                  textAlign: "right", fontWeight: 650,
                  color: d.edge > 0 ? "var(--accent)" : "var(--red)"
                }}>
                  {signed(d.edge)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button onClick={() => onSpend(d.action.cost)} disabled={d.action.cost > tokens}
                    title={`Deduct ${d.action.cost} tokens and one deal — press once you have taken it in game`}>
                    Take
                  </button>
                </td>
              </tr>
            ))}
            <tr className="row-skip">
              <td className="muted">—</td>
              <td>Skip — wait for the next deal</td>
              <td className="num muted" style={{ textAlign: "right" }}>0</td>
              <td className="num" style={{ textAlign: "right" }}>{fmt(plan.skipValue)}</td>
              <td className="num muted" style={{ textAlign: "right" }}>—</td>
              <td style={{ textAlign: "right" }}>
                <button onClick={() => onSpend(0)} title="Costs nothing, but uses up a deal">
                  Take
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="verdict">
        {worthTaking ? (
          <>
            <strong>Take &ldquo;{best.action.label}&rdquo;</strong> on{" "}
            <strong>{ROLE_LABELS[best.role]}</strong> — worth {signed(best.edge)} against
            declining and waiting for the next deal.
          </>
        ) : (
          <>
            <strong>Decline all three.</strong> With {plan.rounds} deals still to come,
            waiting is worth {fmt(plan.skipValue)} and none of these beats it. Skipping
            costs no tokens.
          </>
        )}
      </div>

      <p className="faint" style={{ maxWidth: 740 }}>
        Every figure here already assumes you keep playing afterwards, which is why they
        cluster: one offer out of {plan.rounds} rarely decides a card. The value of
        declining is simulated over {plan.runs} random futures per option, because what
        comes up next genuinely is random — there is nothing to enumerate. The play-out
        policy is greedy, so the decline figure is a floor: a perfect player would
        sometimes pass on a small gain to keep tokens, and do slightly better than shown.
      </p>
    </div>
  );
}
