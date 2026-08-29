"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Emblem, PlayerEntry, Ranked, TIERS, TIER_BONUSES, TRAITS, TRAIT_DESCRIPTIONS,
  Tier, Trait, availableStats, buildLineups, matchScores, optimizeEmblems, rankPlayers
} from "../lib/fantasy";
import {
  BANNER_SLOTS, Role, STAT_COLORS, STAT_LABELS, StatKey, UNAVAILABLE_STATS, statsForColor
} from "../lib/scoring";
import { useMainEventMaps, type MainEventMaps } from "./useMainEventMaps";
import type { TeamEntry } from "../lib/data";
import { GROUP_STAGE_SHAPE, STAGES, STAGE_LABELS, STAGE_SLOTS, type Stage } from "../lib/stages";
import FantasySimulator, { riskLabel } from "./FantasySimulator";
import TrainerTitles from "./TrainerTitles";
import { prefixValue, suffixValue, type PrefixKey, type SuffixKey } from "../lib/titles";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };
const ROLE_HINTS: Record<Role, string> = {
  core: "same-team pair",
  mid: "one player",
  support: "same-team pair"
};
const ROLE_ENTRY: Record<Role, string> = { core: "pair", mid: "player", support: "pair" };
const STORAGE_KEY = "d2toolkit-banners-v2";

/** Distinct stat per slot - the same stat may never appear twice on a banner. */
const defaultBanner = (role: Role): Emblem[] => {
  const used = new Set<StatKey>();
  return BANNER_SLOTS[role].map((color) => {
    const stat = statsForColor(color).find((s) => !used.has(s)) ?? statsForColor(color)[0];
    used.add(stat);
    return { stat, tier: "III" as Tier, trait: "none" as Trait };
  });
};

