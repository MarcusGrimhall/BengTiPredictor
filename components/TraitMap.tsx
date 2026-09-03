"use client";

import { useMemo, useState } from "react";
import type { Emblem, PlayerEntry, Trait } from "../lib/fantasy";
import { TRAIT_DESCRIPTIONS } from "../lib/fantasy";
import { Role, STAT_LABELS } from "../lib/scoring";
import { comboValues, entryRecords, traitValues } from "../lib/traitStudy";
import type { bestTraitArrangement } from "../lib/traitStudy";
import { STAGE_LABELS, type Stage } from "../lib/stages";
import Info from "./Info";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1)}%`;

/** Green for a gain, red for a loss, strength by size. Capped so one outlier
 *  does not wash the rest of the grid out. */
function heat(value: number, max: number): string {
  if (Math.abs(value) < 0.001) return "transparent";
  const t = Math.min(1, Math.abs(value) / Math.max(0.001, max));
  const alpha = 0.12 + t * 0.55;
  return value > 0 ? `rgba(95, 184, 122, ${alpha})` : `rgba(224, 92, 92, ${alpha})`;
}

export default function TraitMap({
  entriesByStage, bannersByRole, bestTraitsByRole, leagueName
}: {
  entriesByStage: Record<Stage, PlayerEntry[]>;
  bannersByRole: Record<Stage, Record<Role, Emblem[]>>;
  bestTraitsByRole: Record<Stage, Record<Role, ReturnType<typeof bestTraitArrangement>>>;
  leagueName: string;
}) {
  const [stage, setStage] = useState<Stage>("playoffs");
  const [role, setRole] = useState<Role>("core");

  const entries = entriesByStage[stage] ?? [];
  const banner = bannersByRole[stage][role];
  const pool = useMemo(() => entries.filter((e) => e.role === role), [entries, role]);

  const traits = useMemo(() => traitValues(pool, banner), [pool, banner]);
  const combos = useMemo(() => comboValues(pool, banner), [pool, banner]);
  // Every arrangement checked, not searched - 7,776 at five emblems, which is
  // why it is handed down already solved rather than run here: recomputing it
  // per role or stage click froze the main thread for a quarter of a second.
  const bestTraits = bestTraitsByRole[stage][role];
  const maxTrait = useMemo(
    () => Math.max(0.01, ...traits.flatMap((t) => t.bySlot.map(Math.abs))),
    [traits]
  );

  // Per-entry trait value: what each trait is worth to each duo specifically.
  const perEntry = useMemo(() => {
    const plain = banner.map((e) => ({ ...e, trait: "none" as Trait }));
    return pool.map((entry) => {
      const single = [entry];
      const base = traitValues(single, plain);
      return {
        entry,
        values: base.map((t) => ({ trait: t.trait, best: t.best, slot: t.bestSlot }))
      };
    });
  }, [pool, banner]);

  const maxPerEntry = useMemo(
    () => Math.max(0.01, ...perEntry.flatMap((r) => r.values.map((v) => Math.abs(v.best)))),
    [perEntry]
  );

  const records = useMemo(
    () => entryRecords(entries, (r) => bannersByRole[stage][r]),
    [entries, bannersByRole, stage]
  );
  const topBest = useMemo(() => [...records].sort((a, b) => b.bestMatch - a.bestMatch).slice(0, 8), [records]);
  const topMean = useMemo(() => [...records].sort((a, b) => b.mean - a.mean).slice(0, 8), [records]);
  const topFloor = useMemo(() => [...records].sort((a, b) => b.worst - a.worst).slice(0, 8), [records]);

  const traitNames = traits.map((t) => t.trait);

  return (
    <div className="stack">
      <section className="card-tight stage-bar">
        <div className="pill-row" role="tablist" aria-label="Stage">
          {(["groupStage", "playoffs"] as Stage[]).map((s) => (
            <button key={s} className="pill" role="tab" aria-pressed={stage === s}
              onClick={() => setStage(s)} disabled={!(entriesByStage[s] ?? []).length}>
              {STAGE_LABELS[s]}
            </button>
          ))}
          <span style={{ width: 12 }} />
          {ROLES.map((r) => (
            <button key={r} className="pill" role="tab" aria-pressed={role === r}
              onClick={() => setRole(r)}>{ROLE_LABELS[r]}</button>
          ))}
        </div>
        <p className="faint" style={{ margin: 0 }}>
          Measured on {leagueName} · {STAGE_LABELS[stage].toLowerCase()} · {pool.length}{" "}
          {role === "mid" ? "players" : "duos"}, against the banner{" "}
          <strong>{banner.map((e) => STAT_LABELS[e.stat]).join(" · ")}</strong> at tier III.
        </p>
      </section>

      <section className="card stack">
        <div>
          <h2>What a trait is worth, by slot</h2>
          <p className="faint" style={{ marginTop: 2, maxWidth: 720 }}>
            A trait&rsquo;s printed effect is not its value. Vampiric reads +50% to itself
            and −10% to its neighbours, but what that comes to depends entirely on which
            emblem it lands on. Every figure below is the real gain against the same
            banner with no traits at all.
          </p>
          <p className="faint" style={{ maxWidth: 720 }}>
            Slots are positions, not stats. What a trait is worth in slot 3 depends on
            where it sits relative to its neighbours, not on which stat happens to be
            there — that is what makes it a property of the trait rather than of the
            banner.
          </p>
        </div>
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Trait</th>
                {banner.map((_, i) => (
                  <th key={i} style={{ textAlign: "center" }}>slot {i + 1}</th>
                ))}
                <th style={{ textAlign: "right" }}>
                  Best <Info title="Best slot" align="right">
                    The most this trait can do, and where. Traits that reach neighbours are
                    worth most at an end of the banner, where they have fewer neighbours to
                    penalise — or in the middle, where they have more to help.
                  </Info>
                </th>
              </tr>
            </thead>
            <tbody>
              {traits.map((t) => (
                <tr key={t.trait}>
                  <td title={TRAIT_DESCRIPTIONS[t.trait]}>
                    <strong>{t.trait}</strong>
                    <br /><span className="faint" style={{ fontSize: "0.78rem" }}>
                      {TRAIT_DESCRIPTIONS[t.trait]}
                    </span>
                  </td>
                  {t.bySlot.map((v, i) => (
                    <td key={i} className="num" style={{ textAlign: "center", background: heat(v, maxTrait) }}>
                      {Math.abs(v) < 0.001 ? <span className="faint">—</span> : pct(v)}
                    </td>
                  ))}
                  <td className="num" style={{ textAlign: "right", fontWeight: 650, color: t.best > 0 ? "var(--accent)" : "var(--muted)" }}>
                    {t.best > 0 ? `${pct(t.best)} @ ${t.bestSlot + 1}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ maxWidth: 720 }}>
          Fractal and Friendly read zero because a single one of either never meets its
          own condition. They are not weak — they are the two that only pay as a plan,
          and building that plan costs tokens.
        </p>
      </section>

      {bestTraits && (
        <section className="card stack">
          <div className="row-between">
            <h2>The best arrangement there is</h2>
            <span className="tag tag-solid">
              all {Math.pow(6, banner.length).toLocaleString("en-US")} checked
            </span>
          </div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Slot</th>
                  {banner.map((_, i) => <th key={i} style={{ textAlign: "center" }}>{i + 1}</th>)}
                  <th style={{ textAlign: "right" }}>Worth</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="muted">Trait</td>
                  {bestTraits.traits.map((t, i) => (
                    <td key={i} style={{ textAlign: "center", textTransform: "capitalize" }}>
                      {t === "none" ? <span className="faint">—</span> : <strong>{t}</strong>}
                    </td>
                  ))}
                  <td className="num" style={{ textAlign: "right", fontWeight: 650, color: "var(--accent)" }}>
                    {pct(bestTraits.gain)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ maxWidth: 740 }}>
            Best <em>across every entry in the role</em> — a property of the arrangement
            rather than of one duo. The Fantasy page optimises something slightly
            different: the single entry you would actually pick, which can prefer a
            different arrangement.
            <br /><br />
            It changes with the number of emblems <em>and</em> with the role, so there is
            no single right answer to carry between banners.
            <br /><br />
            Bonuses <strong>add</strong>, they do not compound. A tier V is +150% and a
            Friendly is +50%, so together they are +200% — a ×3.00 multiplier, not
            ×2.50 × ×1.50. That is why spreading beats stacking: putting a second bonus on
            an already-large emblem buys the same flat percentage it would buy anywhere.
            <br /><br />
            On three emblems that makes all-Friendly hard to beat — a flat ×3.00 on every
            slot. On five it usually is not: swapping one Friendly for a Benevolent trades
            that slot&rsquo;s +50% for +20% on each of its two neighbours, which pays when
            the neighbours out-earn it. The optimiser puts the Benevolent on the weakest
            emblem for exactly that reason.
          </p>
        </section>
      )}

      <section className="card stack">
        <h2>The combinations</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Setup</th>
                <th>What it costs you</th>
                <th style={{ textAlign: "right" }}>
                  Worth <Info title="Worth" align="right">
                    The gain against the same banner with no traits at all. These are the
                    only traits that pay as a plan rather than on their own, and building
                    the plan costs reroll tokens.
                  </Info>
                </th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => (
                <tr key={c.label}>
                  <td><strong>{c.label}</strong></td>
                  <td className="muted">{c.detail}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 650, color: c.value >= 0 ? "var(--accent)" : "var(--red)" }}>
                    {pct(c.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2>Every {role === "mid" ? "player" : "duo"}, every trait</h2>
          <p className="faint" style={{ marginTop: 2 }}>
            The best each trait can do for each entry, on its best slot. A trait is worth
            more to an entry whose scoring is concentrated in one emblem than to one that
            spreads it evenly.
          </p>
        </div>
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>{role === "mid" ? "Player" : "Duo"}</th>
                <th>Team</th>
                {traitNames.map((t) => (
                  <th key={t} style={{ textAlign: "center", textTransform: "capitalize" }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perEntry.map(({ entry, values }) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td className="muted">{entry.teamName}</td>
                  {values.map((v) => (
                    <td key={v.trait} className="num" style={{ textAlign: "center", background: heat(v.best, maxPerEntry) }}>
                      {Math.abs(v.best) < 0.001 ? <span className="faint">—</span> : pct(v.best)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2>Records · {STAGE_LABELS[stage]}</h2>
        <p className="faint">
          What entries actually banked, under each role&rsquo;s best stats at tier III. A
          series is the sum of its two best games, and a period pays the best series.
        </p>
        <div className="grid grid-3">
          <Leaderboard title="What the period paid" rows={topBest} value={(r) => r.bestMatch}
            help="An entry's best single series — which is exactly what a period banks. Not a sum over the stage: playing more series is more attempts at one number, not a bigger total." />
          <Leaderboard title="Average series" rows={topMean} value={(r) => r.mean}
            help="Mean across all of an entry's series. Says how good a typical night was, rather than the one that counted." />
          <Leaderboard title="Highest floor" rows={topFloor} value={(r) => r.worst}
            help="Their weakest series. A high floor means the good result was not a single spike." />
        </div>
      </section>
    </div>
  );
}

function Leaderboard({
  title, rows, value, help
}: {
  title: string;
  rows: ReturnType<typeof entryRecords>;
  value: (r: ReturnType<typeof entryRecords>[number]) => number;
  help: string;
}) {
  return (
    <div className="sub-card stack" style={{ gap: 6 }}>
      <strong>{title} <Info title={title}>{help}</Info></strong>
      {rows.map((r, i) => (
        <div key={r.entry.id} className="row-between" style={{ fontSize: "0.86rem", gap: 8 }}>
          <span style={{ minWidth: 0 }}>
            <span className="faint">{i + 1}. </span>
            {r.entry.name.length > 26 ? `${r.entry.name.slice(0, 25)}…` : r.entry.name}
            <span className="faint"> · {r.role}</span>
          </span>
          <span className="num" style={{ fontWeight: 650, whiteSpace: "nowrap" }}>{fmt(value(r))}</span>
        </div>
      ))}
    </div>
  );
}
