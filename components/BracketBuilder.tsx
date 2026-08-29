"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Format, MatchNode, Selections, TeamRatings,
  buildStructure, matchExpectedMaps, resolveBracket, simulate, winProbability
} from "../lib/bracket";
import { DEFAULT_ELO, mapWinProbability } from "../lib/elo";
import type { TeamEntry } from "../lib/data";

const SIZES = [4, 8, 16] as const;
const STORAGE_KEY = "d2toolkit-bracket-v2";

type Saved = { size: number; format: Format; seeds: (string | null)[]; selections: Selections };

export default function BracketBuilder({ teams }: { teams: TeamEntry[] }) {
  const [size, setSize] = useState<number>(8);
  const [format, setFormat] = useState<Format>("double");
  const [seeds, setSeeds] = useState<(string | null)[]>([]);
  const [selections, setSelections] = useState<Selections>({});
  const [ready, setReady] = useState(false);

  // Ratings come straight from OpenDota. Nothing to configure.
  const ratings: TeamRatings = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO])),
    [teams]
  );

  // Seed strongest against weakest, the way a real bracket is drawn.
  const seedDefaults = (count: number): (string | null)[] => {
    const pool = [...teams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)).slice(0, count);
    const ordered: (string | null)[] = [];
    for (let i = 0; i < pool.length / 2; i += 1) {
      ordered.push(pool[i]?.name ?? null, pool[pool.length - 1 - i]?.name ?? null);
    }
    return ordered.slice(0, count);
  };

  useEffect(() => {
    let saved: Saved | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      saved = null;
    }
    if (saved?.seeds?.length) {
      setSize(saved.size);
      setFormat(saved.format);
      setSeeds(saved.seeds);
      setSelections(saved.selections ?? {});
    } else {
      setSeeds(seedDefaults(8));
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ size, format, seeds, selections }));
    } catch {
      /* ignore */
    }
  }, [ready, size, format, seeds, selections]);

  const structure = useMemo(() => buildStructure(size, format), [size, format]);
  const resolved = useMemo(() => resolveBracket(structure, seeds, selections), [structure, seeds, selections]);

  const picked = useMemo(
    () => structure.filter((m) => {
      const pair = resolved.get(m.id);
      const choice = selections[m.id];
      return choice && pair?.includes(choice);
    }),
    [structure, resolved, selections]
  );

  const sim = useMemo(() => {
    if (seeds.some((s) => !s)) return null;
    const valid: Selections = {};
    for (const m of picked) valid[m.id] = selections[m.id];
    return simulate(structure, seeds as string[], valid, ratings, 20000);
  }, [structure, seeds, selections, ratings, picked]);

  const changeSize = (next: number) => {
    setSize(next);
    setSeeds(seedDefaults(next));
    setSelections({});
  };

  const setSeed = (index: number, name: string) =>
    setSeeds((current) => {
      const next = [...current];
      next[index] = name || null;
      return next;
    });

  const pick = (matchId: string, team: string) =>
    setSelections((current) => {
      const next = { ...current, [matchId]: team };
      // Changing a pick upstream invalidates picks downstream.
      const checked = resolveBracket(structure, seeds, next);
      for (const m of structure) {
        const choice = next[m.id];
        if (choice && !checked.get(m.id)?.includes(choice)) delete next[m.id];
      }
      return next;
    });

  /** Fills the bracket with the model favourite in every match. */
  const useModel = () => {
    const next: Selections = {};
    for (const m of structure) {
      const [a, b] = resolveBracket(structure, seeds, next).get(m.id) ?? [null, null];
      if (a && b) next[m.id] = winProbability(ratings, a, b, m.bestOf) >= 0.5 ? a : b;
    }
    setSelections(next);
  };

  const rounds = useMemo(() => groupRounds(structure), [structure]);
  const outlook = useMemo(
    () => Object.entries(sim?.teams ?? {}).sort((a, b) => b[1].champion - a[1].champion),
    [sim]
  );

  if (!ready) return <p className="muted">Loading…</p>;

  const missing = seeds.some((s) => !s);
  const ratedCount = teams.filter((t) => t.elo != null).length;

  return (
    <div className="stack">
      <section className="card stack">
        <div className="row-between">
          <h2>Setup</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={useModel} className="btn-primary" disabled={missing}>
              Fill with model favourites
            </button>
            <button onClick={() => setSelections({})}>Clear picks</button>
          </div>
        </div>

        <div className="row-between">
          <div className="pill-row" aria-label="Team count">
            {SIZES.map((n) => (
              <button key={n} className="pill" aria-pressed={size === n} onClick={() => changeSize(n)}>
                {n} teams
              </button>
            ))}
          </div>
          <div className="pill-row" aria-label="Format">
            {(["double", "single"] as Format[]).map((f) => (
              <button key={f} className="pill" aria-pressed={format === f} onClick={() => { setFormat(f); setSelections({}); }}>
                {f === "double" ? "Double elimination" : "Single elimination"}
              </button>
            ))}
          </div>
        </div>

        <p className="faint">
          {structure.length} matches, Bo3 with a Bo5 grand final. Seed 1 plays seed 2,
          seed 3 plays seed 4, and so on. Win chances come from OpenDota&rsquo;s Elo
          ratings ({ratedCount} of {teams.length} teams rated) — nothing to configure.
        </p>

        <div className="team-picker">
          {seeds.map((seed, index) => (
            <label key={index} className="team-slot">
              <span className="seed-no">{index + 1}</span>
              <select value={seed ?? ""} onChange={(e) => setSeed(index, e.target.value)}>
                <option value="">— pick a team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}{t.elo != null ? ` (${Math.round(t.elo)})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {missing && <p className="notice">Fill every slot to see the simulation.</p>}
      </section>

      <section className="card stack">
        <div className="row-between">
          <h2>Bracket</h2>
          <span className="faint">{picked.length} of {structure.length} matches picked</span>
        </div>
        <div className="bracket-scroll">
          <div className="bracket-rounds">
            {rounds.map((group) => (
              <div className="bracket-round" key={group.key}>
                <h3>{group.label}</h3>
                {group.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    pair={resolved.get(match.id) ?? [null, null]}
                    selected={selections[match.id]}
                    ratings={ratings}
                    onPick={pick}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card stack">
        <div className="row-between">
          <h2>Projection</h2>
          {sim && <span className="faint">{sim.runs.toLocaleString("en-US")} simulations</span>}
        </div>
        {!sim && <p className="muted">Pick teams for every slot first.</p>}
        {sim && (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <small>Expected correct</small>
                <b>{sim.expectedCorrect.toFixed(1)}</b>
                <span className="faint">of {picked.length} picked</span>
              </div>
              <div className="stat-tile">
                <small>Favourite</small>
                <b style={{ fontSize: "1.1rem" }}>{outlook[0]?.[0] ?? "—"}</b>
                <span className="faint">{outlook[0] ? `${(outlook[0][1].champion * 100).toFixed(1)}% to win` : ""}</span>
              </div>
            </div>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Team</th><th style={{ textAlign: "right" }}>Elo</th>
                    <th style={{ textAlign: "right" }}>Wins</th>
                    <th style={{ textAlign: "right" }}>Final</th>
                    <th style={{ textAlign: "right" }}>Series</th>
                    <th style={{ textAlign: "right" }}>Maps</th>
                  </tr>
                </thead>
                <tbody>
                  {outlook.map(([team, o]) => (
                    <tr key={team}>
                      <td>{team}</td>
                      <td className="num faint" style={{ textAlign: "right" }}>
                        {ratings[team] ? Math.round(ratings[team]) : "—"}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>{(o.champion * 100).toFixed(1)}%</td>
                      <td className="num muted" style={{ textAlign: "right" }}>{(o.finalist * 100).toFixed(1)}%</td>
                      <td className="num muted" style={{ textAlign: "right" }}>{o.series.toFixed(1)}</td>
                      <td className="num" style={{ textAlign: "right", fontWeight: 650 }}>{o.maps.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint">
              Maps is the expected number of games the team plays across the whole bracket.
              That is the number the fantasy page multiplies a player&rsquo;s per-game score by.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function MatchCard({
  match, pair, selected, ratings, onPick
}: {
  match: MatchNode;
  pair: [string | null, string | null];
  selected?: string;
  ratings: TeamRatings;
  onPick: (matchId: string, team: string) => void;
}) {
  const [a, b] = pair;
  const maps = a && b ? matchExpectedMaps(ratings, a, b, match.bestOf) : null;
  return (
    <article className="match">
      <header>
        {match.label} · Bo{match.bestOf}
        {maps !== null && <span style={{ float: "right" }}>{maps.toFixed(1)} maps</span>}
      </header>
      {pair.map((team, index) => {
        const opponent = index === 0 ? b : a;
        const series = team && opponent
          ? Math.round(winProbability(ratings, team, opponent, match.bestOf) * 100)
          : null;
        const perMap = team && opponent
          ? Math.round(mapWinProbability(ratings[team] ?? DEFAULT_ELO, ratings[opponent] ?? DEFAULT_ELO) * 100)
          : null;
        return (
          <button
            key={`${match.id}-${index}`}
            disabled={!team}
            className={selected && selected === team ? "picked" : ""}
            onClick={() => team && onPick(match.id, team)}
            title={perMap !== null ? `${perMap}% per map` : undefined}
          >
            <span>{team ?? "waiting"}</span>
            {series !== null && <span className="odds">{series}%</span>}
          </button>
        );
      })}
    </article>
  );
}

type RoundGroup = { key: string; label: string; matches: MatchNode[] };

function groupRounds(structure: MatchNode[]): RoundGroup[] {
  const groups = new Map<string, RoundGroup>();
  for (const match of structure) {
    const key = `${match.side}-${match.round}`;
    if (!groups.has(key)) groups.set(key, { key, label: match.label, matches: [] });
    groups.get(key)!.matches.push(match);
  }
  return [...groups.values()];
}
