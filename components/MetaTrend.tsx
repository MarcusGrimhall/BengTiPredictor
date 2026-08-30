"use client";

import { useMemo, useState } from "react";
import type { StatPeriod } from "../lib/metaTrend";
import { statTrend } from "../lib/metaTrend";
import { Role, STAT_COLORS, STAT_LABELS, StatKey } from "../lib/scoring";
import Info from "./Info";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(0)}%`;

const WINDOWS = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" }
];

/**
 * What each stat has been worth over time.
 *
 * The point is that a stat's value is not fixed. It is however much of it
 * players produce, and that moves with the patch — so a banner chosen from an
 * old sample is chosen for a game nobody is playing any more.
 */
export default function MetaTrend({
  periodsByRole
}: {
  periodsByRole: Record<Role, StatPeriod[]>;
}) {
  const [role, setRole] = useState<Role>("core");
  const [months, setMonths] = useState(6);

  const periods = periodsByRole[role] ?? [];
  const stats = useMemo(() => {
    const keys = new Set<string>();
    for (const p of periods) for (const k of Object.keys(p.byStat)) keys.add(k);
    return [...keys] as StatKey[];
  }, [periods]);

  const trends = useMemo(() => statTrend(periods, stats, months), [periods, stats, months]);
  const ordered = useMemo(() => [...periods].sort((a, b) => a.date - b.date), [periods]);
  const max = useMemo(
    () => Math.max(1, ...periods.flatMap((p) => Object.values(p.byStat))),
    [periods]
  );

  const newest = ordered.length ? ordered[ordered.length - 1].date : 0;
  const cutoff = newest - months * 30 * 86400;
  const inWindow = ordered.filter((p) => p.date >= cutoff);

  const risers = trends.filter((t) => t.change > 0.08 && t.earlier > 0).slice(0, 3);
  const fallers = [...trends].filter((t) => t.change < -0.08 && t.earlier > 0)
    .sort((a, b) => a.change - b.change).slice(0, 3);

  return (
    <div className="stack">
      <section className="card-tight stage-bar">
        <div className="pill-row" role="tablist" aria-label="Role">
          {ROLES.map((r) => (
            <button key={r} className="pill" role="tab" aria-pressed={role === r}
              onClick={() => setRole(r)}>{ROLE_LABELS[r]}</button>
          ))}
        </div>
        <div className="pill-row">
          <span className="faint" style={{ alignSelf: "center" }}>Compare the last</span>
          {WINDOWS.map((w) => (
            <button key={w.months} className="pill" aria-pressed={months === w.months}
              onClick={() => setMonths(w.months)}>{w.label}</button>
          ))}
          <Info title="The window">
            Everything inside the window is compared against everything older, weighted by
            how many maps each event contributed. A short window tracks the current patch
            closely and is noisier; a long one is steadier and slower to notice a change.
          </Info>
        </div>
        <p className="faint" style={{ margin: 0 }}>
          {ordered.length} tournaments, {fmt(ordered.reduce((s, p) => s + p.maps, 0))} maps,
          {" "}{ordered.length ? new Date(ordered[0].date * 1000).toISOString().slice(0, 7) : ""} to{" "}
          {ordered.length ? new Date(newest * 1000).toISOString().slice(0, 7) : ""}.
          {" "}{inWindow.length} of them fall inside the window.
        </p>
      </section>

      {(risers.length > 0 || fallers.length > 0) && (
        <section className="card stack">
          <h2>What the patch is rewarding</h2>
          <div className="grid grid-2">
            <div className="sub-card stack" style={{ gap: 6 }}>
              <strong style={{ color: "var(--green)" }}>Paying more lately</strong>
              {risers.length === 0 && <span className="muted">Nothing has moved much.</span>}
              {risers.map((t) => (
                <div key={t.stat} className="row-between">
                  <span><span className={`dot dot-${STAT_COLORS[t.stat]}`} /> {STAT_LABELS[t.stat]}</span>
                  <span className="num" style={{ color: "var(--green)", fontWeight: 650 }}>{pct(t.change)}</span>
                </div>
              ))}
            </div>
            <div className="sub-card stack" style={{ gap: 6 }}>
              <strong style={{ color: "var(--red)" }}>Paying less lately</strong>
              {fallers.length === 0 && <span className="muted">Nothing has moved much.</span>}
              {fallers.map((t) => (
                <div key={t.stat} className="row-between">
                  <span><span className={`dot dot-${STAT_COLORS[t.stat]}`} /> {STAT_LABELS[t.stat]}</span>
                  <span className="num" style={{ color: "var(--red)", fontWeight: 650 }}>{pct(t.change)}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="faint" style={{ maxWidth: 740 }}>
            A stat is worth however much of it players produce, and that is a property of
            the patch. Games running short cuts last hits and GPM and lifts first blood;
            games running long does the reverse. A banner picked from an old sample is
            picked for a game nobody is playing any more.
          </p>
        </section>
      )}

      <section className="card stack">
        <div>
          <h2>Every stat, every tournament</h2>
          <p className="faint" style={{ marginTop: 2, maxWidth: 740 }}>
            Mean base points per series, in date order, all on one scale. Events inside the
            window are marked.
          </p>
        </div>
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Stat</th>
                {ordered.map((p) => (
                  <th key={p.leagueId} style={{ textAlign: "center" }}
                    className={p.date >= cutoff ? "" : "faint"}
                    title={`${p.leagueName} · ${p.maps} maps`}>
                    {new Date(p.date * 1000).toISOString().slice(2, 7)}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>
                  Change <Info title="Change" align="right">
                    The window average against everything older, weighted by maps. Blank
                    where there is nothing older to compare with.
                  </Info>
                </th>
              </tr>
            </thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.stat}>
                  <td>
                    <span className={`dot dot-${STAT_COLORS[t.stat]}`} /> {STAT_LABELS[t.stat]}
                  </td>
                  {ordered.map((p) => {
                    const v = p.byStat[t.stat] ?? 0;
                    const share = Math.min(1, v / max);
                    return (
                      <td key={p.leagueId} className="num" style={{
                        textAlign: "center",
                        background: `rgba(214, 169, 61, ${(share * 0.5).toFixed(3)})`,
                        opacity: p.date >= cutoff ? 1 : 0.5
                      }}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                  <td className="num" style={{
                    textAlign: "right", fontWeight: 650,
                    color: t.earlier === 0 ? "var(--text-faint)"
                      : t.change > 0.05 ? "var(--green)"
                      : t.change < -0.05 ? "var(--red)" : "var(--muted)"
                  }}>
                    {t.earlier === 0 ? "—" : pct(t.change)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
