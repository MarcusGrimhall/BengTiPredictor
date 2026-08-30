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
    strongBasis: "form" | "rating" | "placement";
    /** Present when this source is a time window rather than one tournament. */
    meta?: { months: number; events: number; maps: number; from: number; to: number };
  }>;
}) {
  // Months of professional play to pool. Six by default: fewer is often only a
  // couple of tournaments, more starts to blur across a patch boundary.
  const [months, setMonths] = useState(6);
  const [source, setSource] = useState<"recent" | string>("recent");
  const [stage, setStage] = useState<Stage>("playoffs");
  const [role, setRole] = useState<Role>("core");
  // The chart and the table were showing different measures, which made the
  // same stat read as two different numbers. Now one control decides both.
  const [measure, setMeasure] = useState<"average" | "best">("best");
  const [hover, setHover] = useState<string | null>(null);

  const windows = useMemo(
    () => leagues.filter((l) => l.meta).sort((a, b) => a.meta!.months - b.meta!.months),
    [leagues]
  );
  const events = useMemo(() => leagues.filter((l) => !l.meta), [leagues]);

  /**
   * The window that actually covers the months asked for: the shortest one
   * reaching at least that far back, or the longest available if the request
   * goes past the data.
   */
  const chosenWindow = useMemo(() => {
    if (!windows.length) return null;
    return windows.find((w) => w.meta!.months >= months) ?? windows[windows.length - 1];
  }, [windows, months]);

  const isWindow = source === "recent";
  const league = isWindow ? chosenWindow : leagues.find((l) => l.id === source);
  const leagueId = league?.id ?? "";
  const available = league?.stages ?? [];
  const activeStage = available.includes(stage) ? stage : available[0] ?? "groupStage";

  const rows = useMemo(
    () => data[leagueId]?.[activeStage]?.[role] ?? [],
    [data, leagueId, activeStage, role]
  );

  const pick = (p: { value: number; best: number }) => (measure === "best" ? p.best : p.value);
  const rowTop = (r: StatSpread) => (measure === "best" ? r.bestSeries : r.highest);
  const rowTopName = (r: StatSpread) => (measure === "best" ? r.bestSeriesName : r.highestName);

  // One scale across every stat, so a long row really does mean more points.
  const max = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => r.points.map(pick))),
    [rows, measure]
  );
  const sorted = useMemo(
    () => [...rows].sort((a, b) => rowTop(b) - rowTop(a)),
    [rows, measure]
  );

  const x = (v: number) => (v / max) * 100;

  return (
    <div className="stack">
      <section className="card-tight stage-bar">
        <div className="pill-row" role="tablist" aria-label="Source">
          <button className="pill" role="tab" aria-pressed={isWindow}
            onClick={() => setSource("recent")}>
            Recent pro play
          </button>
          {isWindow && (
            <span className="months-picker">
              last
              <input
                type="number" min={1} max={60} value={months}
                aria-label="Months of professional play to include"
                onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
              months
            </span>
          )}
          <Info title="Recent professional play">
            Every professional match from the last <strong>{months} months</strong>, pooled
            across tournaments rather than taken from one event.
            <br /><br />
            A stat is worth however much of it players currently produce, and that moves
            with the patch — games running short cut last hits and GPM and lift first blood,
            games running long do the reverse. Picking a banner off a year-old sample is
            picking for a game nobody is playing.
            <br /><br />
            Windows snap to tournament boundaries, since asking for seven months and eight
            gives the same sample when no event sits between them.
          </Info>
          {events.length > 0 && <span className="rule-v" />}
          {events.map((l) => (
            <button key={l.id} className="pill" role="tab" aria-pressed={!isWindow && leagueId === l.id}
              onClick={() => setSource(l.id)}>{l.name}</button>
          ))}
        </div>
        <div className="pill-row">
          {!isWindow && (["groupStage", "playoffs"] as Stage[]).map((s) => (
            <button key={s} className="pill" aria-pressed={activeStage === s}
              disabled={!available.includes(s)} onClick={() => setStage(s)}>
              {STAGE_LABELS[s]}
            </button>
          ))}
          {!isWindow && <span style={{ width: 12 }} />}
          {ROLES.map((r) => (
            <button key={r} className="pill" aria-pressed={role === r}
              onClick={() => setRole(r)}>{ROLE_LABELS[r]}</button>
          ))}
        </div>
        <div className="pill-row">
          <button className="pill" aria-pressed={measure === "best"}
            onClick={() => setMeasure("best")}>
            Best series · what a period pays
          </button>
          <button className="pill" aria-pressed={measure === "average"}
            onClick={() => setMeasure("average")}>
            Average series
          </button>
          <Info title="Which number">
            <strong>Best series</strong> is what a period actually banks — only an entry&rsquo;s
            highest series counts, so this is the number that decided their score.{" "}
            <strong>Average series</strong> is their mean over every series, which says how
            good a typical night was rather than the one that mattered. Both the chart and
            the table follow this choice.
          </Info>
        </div>
        <p className="faint" style={{ margin: 0 }}>
          {isWindow && league?.meta ? (
            <>
              <strong>{league.meta.events} tournaments</strong>,{" "}
              {league.meta.maps.toLocaleString("en-US")} maps,{" "}
              {new Date(league.meta.from * 1000).toISOString().slice(0, 7)} to{" "}
              {new Date(league.meta.to * 1000).toISOString().slice(0, 7)}
              {league.meta.months !== months && (
                <span className="faint">
                  {" "}— nearest window to {months} months
                </span>
              )}
            </>
          ) : (
            <><strong>{league?.name}</strong> · {STAGE_LABELS[activeStage].toLowerCase()}</>
          )}
          {" "}· {rows[0]?.total ?? 0} {role === "mid" ? "players" : "duos"}
          {rows[0] && rows[0].total > rows[0].points.length
            ? `, strongest ${rows[0].points.length} plotted`
            : ""}.
        </p>
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
            <i className="dot-mark dot-strong" /> top 4 teams
            <Info title="The top 4 teams">
              The four that looked strongest <strong>going into</strong> the event, not the
              four that turned out best — judging them on the result would make this
              circular.
              <br /><br />
              {league?.strongBasis === "form"
                ? "An Elo rating built only from the matches played before this event. Not a win rate — beating a bottom seed and beating the champion count the same in a win rate, so a team with an easy schedule outranks one that played everybody. At TI 2026 that is not hypothetical: Aurora Gaming led on win rate at 60.7% and sits seventh on rating."
                : league?.strongBasis === "rating"
                  ? "No pre-event tournaments are loaded for this event, so the stored Elo rating is used — it passed its accuracy check here."
                  : "Neither pre-event form nor a trustworthy rating is available for this event, so final placement is used. Weaker, because it partly measures the result."}
              <br /><br />
              Here: {(league?.strongTeams ?? []).join(", ")}.
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
            <i className="tick-mark tick-savg" /> top-4 average
            <Info title="Top-4 average">
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
                    style={{ left: `${x(pick(p))}%` }}
                    title={`${p.name} · ${p.team}\n${fmt(p.value)} average over ${p.series} series, best ${fmt(p.best)}`}
                  />
                ))}
              </div>
              <div className="spread-nums">
                <span className="num" title={`${measure === "best" ? "biggest single series" : "best average"} — ${rowTopName(row)}`}>
                  {fmt(rowTop(row))}
                </span>
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
              <strong>{fmt(row.highest)}</strong> ({row.highestName}) against a field average
              of {fmt(row.average)}, so the leader is{" "}
              <strong>{lead.toFixed(2)}×</strong> the field.
              Best among the top 4: {fmt(row.strongBest)} ({row.strongBestName}), their
              average {fmt(row.strongAverage)}
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
                  Top-4 avg <Info title="Top-4 average" align="right">
                    The mean across the four teams that looked strongest going in
                    {league?.strongBasis === "form" ? ", rated on the matches played before it"
                      : league?.strongBasis === "rating" ? ", by rating"
                      : ", by final placement (nothing better available)"}. The percentage is
                    how far above or below the whole field they sit — a big positive is a
                    stat strong teams actually produce more of.
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
