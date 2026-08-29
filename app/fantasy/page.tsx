import FantasyCalculator from "../../components/FantasyCalculator";
import { actualSeriesByStage, loadDefaultLeague, toPlayerEntries } from "../../lib/data";
import { projectGroupStageSeries } from "../../lib/groupStage";
import { strengthByTeam } from "../../lib/strength";
import { projectMainEvent } from "../../lib/tiBracket";
import { STAGES, type Stage } from "../../lib/stages";
import type { PlayerEntry } from "../../lib/fantasy";
import RatingWarning from "../../components/RatingWarning";

export const metadata = { title: "Fantasy calculator · BengTiPredictor" };

export default async function FantasyPage() {
  const league = await loadDefaultLeague();

  if (!league) {
    return (
      <main className="shell">
        <div className="page-head"><h1>Fantasy calculator</h1></div>
        <div className="notice">
          No tournament fetched. Run <code>npm run fetch -- &lt;league-id&gt;</code> first.
        </div>
      </main>
    );
  }

  // The two fantasy cards score over different matches, so each stage gets its
  // own player rows, its own averages and its own map counts.
  const playersByStage = Object.fromEntries(
    STAGES.map((stage) => [stage, toPlayerEntries(league, stage)])
  ) as Record<Stage, PlayerEntry[]>;

  // Series, not maps: a match scores as its two best games however long the
  // series runs, so series is what a fantasy value is multiplied by.
  const actualByStage = Object.fromEntries(
    STAGES.map((stage) => [stage, actualSeriesByStage(league, stage)])
  ) as Record<Stage, Record<string, number>>;

  // The TI playoff bracket is the same shape every year, so it can be projected
  // before it is played. Done at build time.
  const projection = projectMainEvent(league.teams);

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">{league.leagueName}</span>
        <h1>Fantasy calculator</h1>
        <p className="muted" style={{ maxWidth: 660 }}>
          Every score below is drawn from the {league.matchesUsed} matches actually
          played, split into the two fantasy periods the way the event was.
        </p>
        <RatingWarning check={league.ratingCheck} />
      </div>
      <FantasyCalculator
        playersByStage={playersByStage}
        actualByStage={actualByStage}
        groupProjection={projectGroupStageSeries(league.teams)}
        strengthByTeam={strengthByTeam(league.teams)}
        leagueName={league.leagueName}
        teams={league.teams}
        stageSplit={league.stages?.split ?? false}
        projection={{
          mapsByTeam: projection.mapsByTeam,
          seriesByTeam: projection.seriesByTeam,
          outlookByTeam: projection.outlookByTeam,
          championByTeam: projection.championByTeam,
          seeds: projection.seeds,
          source: "rating"
        }}
      />
    </main>
  );
}
