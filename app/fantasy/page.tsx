import FantasyCalculator from "../../components/FantasyCalculator";
import { loadDefaultLeague, loadLeague, loadReliability, loadTraining, trainingPlayerEntries } from "../../lib/data";
import { projectGroupStageSeries } from "../../lib/groupStage";
import { preEventStrength, strengthByTeam } from "../../lib/strength";
import { projectMainEvent, topFourSeriesByTeam } from "../../lib/tiBracket";
import { STAGES, type Stage } from "../../lib/stages";
import { shrinkEntries } from "../../lib/reliability";
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

  const training = await loadTraining(league.leagueId);
  if (!training) {
    return (
      <main className="shell">
        <div className="page-head"><h1>Fantasy calculator</h1></div>
        <div className="notice">
          No pre-event training set. Run <code>npm run train -- {league.leagueId}</code>.
        </div>
      </main>
    );
  }

  // Prediction uses only matches before the target event. `/information`
  // deliberately keeps the target's raw games because it reports history.
  const reliability = await loadReliability();
  const predicted = shrinkEntries(trainingPlayerEntries(training), reliability);
  const playersByStage = Object.fromEntries(
    STAGES.map((stage) => [stage, predicted])
  ) as Record<Stage, PlayerEntry[]>;

  // The user chooses which teams to trust. Group volume is flat; every playoff
  // team is evaluated as a top-four finisher instead of inheriting Elo risk.
  const actualByStage = { groupStage: {}, playoffs: {} } as Record<Stage, Record<string, number>>;
  const groupProjection = projectGroupStageSeries(league.teams);
  const topFourProjection = topFourSeriesByTeam(league.teams);

  // Build strength chronologically from the same pre-event sources as player
  // form. The ratings stored on the target league are current and can include
  // matches played after fantasy locked.
  const sourceLeagues = (await Promise.all(training.sources.map((source) => loadLeague(source.leagueId))))
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .sort((a, b) => (a.firstMatch ?? 0) - (b.firstMatch ?? 0));
  const teamNames = Object.fromEntries(league.teams.map((team) => [team.id, team.name]));
  const preEvent = preEventStrength(sourceLeagues.flatMap((source) => source.results ?? []), teamNames, 4);
  const preEventTeams = league.teams.map((team) => ({
    ...team,
    elo: preEvent[team.name]?.rating ?? null
  }));

  // The TI playoff bracket is the same shape every year, so it can be projected
  // before it is played. Done at build time.
  const projection = projectMainEvent(league.teams);

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">{league.leagueName}</span>
        <h1>Fantasy calculator</h1>
        <p className="muted" style={{ maxWidth: 660 }}>
          Prediction from {training.sources.length} earlier tournaments and {training.players.reduce((n, p) => n + p.samples.length, 0)}
          weighted map samples. Choose the teams you trust; every playoff entry is evaluated as a top-four finish.
        </p>
        <RatingWarning check={league.ratingCheck} />
      </div>
      <FantasyCalculator
        playersByStage={playersByStage}
        actualByStage={actualByStage}
        groupProjection={groupProjection}
        strengthByTeam={strengthByTeam(preEventTeams)}
        leagueName={league.leagueName}
        teams={league.teams}
        stageSplit={league.stages?.split ?? false}
        projection={{
          mapsByTeam: projection.mapsByTeam,
          seriesByTeam: topFourProjection,
          outlookByTeam: projection.outlookByTeam,
          atLeastByTeam: projection.atLeastByTeam,
          championByTeam: projection.championByTeam,
          seeds: projection.seeds,
          source: "topFour"
        }}
      />
    </main>
  );
}
