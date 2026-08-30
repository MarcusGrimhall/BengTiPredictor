import InformationTabs from "../../components/InformationTabs";
import { listLeagues, loadLeague, toPlayerEntries } from "../../lib/data";
import { buildLineups, optimizeEmblems, type Emblem, type PlayerEntry } from "../../lib/fantasy";
import { BANNER_SLOTS, Role, StatKey, statsForColor } from "../../lib/scoring";
import { STAGES, STAGE_SLOTS, type Stage } from "../../lib/stages";
import { statSpread, type StatSpread } from "../../lib/statSpread";

export const metadata = { title: "Information · BengTiPredictor" };

const ROLES: Role[] = ["core", "mid", "support"];

function seedBanner(role: Role, slots: number): Emblem[] {
  const used = new Set<string>();
  return BANNER_SLOTS[role].slice(0, slots).map((color) => {
    const stat = statsForColor(color).find((s) => !used.has(s)) ?? statsForColor(color)[0];
    used.add(stat);
    return { stat, tier: "III", trait: "none" };
  });
}

export default async function InformationPage() {
  // Every real tournament, so the spread can be compared across events.
  const summaries = (await listLeagues()).filter((l) => !l.training);
  const leagues = (await Promise.all(summaries.map((s) => loadLeague(s.leagueId))))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  if (!leagues.length) {
    return (
      <main className="shell">
        <div className="page-head"><h1>Information</h1></div>
        <div className="notice">
          No tournament fetched. Run <code>npm run fetch -- &lt;league-id&gt;</code> first.
        </div>
      </main>
    );
  }

  const spread: Record<string, Record<Stage, Record<Role, StatSpread[]>>> = {};
  const meta: Array<{
    id: string;
    name: string;
    stages: Stage[];
    strongTeams: string[];
    strongBasis: "rating" | "placement";
  }> = [];

  // The trait study runs on the newest event only - it is about mechanics, not
  // about comparing tournaments.
  const primary = leagues[0];
  const entriesByStage = {} as Record<Stage, PlayerEntry[]>;
  const bannersByRole = {} as Record<Stage, Record<Role, Emblem[]>>;

  for (const league of leagues) {
    const id = String(league.leagueId);
    // "Good teams" means the four strongest by rating - a judgement about the
    // teams, not about how the event turned out. Using final placement instead
    // would make the comparison circular: of course the teams that won did
    // well.
    //
    // The ratings are graded per event at fetch time, and where they failed
    // that grading they cannot be used for this either, so those events fall
    // back to final placement and the page says which was used.
    const ratingsOk = league.ratingCheck?.usable ?? false;
    const byStrength = [...league.teams]
      .filter((t) => t.elo != null)
      .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
    const byPlacement = [...league.teams]
      .filter((t) => (t.stages?.playoffs?.maps ?? 0) > 0)
      .sort((a, b) => (b.stages?.playoffs?.maps ?? 0) - (a.stages?.playoffs?.maps ?? 0));
    const chosen = (ratingsOk && byStrength.length >= 4 ? byStrength : byPlacement).slice(0, 4);
    const strong = new Set(chosen.map((t) => t.name));
    const strongBasis = ratingsOk && byStrength.length >= 4 ? "rating" : "placement";

    const stagesPresent: Stage[] = [];
    spread[id] = {} as Record<Stage, Record<Role, StatSpread[]>>;

    for (const stage of STAGES) {
      const entries = buildLineups(toPlayerEntries(league, stage));
      if (!entries.length) continue;
      stagesPresent.push(stage);

      spread[id][stage] = Object.fromEntries(ROLES.map((role) => {
        // Only stats a role's banner can actually hold.
        const colours = [...new Set(BANNER_SLOTS[role])];
        const stats = colours.flatMap((c) => statsForColor(c)) as StatKey[];
        return [role, statSpread(entries, role, stats, strong)];
      })) as Record<Role, StatSpread[]>;

      if (league.leagueId === primary.leagueId) {
        entriesByStage[stage] = entries;
        const slots = STAGE_SLOTS[stage];
        bannersByRole[stage] = Object.fromEntries(ROLES.map((role) => {
          const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
          const seed = seedBanner(role, slots);
          const pool = entries.filter((e) => e.role === role);
          return [role, pool.length ? optimizeEmblems(pool, role, slotOptions, seed, 50, {}) : seed];
        })) as Record<Role, Emblem[]>;
      }
    }
    if (stagesPresent.length) {
      meta.push({
        id, name: league.leagueName, stages: stagesPresent,
        strongTeams: [...strong], strongBasis
      });
    }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">{meta.map((m) => m.name).join(" · ")}</span>
        <h1>Information</h1>
        <p className="muted" style={{ maxWidth: 700 }}>
          What every duo produced on every stat, and what the emblem mechanics are
          actually worth — measured against real players rather than read off a tooltip.
        </p>
      </div>
      <InformationTabs
        spread={spread}
        leagues={meta}
        entriesByStage={entriesByStage}
        bannersByRole={bannersByRole}
        leagueName={primary.leagueName}
      />
    </main>
  );
}
