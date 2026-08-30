"use client";

import { useMemo, useState } from "react";
import type { Emblem, PlayerEntry, Trait } from "../lib/fantasy";
import { TRAIT_DESCRIPTIONS } from "../lib/fantasy";
import { Role, STAT_LABELS } from "../lib/scoring";
import { comboValues, entryRecords, traitValues } from "../lib/traitStudy";
import { STAGE_LABELS, type Stage } from "../lib/stages";

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
  entriesByStage, bannersByRole, leagueName
}: {
  entriesByStage: Record<Stage, PlayerEntry[]>;
  bannersByRole: Record<Stage, Record<Role, Emblem[]>>;
  leagueName: string;
}) {
  const [stage, setStage] = useState<Stage>("playoffs");
  const [role, setRole] = useState<Role>("core");

  const entries = entriesByStage[stage] ?? [];
  const banner = bannersByRole[stage][role];
  const pool = useMemo(() => entries.filter((e) => e.role === role), [entries, role]);

  const traits = useMemo(() => traitValues(pool, banner), [pool, banner]);
  const combos = useMemo(() => comboValues(pool, banner), [pool, banner]);
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
  const topTotal = useMemo(() => [...records].sort((a, b) => b.total - a.total).slice(0, 8), [records]);

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
                <th style={{ textAlign: "right" }}>Best</th>
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

      <section className="card stack">
        <h2>The combinations</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr><th>Setup</th><th>What it costs you</th><th style={{ textAlign: "right" }}>Worth</th></tr>
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
          What entries actually banked, under each role&rsquo;s tier III banner. A match is
          the sum of its two best games.
        </p>
        <div className="grid grid-3">
          <Leaderboard title="Biggest single match" rows={topBest} value={(r) => r.bestMatch} />
          <Leaderboard title="Highest per-match average" rows={topMean} value={(r) => r.mean} />
          <Leaderboard title="Most banked over the stage" rows={topTotal} value={(r) => r.total} />
        </div>
      </section>
    </div>
  );
}

function Leaderboard({
  title, rows, value
}: {
  title: string;
  rows: ReturnType<typeof entryRecords>;
  value: (r: ReturnType<typeof entryRecords>[number]) => number;
}) {
  return (
    <div className="sub-card stack" style={{ gap: 6 }}>
      <strong>{title}</strong>
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
