import TraitMap from "../../components/TraitMap";
import { loadDefaultLeague, toPlayerEntries } from "../../lib/data";
import { buildLineups, optimizeEmblems, type Emblem, type PlayerEntry } from "../../lib/fantasy";
import { BANNER_SLOTS, Role, statsForColor } from "../../lib/scoring";
import { STAGES, STAGE_SLOTS, type Stage } from "../../lib/stages";

export const metadata = { title: "Information · BengTiPredictor" };

const ROLES: Role[] = ["core", "mid", "support"];

/** A distinct-stat starting banner, so the optimiser has somewhere legal to begin. */
function seedBanner(role: Role, slots: number): Emblem[] {
  const used = new Set<string>();
  return BANNER_SLOTS[role].slice(0, slots).map((color) => {
    const stat = statsForColor(color).find((s) => !used.has(s)) ?? statsForColor(color)[0];
    used.add(stat);
    return { stat, tier: "III", trait: "none" };
  });
}

export default async function InformationPage() {
  const league = await loadDefaultLeague();

  if (!league) {
    return (
      <main className="shell">
        <div className="page-head"><h1>Information</h1></div>
        <div className="notice">
          No tournament fetched. Run <code>npm run fetch -- &lt;league-id&gt;</code> first.
        </div>
      </main>
    );
  }

  const entriesByStage = Object.fromEntries(
    STAGES.map((stage) => [stage, buildLineups(toPlayerEntries(league, stage))])
  ) as Record<Stage, PlayerEntry[]>;

  // One reference banner per role per stage: the best set of stats for that
  // stage, all at tier III with no traits. Traits are then measured against it,
  // so a trait's value is not confounded by a badly chosen banner.
  const bannersByRole = Object.fromEntries(
    STAGES.map((stage) => {
      const slots = STAGE_SLOTS[stage];
      const entries = entriesByStage[stage];
      return [stage, Object.fromEntries(ROLES.map((role) => {
        const slotOptions = BANNER_SLOTS[role].slice(0, slots).map((c) => statsForColor(c));
        const seed = seedBanner(role, slots);
        const pool = entries.filter((e) => e.role === role);
        return [role, pool.length ? optimizeEmblems(pool, role, slotOptions, seed, 50, {}) : seed];
      })) as Record<Role, Emblem[]>];
    })
  ) as Record<Stage, Record<Role, Emblem[]>>;

  return (
    <main className="shell">
      <div className="page-head">
        <span className="eyebrow">{league.leagueName}</span>
        <h1>Information</h1>
        <p className="muted" style={{ maxWidth: 700 }}>
          What every trait is actually worth, measured against real players rather than
          read off the tooltip — and who banked the most when it counted.
        </p>
      </div>
      <TraitMap
        entriesByStage={entriesByStage}
        bannersByRole={bannersByRole}
        leagueName={league.leagueName}
      />
    </main>
  );
}
