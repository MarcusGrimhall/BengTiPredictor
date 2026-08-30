"use client";

import { useMemo, useState } from "react";
import type { StatSpread } from "../lib/statSpread";
import { Role, STAT_COLORS, STAT_LABELS } from "../lib/scoring";
import { STAGE_LABELS, type Stage } from "../lib/stages";
import Info from "./Info";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export type SpreadData = Record<string, Record<Stage, Record<Role, StatSpread[]>>>;

/**
 * One row per stat, one dot per entry.
 *
 * The shape of a row is the point. A stat where the leader sits far right of a
 * tight cluster is worth chasing - somebody is producing much more of it than
 * the field. A stat where every dot is on top of every other is a slot to fill
 * with whatever is cheapest to reroll, because nobody separates themselves on
 * it.
 */
export default function StatSpreadChart({
  data, leagues
}: {
  data: SpreadData;
  leagues: Array<{
    id: string;
    name: string;
    stages: Stage[];
    strongTeams: string[];
    strongBasis: "rating" | "placement";
  }>;
}) {
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const [stage, setStage] = useState<Stage>("playoffs");
  const [role, setRole] = useState<Role>("core");
  const [hover, setHover] = useState<string | null>(null);

  const league = leagues.find((l) => l.id === leagueId) ?? leagues[0];
  const available = league?.stages ?? [];
  const activeStage = available.includes(stage) ? stage : available[0] ?? "groupStage";

  const rows = useMemo(
    () => data[leagueId]?.[activeStage]?.[role] ?? [],
    [data, leagueId, activeStage, role]
  );

  // One scale across every stat, so a long row really does mean more points.
  const max = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => r.points.map((p) => p.value))),
    [rows]
  );
  const sorted = useMemo(() => [...rows].sort((a, b) => b.bestSeries - a.bestSeries), [rows]);

  const x = (v: number) => (v / max) * 100;

  return (
    <div className="stack">
      <section className="card-tight stage-bar">
        <div className="pill-row" role="tablist" aria-label="Tournament">
          {leagues.map((l) => (
            <button key={l.id} className="pill" role="tab" aria-pressed={leagueId === l.id}
              onClick={() => setLeagueId(l.id)}>{l.name}</button>
          ))}
        </div>
        <div className="pill-row">
          {(["groupStage", "playoffs"] as Stage[]).map((s) => (
            <button key={s} className="pill" aria-pressed={activeStage === s}
              disabled={!available.includes(s)} onClick={() => setStage(s)}>
              {STAGE_LABELS[s]}
            </button>
          ))}
          <span style={{ width: 12 }} />
          {ROLES.map((r) => (
            <button key={r} className="pill" aria-pressed={role === r}
              onClick={() => setRole(r)}>{ROLE_LABELS[r]}</button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="row-between">
          <div>
            <h2>{ROLE_LABELS[role]} · every {role === "mid" ? "player" : "duo"}, every stat</h2>
            <p className="faint" style={{ marginTop: 2, maxWidth: 720 }}>
              One dot per {role === "mid" ? "player" : "duo"}: mean points per series from
              that stat alone, one emblem at tier III — a series being the average of its
              two best games. All stats share one scale, so a long row is
              genuinely worth more. What matters is the <strong>shape</strong> — a leader far
              clear of a tight cluster is a stat somebody dominates; a row where every dot
              overlaps is a slot to fill with whatever is cheapest to reroll.
            </p>
          </div>
        </div>

        <div className="legend">
          <span><i className="dot-mark dot-all" /> a {role === "mid" ? "player" : "duo"}</span>
          <span>
            <i className="dot-mark dot-strong" /> strongest four
            <Info title="The strongest four">
              {league?.strongBasis === "rating"
                ? "The four highest-rated teams at this event, by Elo. Chosen by strength rather than by how the event turned out — using final placement would make the comparison circular."
                : "The ratings failed their accuracy check for this event, so the four deepest-running teams are used instead. Less satisfying, because it partly measures the result rather than the teams."}
              {" "}Here: {(league?.strongTeams ?? []).join(", ")}.
            </Info>
          </span>
          <span>
            <i className="tick-mark tick-avg" /> field average
            <Info title="Field average">
              The mean across <strong>every</strong> {role === "mid" ? "player" : "duo"} at
              this stage, all teams included.
            </Info>
          </span>
          <span>
            <i className="tick-mark tick-savg" /> strong-four average
            <Info title="Strong-four average">
              The mean across only those four teams. Where it sits well right of the field
              average, that stat is one strong teams genuinely produce more of.
            </Info>
          </span>
        </div>

        <div className="spread">
          {sorted.map((row) => (
            <div key={row.stat} className="spread-row"
              onMouseEnter={() => setHover(row.stat)} onMouseLeave={() => setHover(null)}>
              <div className="spread-label">
                <span className={`dot dot-${STAT_COLORS[row.stat]}`} />
                {STAT_LABELS[row.stat]}
              </div>
              <div className="spread-track">
                <div className="spread-axis" />
                {/* Averages first so the dots sit on top of them. */}
                <span className="tick tick-avg" style={{ left: `${x(row.average)}%` }}
                  title={`field average ${fmt(row.average)}`} />
                <span className="tick tick-savg" style={{ left: `${x(row.strongAverage)}%` }}
                  title={`top-4 average ${fmt(row.strongAverage)}`} />
                {row.points.map((p, i) => (
                  <span
                    key={`${p.name}-${i}`}
                    className={`spread-dot ${p.strong ? "strong" : ""}`}
                    style={{ left: `${x(p.value)}%` }}
                    title={`${p.name} · ${p.team}\n${fmt(p.value)} per series over ${p.series}, best ${fmt(p.best)}`}
                  />
                ))}
              </div>
              <div className="spread-nums">
                <span className="num" title={`best average — ${row.highestName}`}>{fmt(row.highest)}</span>
                <span className="num faint" title="field average">{fmt(row.average)}</span>
              </div>
            </div>
          ))}
        </div>

        {hover && (() => {
          const row = sorted.find((r) => r.stat === hover);
          if (!row) return null;
          const lead = row.average > 0 ? row.highest / row.average : 0;
          return (
            <div className="verdict">
              <strong>{STAT_LABELS[row.stat]}</strong> — biggest single series{" "}
              <strong>{fmt(row.bestSeries)}</strong> ({row.bestSeriesName}); best average{" "}
              {fmt(row.highest)} ({row.highestName}) against a field average of{" "}
              {fmt(row.average)}, so the leader is <strong>{lead.toFixed(2)}×</strong> the field.
              Best among the strongest four: {fmt(row.strongBest)} ({row.strongBestName}),
              their average {fmt(row.strongAverage)}
              {row.strongAverage > row.average
                ? ` — ${((row.strongAverage / Math.max(1, row.average) - 1) * 100).toFixed(0)}% above the field.`
                : ` — no better than the field.`}
            </div>
          );
        })()}
      </section>

      <section className="card stack">
        <h2>The numbers</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Stat</th>
                <th style={{ textAlign: "right" }}>
                  Best series <Info title="Best series">
                    The single biggest series anybody produced from this stat — the one that
                    would have shown up on a scoreboard. Always larger than the best average,
                    because it is one series rather than a mean over several.
                  </Info>
                </th>
                <th style={{ textAlign: "right" }}>
                  Best average <Info title="Best average">
                    The best {role === "mid" ? "player" : "duo"} by their <strong>mean</strong>{" "}
                    across all their series. This is what you would expect from picking them,
                    rather than their single best night.
                  </Info>
                </th>
                <th>Who</th>
                <th style={{ textAlign: "right" }}>
                  Field avg <Info title="Field average">
                    The mean across every {role === "mid" ? "player" : "duo"} at this stage,
                    all teams included.
                  </Info>
                </th>
                <th style={{ textAlign: "right" }}>
                  Strong-four avg <Info title="Strong-four average" align="right">
                    The mean across the four strongest teams
                    {league?.strongBasis === "rating" ? " by rating" : " by final placement"}.
                    The percentage is how far above or below the whole field they sit — a big
                    positive is a stat strong teams actually produce more of.
                  </Info>
                </th>
                <th style={{ textAlign: "right" }}>
                  Leader vs field <Info title="Leader vs field" align="right">
                    Highest divided by the field average. Near 1.0 means everyone produces
                    about the same and the slot is not worth chasing; 1.8 means one entry is
                    nearly doubling the field.
                  </Info>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.stat}>
                  <td>
                    <span className={`dot dot-${STAT_COLORS[row.stat]}`} /> {STAT_LABELS[row.stat]}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 650 }}
                    title={row.bestSeriesName}>{fmt(row.bestSeries)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{fmt(row.highest)}</td>
                  <td className="muted">{row.highestName}</td>
                  <td className="num faint" style={{ textAlign: "right" }}>{fmt(row.average)}</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {fmt(row.strongAverage)}
                    {row.average > 0 && (
                      <span className="faint">
                        {" "}({row.strongAverage >= row.average ? "+" : "−"}
                        {Math.abs((row.strongAverage / Math.max(1, row.average) - 1) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: "right", color: "var(--accent)", fontWeight: 650 }}>
                    {row.average > 0 ? `${(row.highest / row.average).toFixed(2)}×` : "—"}
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