const defaultBanners = (): Record<Role, Emblem[]> => ({
  core: defaultBanner("core"),
  mid: defaultBanner("mid"),
  support: defaultBanner("support")
});

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function FantasyCalculator({
  playersByStage,
  actualByStage,
  groupProjection,
  leagueName,
  teams,
  stageSplit,
  projection
}: {
  playersByStage: Record<Stage, PlayerEntry[]>;
  actualByStage: Record<Stage, Record<string, number>>;
  groupProjection: Record<string, number>;
  leagueName: string;
  teams: TeamEntry[];
  stageSplit: boolean;
  projection: MainEventMaps;
}) {
  // Use the bracket the user built if there is one, else the Elo-seeded default.
  const playoffProjection = useMainEventMaps(teams, projection);
  const [banners, setBanners] = useState<Record<Role, Emblem[]>>(defaultBanners);
  const [role, setRole] = useState<Role>("core");
  const [stage, setStage] = useState<Stage>("groupStage");
  const [risk, setRisk] = useState(50);
  const [prefix, setPrefix] = useState<PrefixKey | null>(null);
  const [suffix, setSuffix] = useState<SuffixKey | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.banners) setBanners({ ...defaultBanners(), ...parsed.banners });
        if (typeof parsed.risk === "number") setRisk(parsed.risk);
        if (parsed.stage === "groupStage" || parsed.stage === "playoffs") setStage(parsed.stage);
        if (parsed.prefix) setPrefix(parsed.prefix);
        if (parsed.suffix) setSuffix(parsed.suffix);
      }
    } catch {
      /* a broken localStorage should not take the page down */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ banners, risk, stage, prefix, suffix }));
    } catch {
      /* private mode can block writes */
    }
  }, [banners, risk, stage, prefix, suffix, ready]);

  // Three emblems in the group stage, five in the playoffs - the playoff card
  // keeps the first three and adds two, so one banner holds both.
  const slots = STAGE_SLOTS[stage];
  // A banner picks a same-team pair at Core and Support and a single player at
  // Mid, so those are the entries that get ranked - not individuals.
  const players = useMemo(
    () => buildLineups(playersByStage[stage] ?? []),
    [playersByStage, stage]
  );
  const card = useMemo(() => banners[role].slice(0, slots), [banners, role, slots]);

  /**
   * Series each team plays in this stage - the multiplier on a fantasy value.
   * A bracket the user built wins, then what was actually played, then a
   * projection, and the label says which.
   */
  const { seriesByTeam, mapsSource } = useMemo(() => {
    const actual = actualByStage[stage] ?? {};
    if (stage === "playoffs") {
      if (playoffProjection.source === "bracket") {
        return { seriesByTeam: playoffProjection.seriesByTeam, mapsSource: "bracket" as const };
      }
      if (Object.keys(actual).length) return { seriesByTeam: actual, mapsSource: "actual" as const };
      return { seriesByTeam: playoffProjection.seriesByTeam, mapsSource: "rating" as const };
    }
    if (Object.keys(actual).length) return { seriesByTeam: actual, mapsSource: "actual" as const };
    return { seriesByTeam: groupProjection, mapsSource: "rating" as const };
  }, [stage, actualByStage, groupProjection, playoffProjection]);

  const slotOptions = useMemo(
    () => BANNER_SLOTS[role].slice(0, slots).map((color) => statsForColor(color)),
    [role, slots]
  );

  const baseRanked = useMemo(
    () => rankPlayers(players, role, card, risk, seriesByTeam),
    [players, role, card, risk, seriesByTeam]
  );

  /**
   * Titles multiply the whole roster, but the Underdog fires on losses, so the
   * rate is per entry and the order can change. Applied after ranking and
   * re-sorted rather than folded into the emblem maths.
   */
  const ranked = useMemo(() => {
    if (!prefix && !suffix) return baseRanked;
    return baseRanked
      .map((entry) => {
        const p = prefix ? prefixValue(entry.player, prefix).multiplier : 1;
        const s = suffix ? suffixValue(entry.player, suffix).multiplier : 1;
        const factor = p * s;
        return { ...entry, score: entry.score * factor, total: entry.total * factor,
                 floor: entry.floor * factor, ceiling: entry.ceiling * factor };
      })
      .sort((a, b) => b.total - a.total);
  }, [baseRanked, prefix, suffix]);

  const update = (index: number, patch: Partial<Emblem>) =>
    setBanners((current) => {
      const next = [...current[role]];
      next[index] = { ...next[index], ...patch };
      return { ...current, [role]: next };
    });

  // Only the emblems this stage scores are optimised; the rest are left alone
  // so switching stages does not quietly rewrite the other card.
  const optimize = () =>
    setBanners((current) => ({
      ...current,
      [role]: [
        ...optimizeEmblems(players, role, slotOptions, current[role].slice(0, slots), risk, seriesByTeam),
        ...current[role].slice(slots)
      ]
    }));

  const reset = () => setBanners((current) => ({ ...current, [role]: defaultBanner(role) }));

  const best = ranked[0];
  const info = riskLabel(risk);
  const hasProjection = Object.keys(seriesByTeam).length > 0;
  const { championByTeam, seeds } = playoffProjection;

  return (
    <div className="stack">
      {stageSplit && (
        <section className="card-tight stage-bar">
          <div className="pill-row" role="tablist" aria-label="Fantasy period">
            {STAGES.map((s) => (
              <button
                key={s} className="pill" role="tab"
                aria-pressed={stage === s} aria-selected={stage === s}
                onClick={() => setStage(s)}
              >
                {STAGE_LABELS[s]}{" "}
                <span className="faint">· {STAGE_SLOTS[s]} emblems</span>
              </button>
            ))}
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Two separate cards. This one scores over the{" "}
            <strong>{stage === "groupStage" ? "group stage" : "playoff"}</strong> matches
            only — {players.length} players from {Object.keys(seriesByTeam).length} teams
            {stage === "playoffs" && " that made the bracket"}. Group stage points do
            not carry into the playoff card.
          </p>
        </section>
      )}

      <div className="pill-row" role="tablist" aria-label="Role">
        {ROLES.map((r) => (
          <button
            key={r} className="pill" role="tab"
            aria-pressed={role === r} aria-selected={role === r}
            onClick={() => setRole(r)}
          >
            {ROLE_LABELS[r]} <span className="faint">· {ROLE_HINTS[r]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-2">
        <section className="card stack">
          <div className="row-between">
            <h2>Banner · {ROLE_LABELS[role]}{stageSplit && ` · ${STAGE_LABELS[stage]}`}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={optimize} className="btn-primary">Optimise</button>
              <button onClick={reset}>Reset</button>
            </div>
          </div>
          <p className="faint">
            {slots} emblems, each a different stat — the same stat never appears twice
            on one banner. The slot colour decides which stats can go there. Optimise
            maximises this stage&rsquo;s projected total at the current risk level.
            {slots < banners[role].length && " The playoff card keeps these three and adds two."}
          </p>

          {card.map((emblem, index) => {
            const color = BANNER_SLOTS[role][index];
            return (
              <div key={index} className="emblem-row">
                <span className={`dot dot-${color}`} aria-label={color} />
                <select value={emblem.stat} aria-label={`Emblem ${index + 1} stat`}
                  onChange={(e) => update(index, { stat: e.target.value as StatKey })}>
                  {/* Stats used by another slot are excluded - no duplicates. */}
                  {availableStats(card, index, slotOptions).map((stat) => (
                    <option key={stat} value={stat}>{STAT_LABELS[stat]}</option>
                  ))}
                </select>
                <select value={emblem.tier} aria-label={`Emblem ${index + 1} tier`}
                  onChange={(e) => update(index, { tier: e.target.value as Tier })}>
                  {TIERS.map((tier) => (
                    <option key={tier} value={tier}>{tier} · +{TIER_BONUSES[tier]}%</option>
                  ))}
                </select>
                <select value={emblem.trait} aria-label={`Emblem ${index + 1} trait`}
                  title={TRAIT_DESCRIPTIONS[emblem.trait]}
                  onChange={(e) => update(index, { trait: e.target.value as Trait })}>
                  {TRAITS.map((trait) => (
                    <option key={trait} value={trait}>{trait === "none" ? "—" : trait}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </section>

        <section className="card stack">
          <h2>Best {ROLE_LABELS[role]} {ROLE_ENTRY[role]}</h2>
          {!ranked.length && (
            <p className="muted">
              No {role === "mid" ? "mid players" : `complete ${role} pairs`} in this stage&rsquo;s data.
            </p>
          )}
          {best && <Breakdown ranked={best} banner={card} risk={risk} />}
        </section>
      </div>

      <section className="card stack">
        <div className="row-between">
          <h2>Ranking · {ROLE_LABELS[role]}</h2>
          <span className="faint">
            {leagueName} · risk {info.label.toLowerCase()},{" "}
            <a href="#simulator">set it in the simulator below</a>
          </span>
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Team</th>
                <th style={{ textAlign: "right" }}>Floor</th>
                <th style={{ textAlign: "right" }}>At risk</th>
                <th style={{ textAlign: "right" }}>Ceiling</th>
                {hasProjection && <th style={{ textAlign: "right" }}>Series</th>}
                <th style={{ textAlign: "right" }}>{stageSplit ? STAGE_LABELS[stage] : "Tournament"}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 20).map((entry, index) => (
                <tr key={entry.player.id}>
                  <td className="num faint">{index + 1}</td>
                  <td>
                    <strong>{entry.player.name}</strong>
                    <span className="faint">
                      {" "}· {entry.player.games}g
                      {entry.player.members && " · pair"}
                    </span>
                  </td>
                  <td className="muted">{entry.player.teamName}</td>
                  <td className="num faint" style={{ textAlign: "right" }}>{fmt(entry.floor)}</td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 650 }}>{fmt(entry.score)}</td>
                  <td className="num faint" style={{ textAlign: "right" }}>{fmt(entry.ceiling)}</td>
                  {hasProjection && (
                    <td className="num muted" style={{ textAlign: "right" }}>{entry.series.toFixed(1)}</td>
                  )}
                  <td className="num" style={{ textAlign: "right", fontWeight: 650, color: "var(--accent)" }}>
                    {fmt(entry.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TrainerTitles
        entries={players.filter((p) => p.role === role)}
        prefix={prefix}
        suffix={suffix}
        onPrefix={setPrefix}
        onSuffix={setSuffix}
      />

      <FantasySimulator
        players={players}
        role={role}
        roleLabel={ROLE_LABELS[role]}
        stage={stage}
        banner={banners[role]}
        risk={risk}
        onRisk={setRisk}
        seriesByTeam={seriesByTeam}
        onApply={(next) => setBanners((current) => ({ ...current, [role]: next }))}
      />

      {hasProjection && (
        <section className="card stack">
          <div className="row-between">
            <h2>Series · {STAGE_LABELS[stage]}</h2>
            <span className={`tag ${mapsSource === "actual" ? "tag-solid" : ""}`}>
              {mapsSource === "actual" ? "actually played"
                : mapsSource === "bracket" ? "your bracket"
                : "projected from Elo"}
            </span>
          </div>
          <p className="faint">
            {mapsSource === "actual" && (
              <>These are the series each team really played in the{" "}
                {stage === "groupStage" ? "group stage" : "playoffs"}. For a finished
                event this beats any projection, so it is what multiplies each
                entry&rsquo;s per-match score above.</>
            )}
            {mapsSource === "bracket" && (
              <>Taken from the bracket you built on the Bracket page, simulated on
                OpenDota&rsquo;s Elo ratings. Double elimination, Bo3 with a Bo5 grand
                final — the TI playoff shape.</>
            )}
            {mapsSource === "rating" && stage === "playoffs" && (
              <>No bracket built and no playoffs played, so this seeds the eight
                highest-rated teams and simulates that bracket from Elo. Build one on
                the Bracket page and this follows it.</>
            )}
            {mapsSource === "rating" && stage === "groupStage" && (
              <>The group stage is 44 Bo3 series over 16 teams, so the field averages{" "}
                {GROUP_STAGE_SHAPE.seriesPerTeam} each. How many a given team plays — four to
                six — falls out of the standings, and no rating predicts that, so every team
                gets the average. Flat is the honest answer here, and it means the group
                stage board is decided by per-match scoring rather than by a volume guess.</>
            )}
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Team</th>
                  {stage === "playoffs" && <th style={{ textAlign: "right" }}>Wins event</th>}
                  <th style={{ textAlign: "right" }}>Series</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(seriesByTeam)
                  .sort((a, b) => b[1] - a[1])
                  .map(([team, count], index) => (
                    <tr key={team}>
                      <td className="num faint">{index + 1}</td>
                      <td>{team}</td>
                      {stage === "playoffs" && (
                        <td className="num muted" style={{ textAlign: "right" }}>
                          {seeds.includes(team)
                            ? `${((championByTeam[team] ?? 0) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                      )}
                      <td className="num" style={{ textAlign: "right", fontWeight: 650 }}>
                        {count.toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="notice">
        Values are <strong>per match</strong>: a series scores as the sum of its two
        highest games, so a Bo3 that goes the distance still banks only two. Core and
        Support are ranked as same-team pairs, Mid as one player. OpenDota does not
        expose {UNAVAILABLE_STATS.join(", ")} reliably, so those emblems are missing.
        Floor and ceiling are the 10th and 95th percentile of the matches actually
        played — a small sample makes both unstable.
      </p>
    </div>
  );
}

function Breakdown({ ranked, banner, risk }: { ranked: Ranked; banner: Emblem[]; risk: number }) {
  const dist = useMemo(() => matchScores(ranked.player, banner), [ranked.player, banner]);
  const total = ranked.score;
  const span = ranked.ceiling - ranked.floor || 1;
  const marker = ((ranked.score - ranked.floor) / span) * 100;

  return (
    <div className="stack">
      <div>
        <strong style={{ fontSize: "1.1rem" }}>{ranked.player.name}</strong>{" "}
        <span className="muted">· {ranked.player.teamName}</span>
        {ranked.player.members && <span className="faint"> · same-team pair</span>}
        <div className="num" style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>
          {fmt(ranked.total)}
        </div>
        <span className="faint">
          projected over the stage · {fmt(ranked.score)} per match × {ranked.series.toFixed(1)} series
        </span>
      </div>

      <div>
        <div className="row-between faint">
          <span>{fmt(ranked.floor)}</span>
          <span>{dist.length} matches</span>
          <span>{fmt(ranked.ceiling)}</span>
        </div>
        <div className="range-track">
          <div className="range-marker" style={{ left: `${Math.min(100, Math.max(0, marker))}%` }} />
        </div>
        <span className="faint">floor → ceiling, marker at risk {risk}</span>
      </div>

      <div className="stack" style={{ gap: 7 }}>
        {ranked.contributions.map((c, index) => {
          const share = total > 0 ? Math.max(0, (c.points / total) * 100) : 0;
          return (
            <div key={index}>
              <div className="row-between" style={{ fontSize: "0.86rem" }}>
                <span>
                  <span className={`dot dot-${STAT_COLORS[c.emblem.stat]}`} />{" "}
                  {STAT_LABELS[c.emblem.stat]}
                  <span className="faint">
                    {" "}· {c.emblem.tier}
                    {c.emblem.trait !== "none" && ` · ${c.emblem.trait}`}
                  </span>
                </span>
                <span className="num">{fmt(c.points)}</span>
              </div>
              <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, share)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
