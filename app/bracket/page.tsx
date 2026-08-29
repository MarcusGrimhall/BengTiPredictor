import BracketBuilder from "../../components/BracketBuilder";
import { loadDefaultLeague } from "../../lib/data";
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
      <BracketBuilder teams={league.teams} />
    </main>
  );
}
