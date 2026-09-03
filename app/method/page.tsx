import { loadDefaultLeague } from "../../lib/data";
import { POINT_VALUES, STAT_DEFINITIONS, STAT_LABELS, STAT_KEYS } from "../../lib/scoring";
import { TIER_BONUSES, TRAIT_DESCRIPTIONS, TRAITS } from "../../lib/fantasy";

export const metadata = { title: "Method · BengTiPredictor" };

export default async function MethodPage() {
  const league = await loadDefaultLeague();

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">Open maths</span>
        <h1>How the numbers are calculated</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Match structure comes from OpenDota, with exact game-state counters
          overlaid from Dota replays where available. Every step can be re-run.
        </p>
      </div>

      <div className="stack">
        <section className="card stack">
          <h2>From match to points</h2>
          <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            <li><code>npm run fetch -- &lt;league-id&gt;</code> pulls every match in the tournament.</li>
            <li>Raw values are extracted per player per game: kills, last hits, GPM, wards and so on.</li>
            <li>Role is derived per team and match: mid from <code>lane_role</code>, then the two highest last-hit players as core and the remaining two as support.</li>
            <li>Raw values are averaged per game across every match the player appeared in.</li>
            <li>Only in the browser do raw values become points, using the table below.</li>
          </ol>
          <p className="faint">
            Scores are therefore a <strong>per-game</strong> average. We store raw values
            rather than finished points — if Valve changes the scale, one constant
            changes and no re-fetch is needed.
          </p>
        </section>

        <div className="grid grid-2">
          <section className="card stack">
            <h2>Points per unit</h2>
            <p className="faint">
              Valve&rsquo;s official TI 2026 Compendium fantasy scale. Nothing pays a
              penalty — Deaths floors at zero rather than going negative. Hover a
              stat to see what the number actually counts.
            </p>
            <div className="scroll-x">
              <table>
                <thead><tr><th>Stat</th><th style={{ textAlign: "right" }}>Formula</th></tr></thead>
                <tbody>
                  {STAT_KEYS.map((key) => {
                    const { per, base } = POINT_VALUES[key];
                    return (
                      <tr key={key}>
                        <td title={STAT_DEFINITIONS[key]}>{STAT_LABELS[key]}</td>
                        <td className="num" style={{ textAlign: "right" }}>
                          {base ? `${base} − ${Math.abs(per)} ×` : `${per} ×`} value
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card stack">
            <h2>Tiers and traits</h2>
            <p className="muted">
              An emblem contributes <span className="num">raw → points × tier × trait</span>.
              Traits are multiplicative, and several can hit the same emblem.
            </p>
            <div className="pill-row">
              {Object.entries(TIER_BONUSES).map(([tier, bonus]) => (
                <span className="pill" key={tier}>{tier} · +{bonus}%</span>
              ))}
            </div>
            <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
              {TRAITS.filter((t) => t !== "none").map((t) => (
                <li key={t}><strong>{t}</strong> — {TRAIT_DESCRIPTIONS[t]}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="card stack">
          <h2>Team strength</h2>
          <p className="muted">
            Nobody types in strength numbers. OpenDota maintains an Elo rating per team
            at <code>/api/teams</code>, updated after every professional match, and that
            is what drives the model. Every paid odds API we checked — The Odds API,
            PandaScore, Abios — requires a key, and none of them is needed for this.
          </p>
          <p className="muted">
            Elo ratings are per <strong>map</strong>, so a series has to be derived from them:
          </p>
          <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            <li>Map: <span className="num">1 / (1 + 10^((Rb − Ra) / 400))</span></li>
            <li>Series: the chance of reaching ⌈N/2⌉ map wins first, summed over every way it can end.</li>
            <li>Expected maps: the same sum, weighted by how long each ending takes.</li>
          </ul>
          <p className="faint">
            A best-of-3 amplifies the favourite — 60% per map becomes 65% per series, and a
            best-of-5 pushes it to 68%. That is why the bracket is simulated map by map
            rather than series by series.
          </p>
        </section>

        <section className="card stack">
          <h2>Risk and the score distribution</h2>
          <p className="muted">
            An average hides what matters in fantasy. We keep every individual game a
            player played and re-score all of them against your banner, which gives a real
            distribution instead of a single number. That also preserves the correlation
            between stats — a big game tends to have high kills <em>and</em> high GPM at
            once, which a mean-and-standard-deviation model would throw away.
          </p>
          <p className="muted">
            The risk slider picks a percentile of that distribution: risk 0 reads the 10th
            percentile (the floor — who holds up on a bad day), risk 50 the median, risk 100
            the 95th (the ceiling — who can actually spike). Different players win at
            different risk levels, which is the whole point.
          </p>
          <p className="faint">
            A player with few games has an unstable floor and ceiling. The games count is
            shown next to every name.
          </p>
        </section>

        <section className="card stack">
          <h2>From per game to per tournament</h2>
          <p className="muted">
            A player only scores in games their team actually plays. The TI main event
            bracket is the same every year — eight teams, double elimination, Bo3 with a
            Bo5 grand final — so we simulate it 20,000 times from the Elo ratings and read
            off how many maps each team is expected to play. The tournament projection is
            simply the per-game score at your risk level multiplied by that number.
          </p>
          <p className="faint">
            Double elimination guarantees at least two series, so even the weakest seed
            projects around 7 maps while the favourite projects around 12.
          </p>
        </section>

        <section className="card stack">
          <h2>Banner rules</h2>
          <p className="muted">
            A banner shows each stat <strong>once</strong> — three Last Hits emblems is not
            a legal banner, so the stat dropdowns hide anything already used and the
            optimiser never proposes a duplicate.
          </p>
          <p className="muted">
            The group stage runs on the first three emblems; the main event keeps those and
            adds two more. Slot colours are fixed:
          </p>
          <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            <li><strong>Core</strong> — 3 red, 2 green (group stage: 2 red, 1 green)</li>
            <li><strong>Mid</strong> — 2 red, 1 blue, 2 green (group stage: one of each)</li>
            <li><strong>Support</strong> — 3 blue, 2 green (group stage: 2 blue, 1 green)</li>
          </ul>
        </section>

        <section className="card stack">
          <h2>Rerolls</h2>
          <p className="muted">
            You get 40 tokens for the group stage and 30 fresh ones for the main event;
            unused group stage tokens expire at roster lock. The menu lets you reroll the
            stat, the quality or the trait, scoped to all / the first / the last / a random
            emblem of one colour, plus two wildcards that shuffle qualities.
          </p>
          <p className="muted">
            The simulator takes your current banner and the options the game is offering,
            rolls each one 800 times, and reports the average result, how often it actually
            improves, the P10–P90 spread and the gain per token. A high average with a low
            improve rate is a gamble that pays big and rarely — which is exactly the thing
            you want to see before spending.
          </p>
          <p className="faint">
            The tier/trait roll distributions are assumptions. Valve does
            not publish them and no guide lists them; they are constants in
            <code> lib/reroll.ts</code>.
          </p>
        </section>

        <section className="card stack">
          <h2>Replay-only counters</h2>
          <p className="muted">
            Teamfight, Watchers, Lotuses, Madstones and Tormentor participation are read from
            Dota&apos;s end-of-game replay counters where a replay overlay is available. This
            recovers stats that ordinary OpenDota and STRATZ responses omit or misattribute.
          </p>
          <p className="faint">
            Older tournaments without an imported replay retain documented fallbacks:
            OpenDota&apos;s Teamfight value, last-hit Tormentor credit and the Madstone bundle
            estimate. Watchers and Lotuses remain zero only in those older, uncovered events.
          </p>
          <p className="faint">
            Role assignment is a heuristic. A position 4 who farms heavily can land as a core
            in individual matches; across a full tournament it evens out.
          </p>
        </section>

        {league && (
          <p className="faint">
            Active data: {league.leagueName}, {league.matchesUsed} matches,
            fetched {new Date(league.fetchedAt).toLocaleDateString("en-GB")}.
          </p>
        )}
      </div>
    </main>
  );
}
