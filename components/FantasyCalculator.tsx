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
import { STAGES, STAGE_LABELS, STAGE_SLOTS, STAGE_TOKENS, type Stage } from "../lib/stages";
import FantasySimulator, { riskLabel } from "./FantasySimulator";
import TrainerTitles from "./TrainerTitles";
import { effectiveSuffixValue, prefixValue, type PrefixKey, type SuffixKey } from "../lib/titles";
import { decodeSetup, encodeSetup } from "../lib/share";

const ROLES: Role[] = ["core", "mid", "support"];
const ROLE_LABELS: Record<Role, string> = { core: "Core", mid: "Mid", support: "Support" };
const ROLE_HINTS: Record<Role, string> = {
  core: "same-team pair",
  mid: "one player",
  support: "same-team pair"
};
const ROLE_ENTRY: Record<Role, string> = { core: "pair", mid: "player", support: "pair" };
const STORAGE_KEY = "bengti-banners-v1";

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
  strengthByTeam,
  leagueName,
  teams,
  stageSplit,
  projection
}: {
  playersByStage: Record<Stage, PlayerEntry[]>;
  actualByStage: Record<Stage, Record<string, number>>;
  groupProjection: Record<string, number>;
  /** Per-team score multiplier for the strength of the field. */
  strengthByTeam: Record<string, number>;
  leagueName: string;
  teams: TeamEntry[];
  stageSplit: boolean;
  projection: MainEventMaps;
}) {
  // Use the bracket the user built if there is one, else the Elo-seeded default.
  const playoffProjection = useMainEventMaps(teams, projection);
  const [banners, setBanners] = useState<Record<Role, Emblem[]>>(defaultBanners);
  const [stage, setStage] = useState<Stage>("groupStage");
  const [risk, setRisk] = useState(50);
  const [prefix, setPrefix] = useState<PrefixKey | null>(null);
  const [suffix, setSuffix] = useState<SuffixKey | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // A shared link is an explicit request to see that setup, so it beats
    // whatever this browser happened to have saved.
    const shared = decodeSetup(window.location.search);
    if (shared) {
      setBanners({ ...defaultBanners(), ...shared.banners });
      setRisk(shared.risk);
      setStage(shared.stage);
      setPrefix(shared.prefix as PrefixKey | null);
      setSuffix(shared.suffix as SuffixKey | null);
      setReady(true);
      return;
    }
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
  const allEntries = useMemo(
    () => buildLineups(playersByStage[stage] ?? []),
    [playersByStage, stage]
  );
  const playersByRole = useMemo(
    () => Object.fromEntries(
      ROLES.map((r) => [r, allEntries.filter((e) => e.role === r)])
    ) as Record<Role, PlayerEntry[]>,
    [allEntries]
  );
  const cards = useMemo(
    () => Object.fromEntries(ROLES.map((r) => [r, banners[r].slice(0, slots)])) as Record<Role, Emblem[]>,
    [banners, slots]
  );

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

  // A finished stage has real trigger rates; a projected one takes the
  // team-dependent titles from the bracket simulation instead.
  const titleOutlook = useMemo(
    () => (mapsSource === "actual" ? {} : playoffProjection.outlookByTeam ?? {}),
    [mapsSource, playoffProjection]
  );

  const slotOptionsFor = (r: Role) =>
    BANNER_SLOTS[r].slice(0, slots).map((color) => statsForColor(color));

  /**
   * One ranking per role, since a roster picks all three. Titles multiply the
   * whole roster but the Underdog fires on losses, so the rate is per entry and
   * the order can change - applied after ranking and re-sorted.
   */
  const rankedByRole = useMemo(() => {
    const out = {} as Record<Role, Ranked[]>;
    for (const r of ROLES) {
      const base = rankPlayers(playersByRole[r] ?? [], r, cards[r], risk, seriesByTeam, strengthByTeam);
      out[r] = (!prefix && !suffix)
        ? base
        : base
            .map((entry) => {
              const pf = prefix ? prefixValue(entry.player, prefix).multiplier : 1;
              const sf = suffix ? effectiveSuffixValue(entry.player, suffix, titleOutlook).multiplier : 1;
              const factor = pf * sf;
              return {
                ...entry,
                score: entry.score * factor, total: entry.total * factor,
                floor: entry.floor * factor, ceiling: entry.ceiling * factor
              };
            })
            .sort((a, b) => b.total - a.total);
    }
    return out;
  }, [playersByRole, cards, risk, seriesByTeam, strengthByTeam, prefix, suffix, titleOutlook]);

  const rosterTotal = ROLES.reduce((sum, r) => sum + (rankedByRole[r][0]?.total ?? 0), 0);

  const setBanner = (r: Role, banner: Emblem[]) =>
    setBanners((current) => ({ ...current, [r]: banner }));

  // Only the emblems this stage scores are optimised; the rest are left alone
  // so switching stages does not quietly rewrite the other card.
  const optimize = (r: Role, freeTiers: boolean) =>
    setBanners((current) => ({
      ...current,
      [r]: [
        ...optimizeEmblems(
          playersByRole[r] ?? [], r, slotOptionsFor(r),
          current[r].slice(0, slots), risk, seriesByTeam, { freeTiers }
        ),
        ...current[r].slice(slots)
      ]
    }));

  const optimizeAll = (freeTiers: boolean) => ROLES.forEach((r) => optimize(r, freeTiers));
  const resetAll = () => setBanners(defaultBanners());

  const info = riskLabel(risk);

  /** Copies a link that reproduces exactly what is on screen. */
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeSetup({ banners, risk, stage, prefix, suffix })}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused; putting it in the address bar still
      // gives the user something to copy by hand.
      window.history.replaceState(null, "", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const hasProjection = Object.keys(seriesByTeam).length > 0;
  const { championByTeam, seeds } = playoffProjection;
  // "Will they still be playing" is a sharper question than "how many on
  // average", and it only exists for a stage that has not happened yet.
  const atLeast = playoffProjection.atLeastByTeam ?? {};
  const showAtLeast = mapsSource !== "actual" && stage === "playoffs" && Object.keys(atLeast).length > 0;

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
                <span className="faint">· {STAGE_SLOTS[s]} emblems · {STAGE_TOKENS[s]} tokens</span>
              </button>
            ))}
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Two separate cards. This one scores over the{" "}
            <strong>{stage === "groupStage" ? "group stage" : "playoff"}</strong> matches
            only — {allEntries.length} entries from {Object.keys(seriesByTeam).length} teams
            {stage === "playoffs" && " that made the bracket"}. Group stage points do not
            carry into the playoff card, but the first three emblems do.
          </p>
        </section>
      )}

      <FantasySimulator
        playersByRole={playersByRole}
        banners={banners}
        risk={risk}
        stage={stage}
        onRisk={setRisk}
        seriesByTeam={seriesByTeam}
        onBanner={setBanner}
      />

      <section className="card stack">
        <div className="row-between">
          <div>
            <h2>Roster · {fmt(rosterTotal)}</h2>
            <p className="faint" style={{ marginTop: 2 }}>
              The best entry at each role under the banners above, at risk {risk}.
              <br />
              <strong>Best possible</strong> is the banner to aim for — free choice of tier,
              so it is a target rather than something you hold.{" "}
              <strong>Arrange what I hold</strong> keeps your tiers and only moves them
              between slots, which answers where to put what you already have.
              <br />
              Why the two disagree on <em>Fractal</em>: it pays +60% only when all five
              tiers differ, which caps you at one tier V. Five tier V + Friendly sums to
              a ×15.0 banner; I–V + Fractal sums to ×11.5. So Fractal is never right when
              tiers are free — but if the five you hold are already all different, it beats
              Friendly on those same tiers (×11.5 against ×11.0).
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => optimizeAll(true)} className="btn-primary"
              title="The banner to aim for: best stats, best traits, every emblem at the tier it should be">
              Best possible
            </button>
            <button onClick={() => optimizeAll(false)}
              title="Keep the tiers you actually hold and only rearrange them, along with stats and traits">
              Arrange what I hold
            </button>
            <button onClick={share} title="Copy a link that reproduces this exact setup">
              {copied ? "Link copied" : "Share setup"}
            </button>
            <button onClick={resetAll}>Reset</button>
          </div>
        </div>
        <div className="grid grid-3">
          {ROLES.map((r) => {
            const best = rankedByRole[r][0];
            return (
              <div key={r} className="sub-card stack" style={{ gap: 6 }}>
                <div className="row-between">
                  <strong>{ROLE_LABELS[r]}</strong>
                  <span className="faint">{ROLE_HINTS[r]}</span>
                </div>
                {best ? (
                  <>
                    <div className="num" style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent)" }}>
                      {fmt(best.total)}
                    </div>
                    <div>{best.player.name}</div>
                    <span className="faint">
                      {best.player.teamName} · best of {best.series.toFixed(1)} series
                    </span>
                  </>
                ) : (
                  <span className="muted">No entries</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {ROLES.map((r) => (
        <section key={r} className="card stack">
          <div className="row-between">
            <h2>Ranking · {ROLE_LABELS[r]}</h2>
            <span className="faint">
              {leagueName} · {cards[r].map((e) => STAT_LABELS[e.stat]).join(" · ")}{" "}
              <button className="link-button" onClick={() => optimize(r, true)}>optimise</button>
            </span>
          </div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>{ROLE_ENTRY[r] === "pair" ? "Pair" : "Player"}</th><th>Team</th>
                  <th style={{ textAlign: "right" }}>Floor</th>
                  <th style={{ textAlign: "right" }}>At risk</th>
                  <th style={{ textAlign: "right" }}>Ceiling</th>
                  {hasProjection && <th style={{ textAlign: "right" }}>Series</th>}
                  <th style={{ textAlign: "right" }}>{stageSplit ? STAGE_LABELS[stage] : "Tournament"}</th>
                </tr>
              </thead>
              <tbody>
                {rankedByRole[r].slice(0, 10).map((entry, index) => (
                  <tr key={entry.player.id}>
                    <td className="num faint">{index + 1}</td>
                    <td>
                      <strong>{entry.player.name}</strong>
                      <span className="faint"> · {entry.player.games}g</span>
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
          {rankedByRole[r][0] && (
            <Breakdown ranked={rankedByRole[r][0]} banner={cards[r]} risk={risk} />
          )}
        </section>
      ))}

      <TrainerTitles
        entries={allEntries}
        prefix={prefix}
        suffix={suffix}
        onPrefix={setPrefix}
        onSuffix={setSuffix}
        outlookByTeam={playoffProjection.outlookByTeam ?? {}}
        projecting={mapsSource !== "actual"}
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
                highest-rated teams and simulates that bracket from Elo.</>
            )}
            {mapsSource === "rating" && stage === "groupStage" && (
              <>Every team gets this event&rsquo;s own group stage average. How many series
                a given team plays falls out of the standings, and no rating predicts that,
                so flat is the honest answer.</>
            )}
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Team</th>
                  {stage === "playoffs" && <th style={{ textAlign: "right" }}>Wins event</th>}
                  {showAtLeast && (
                    <>
                      <th style={{ textAlign: "right" }}>2+ series</th>
                      <th style={{ textAlign: "right" }}>3+</th>
                      <th style={{ textAlign: "right" }}>4+</th>
                    </>
                  )}
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
                      {showAtLeast && (
                        <>
                          <td className="num muted" style={{ textAlign: "right" }}>
                            {atLeast[team] ? `${(atLeast[team].two * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="num muted" style={{ textAlign: "right" }}>
                            {atLeast[team] ? `${(atLeast[team].three * 100).toFixed(0)}%` : "—"}
                          </td>
                          <td className="num muted" style={{ textAlign: "right" }}>
                            {atLeast[team] ? `${(atLeast[team].four * 100).toFixed(0)}%` : "—"}
                          </td>
                        </>
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
        Values are <strong>per series</strong>: the sum of a series&rsquo; two highest
        games, so a third game only counts if it displaces one of the first two. Core and
        Support are ranked as same-team pairs and valued as the
        <strong> average</strong> of the two players, so all three roles are on one scale.
        OpenDota does not expose {UNAVAILABLE_STATS.join(", ")} reliably, so those emblems
        are missing.
      </p>
    </div>
  );
}

function Breakdown({ ranked, banner, risk }: { ranked: Ranked; banner: Emblem[]; risk: number }) {
  const dist = useMemo(() => matchScores(ranked.player, banner), [ranked.player, banner]);
  const total = ranked.score;
  const span = ranked.ceiling - ranked.floor || 1;
  const marker = ((ranked.score - ranked.floor) / span) * 100;

  // `contributions` is an average series; the headline is the best of several
  // at the chosen risk, with any title multiplier already in it. Same unit,
  // different point on the distribution - so the rows are lifted onto the
  // headline by one factor and add up to it.
  const mean = ranked.contributions.reduce((sum, c) => sum + c.points, 0);
  const scale = mean > 0 ? total / mean : 0;

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
          projected over the stage · the best of {ranked.series.toFixed(1)} series at risk {risk}
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
          const points = c.points * scale;
          const share = total > 0 ? Math.max(0, (points / total) * 100) : 0;
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
                <span className="num">{fmt(points)}</span>
              </div>
              <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, share)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
