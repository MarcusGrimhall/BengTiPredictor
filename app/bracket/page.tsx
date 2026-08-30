import BracketBuilder from "../../components/BracketBuilder";
import { loadDefaultLeague } from "../../lib/data";
import { buildEnsemble, buildStructure, simulate } from "../../lib/bracket";
import { seedByRating } from "../../lib/tiBracket";
import { DEFAULT_ELO } from "../../lib/elo";
import RatingWarning from "../../components/RatingWarning";

export const metadata = { title: "Bracket simulator · BengTiPredictor" };

export default async function BracketPage() {
  const league = await loadDefaultLeague();

  if (!league) {
    return (
      <main className="shell">
        <div className="page-head"><h1>Bracket simulator</h1></div>
        <div className="notice">
          No tournament fetched. Run <code>npm run fetch -- &lt;league-id&gt;</code> first.
        </div>
      </main>
    );
  }

  // The bracket ensemble is generated here, at build time, and shipped as data.
  // The page then scores any set of picks by counting against it - no
  // simulation runs in the browser.
  const seeds = seedByRating(league.teams, 8);
  const ratings = Object.fromEntries(league.teams.map((t) => [t.name, t.elo ?? DEFAULT_ELO]));
  const structure = buildStructure(8, "double");
  const precomputed = seeds.length === 8
    ? {
        ensemble: buildEnsemble(structure, seeds, ratings, 10000),
        // Team-level outlooks depend on the seeding, never on your picks, so
        // they are answered once here rather than recomputed on every click.
        teams: simulate(structure, seeds, {}, ratings, 20000).teams
      }
    : null;

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">{league.leagueName}</span>
        <h1>Bracket simulator</h1>
        <p className="muted">
          Pick teams and a format, click your winners, and see how often your
          bracket lands across 20,000 simulations.
        </p>
        <RatingWarning check={league.ratingCheck} />
      </div>
      <BracketBuilder teams={league.teams} precomputed={precomputed} />
    </main>
  );
}
