import Link from "next/link";
import { listLeagues, loadDefaultLeague } from "../lib/data";

export default async function Home() {
  const [leagues, league] = await Promise.all([listLeagues(), loadDefaultLeague()]);

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">Dota 2 · The International</span>
        <h1>BengTiPredictor</h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          Build fantasy banners and simulate tournaments on real match data from
          OpenDota. Not tied to a single event — fetch whichever tournament you
          want to work on and the tools adapt to it.
        </p>
      </div>

      {!league && (
        <div className="notice">
          No tournament fetched yet. Run <code>npm run leagues -- international</code> to
          find a league ID, then <code>npm run fetch -- &lt;id&gt;</code>.
        </div>
      )}

      {league && (
        <div className="stack">
          <section className="card">
            <div className="row-between">
              <div>
                <span className="eyebrow">Active tournament</span>
                <h2>{league.leagueName}</h2>
              </div>
              <span className="tag">
                fetched {new Date(league.fetchedAt).toLocaleDateString("en-GB")}
              </span>
            </div>
            <div className="stat-tiles" style={{ marginTop: 16 }}>
              <div className="stat-tile">
                <small>Matches</small><b>{league.matchesUsed}</b>
                <span className="faint">of {league.matchesTotal} fetched</span>
              </div>
              <div className="stat-tile">
                <small>Teams</small><b>{league.teams.length}</b>
              </div>
              <div className="stat-tile">
                <small>Players</small><b>{league.players.length}</b>
                <span className="faint">min {league.minGames} games</span>
              </div>
              <div className="stat-tile">
                <small>Stats per player</small><b>{league.availableStats.length}</b>
                <span className="faint">of 18 in fantasy</span>
              </div>
            </div>
          </section>

          <div className="grid grid-2">
            <Link href="/fantasy" className="card stack" style={{ textDecoration: "none" }}>
              <span className="eyebrow">Tool</span>
              <h2>Fantasy calculator</h2>
              <p className="muted">
                Set five emblems per banner, pick tier and trait, and see which
                players score highest. The optimiser tries every stat allowed in
                each slot.
              </p>
            </Link>
            <Link href="/bracket" className="card stack" style={{ textDecoration: "none" }}>
              <span className="eyebrow">Tool</span>
              <h2>Bracket simulator</h2>
              <p className="muted">
                Choose the number of teams, the format and who plays who. Click
                through your bracket and see how it holds up over 20,000 simulations.
              </p>
            </Link>
          </div>

          {leagues.length > 1 && (
            <section className="card stack">
              <h2>Fetched tournaments</h2>
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr><th>Tournament</th><th>Matches</th><th>Teams</th><th>Players</th><th>Fetched</th></tr>
                  </thead>
                  <tbody>
                    {leagues.map((l) => (
                      <tr key={l.leagueId}>
                        <td>{l.leagueName}</td>
                        <td className="num muted">{l.matchesUsed}</td>
                        <td className="num muted">{l.teams}</td>
                        <td className="num muted">{l.players}</td>
                        <td className="muted">{new Date(l.fetchedAt).toLocaleDateString("en-GB")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
