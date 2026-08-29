"use client";

import { useMemo } from "react";
import type { PlayerEntry } from "../lib/fantasy";
import {
  PREFIXES, SUFFIXES, PrefixKey, SuffixKey,
  heroGroupsKnown, prefixValue, suffixValue
} from "../lib/titles";

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/**
 * One shared Prefix and one shared Suffix apply to the whole roster.
 *
 * The headline percentage is the wrong number to pick on: the Lucky pays 21%
 * but only when a game's duration ends in the digit 8. What matters is
 * bonus x how often the condition actually fires, measured over the games in
 * this stage's data.
 */
export default function TrainerTitles({
  entries, prefix, suffix, onPrefix, onSuffix
}: {
  entries: PlayerEntry[];
  prefix: PrefixKey | null;
  suffix: SuffixKey | null;
  onPrefix: (key: PrefixKey | null) => void;
  onSuffix: (key: SuffixKey | null) => void;
}) {
  // Rates are averaged across the field: most conditions are game-level and
  // identical for everyone, and the Underdog varies only by how often a team
  // loses. A per-entry rate is applied when the ranking is scored.
  const suffixRows = useMemo(
    () => (Object.keys(SUFFIXES) as SuffixKey[]).map((key) => {
      const values = entries.map((e) => suffixValue(e, key));
      const known = values.filter((v) => v.rate !== null);
      const rate = known.length
        ? known.reduce((sum, v) => sum + (v.rate ?? 0), 0) / known.length
        : null;
      return { key, ...SUFFIXES[key], rate, multiplier: rate === null ? null : 1 + (SUFFIXES[key].bonus / 100) * rate };
    }).sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0)),
    [entries]
  );

  const prefixRows = useMemo(
    () => (Object.keys(PREFIXES) as PrefixKey[]).map((key) => {
      const values = entries.map((e) => prefixValue(e, key));
      const known = values.filter((v) => v.rate !== null);
      const rate = known.length
        ? known.reduce((sum, v) => sum + (v.rate ?? 0), 0) / known.length
        : null;
      return { key, ...PREFIXES[key], rate, multiplier: rate === null ? null : 1 + (PREFIXES[key].bonus / 100) * rate };
    }),
    [entries]
  );

  return (
    <section className="card stack">
      <div className="row-between">
        <div>
          <h2>Trainer titles</h2>
          <p className="faint" style={{ marginTop: 2 }}>
            One Prefix and one Suffix apply to the whole roster. Both are conditional,
            so what counts is the bonus multiplied by how often the condition actually
            fires — measured here over this stage&rsquo;s games.
          </p>
        </div>
        <button onClick={() => { onPrefix(null); onSuffix(null); }}>Clear</button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Suffix</h3>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th></th><th>Suffix</th><th>Fires when</th>
                <th style={{ textAlign: "right" }}>Bonus</th>
                <th style={{ textAlign: "right" }}>Fires</th>
                <th style={{ textAlign: "right" }}>Worth</th>
              </tr>
            </thead>
            <tbody>
              {suffixRows.map((row, index) => (
                <tr key={row.key} className={suffix === row.key ? "row-on" : ""}>
                  <td>
                    <input
                      type="radio" name="suffix" checked={suffix === row.key}
                      disabled={row.rate === null}
                      onChange={() => onSuffix(row.key)}
                      aria-label={row.label}
                    />
                  </td>
                  <td>
                    {index === 0 && row.rate !== null && <span className="tag" style={{ marginRight: 6 }}>best</span>}
                    {row.label}
                  </td>
                  <td className="muted" style={{ fontSize: "0.86rem" }}>
                    {row.condition}
                    {row.why && <span className="faint"> — {row.why}</span>}
                  </td>
                  <td className="num muted" style={{ textAlign: "right" }}>+{row.bonus}%</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {row.rate === null ? <span className="faint">unknown</span> : pct(row.rate)}
                  </td>
                  <td className="num" style={{ textAlign: "right", fontWeight: 650, color: "var(--accent)" }}>
                    {row.multiplier === null ? <span className="faint">—</span> : `+${((row.multiplier - 1) * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <h3>Prefix</h3>
        {!heroGroupsKnown() && (
          <p className="notice notice-warn">
            <strong>Prefixes cannot be valued yet.</strong> Every Prefix fires on the
            hero&rsquo;s colour or theme group, and that classification is Valve&rsquo;s —
            it is not in any public API. OpenDota&rsquo;s hero constants carry only
            primary attribute, attack type and roles. Fill <code>HERO_GROUPS</code> in{" "}
            <code>lib/titles.ts</code> and the rates below compute themselves from the
            heroes each player actually picked, which is already in the data.
          </p>
        )}
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th></th><th>Prefix</th><th>Fires when</th>
                <th style={{ textAlign: "right" }}>Bonus</th>
                <th style={{ textAlign: "right" }}>Fires</th>
              </tr>
            </thead>
            <tbody>
              {prefixRows.map((row) => (
                <tr key={row.key} className={prefix === row.key ? "row-on" : ""}>
                  <td>
                    <input
                      type="radio" name="prefix" checked={prefix === row.key}
                      disabled={row.rate === null}
                      onChange={() => onPrefix(row.key)}
                      aria-label={row.label}
                    />
                  </td>
                  <td>{row.label}</td>
                  <td className="muted" style={{ fontSize: "0.86rem" }}>{row.condition}</td>
                  <td className="num muted" style={{ textAlign: "right" }}>+{row.bonus}%</td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {row.rate === null ? <span className="faint">unknown</span> : pct(row.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
