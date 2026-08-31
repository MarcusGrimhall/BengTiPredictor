import InformationTabs from "../../components/InformationTabs";
import { listLeagues, loadLeague, toPlayerEntries } from "../../lib/data";
import { buildLineups, optimizeEmblems, type Emblem, type PlayerEntry } from "../../lib/fantasy";
import { BANNER_SLOTS, Role, StatKey, statsForColor } from "../../lib/scoring";
import { STAGES, STAGE_SLOTS, type Stage } from "../../lib/stages";
import { statSpread, type RoleSpread } from "../../lib/statSpread";
import { preEventStrength } from "../../lib/strength";
import { monthsOf, poolWindow, windowCuts, type WindowSource } from "../../lib/metaWindow";
import { loadTraining } from "../../lib/data";

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

  // Pre-event form, where a training set exists for the event.
  const preEventStrengthFor = new Map<number, Record<string, { rating: number; maps: number; schedule: number }>>();
  for (const league of leagues) {
    const training = await loadTraining(league.leagueId);
    if (!training) continue;
    const results: Array<{ radiant: number; dire: number; radiantWin: boolean }> = [];
    const names: Record<number, string> = {};
    for (const source of training.sources) {
      const earlier = await loadLeague(source.leagueId);
      if (!earlier) continue;
      for (const t of earlier.teams) names[t.id] = t.name;
      for (const r of earlier.results ?? []) results.push(r);
    }
    if (results.length) preEventStrengthFor.set(league.leagueId, preEventStrength(results, names));
  }

  const spread: Record<string, Record<Stage, Record<Role, RoleSpread>>> = {};
  const meta: Array<{
    id: string;
    name: string;
    stages: Stage[];
    strongTeams: string[];
    strongBasis: "form" | "rating" | "placement";
    meta?: { months: number; events: number; maps: number; from: number; to: number };
  }> = [];

  // Meta windows: every event inside the last N months pooled into one sample,
  // so the Stats view can answer "what is the game like now" rather than only
  // "what happened at that tournament". Training events count - they are pro
  // matches like any other, and leaving them out would put a year-wide gap
  // between Internationals.
  const timeline = (await Promise.all(
    (await listLeagues()).map((l) => loadLeague(l.leagueId))
  )).filter((l): l is NonNullable<typeof l> => Boolean(l) && Boolean(l!.firstMatch));

  const sources: WindowSource[] = timeline.map((event) => ({
    leagueId: event.leagueId,
    leagueName: event.leagueName,
    date: event.firstMatch!,
    maps: event.matchesUsed,
    entries: buildLineups(toPlayerEntries(event))
  }));
  const newest = sources.length ? Math.max(...sources.map((s) => s.date)) : 0;

  // One window per possible cut, so any month the user types resolves to a real
  // sample rather than being snapped to a preset.
  for (const cut of windowCuts(sources)) {
    const months = monthsOf(cut, newest);
    const id = `meta-${cut}`;
    const { entries, events } = poolWindow(sources, cut);
    if (!entries.length || events.length < 2) continue;

    // A pooled window has no group stage or playoffs - it is professional play.
    spread[id] = { groupStage: {}, playoffs: {} } as Record<Stage, Record<Role, RoleSpread>>;
    // Strongest four across the window, by pre-event Elo over its own matches.
    const windowResults: Array<{ radiant: number; dire: number; radiantWin: boolean }> = [];
    const windowNames: Record<number, string> = {};
    for (const event of events) {
      const full = timeline.find((t) => t.leagueId === event.leagueId);
      if (!full) continue;
      for (const t of full.teams) windowNames[t.id] = t.name;
      for (const r of full.results ?? []) windowResults.push(r);
    }
    const form = preEventStrength(windowResults, windowNames);
    const strongWindow = new Set(
      Object.entries(form).sort((a, b) => b[1].rating - a[1].rating).slice(0, 4).map(([n]) => n)
    );

    const byRole = Object.fromEntries(ROLES.map((role) => {
      const colours = [...new Set(BANNER_SLOTS[role])];
      const stats = colours.flatMap((c) => statsForColor(c)) as StatKey[];
      return [role, statSpread(entries, role, stats, strongWindow)];
    })) as Record<Role, RoleSpread>;

    spread[id].groupStage = byRole;
    spread[id].playoffs = byRole;
    meta.push({
      id,
      name: `Last ${months} months`,
      stages: ["groupStage"],
      strongTeams: [...strongWindow],
      strongBasis: "form",
      meta: {
        months,
        events: events.length,
        maps: events.reduce((n, e) => n + e.maps, 0),
        from: events[0].date,
        to: newest
      }
    });
  }

  // Windows first: "what is the game like now" is the more useful default.
  meta.sort((a, b) => (a.meta ? 0 : 1) - (b.meta ? 0 : 1));

  // The trait study runs on the newest event only - it is about mechanics, not
  // about comparing tournaments.
  const primary = leagues[0];
  const entriesByStage = {} as Record<Stage, PlayerEntry[]>;
  const bannersByRole = {} as Record<Stage, Record<Role, Emblem[]>>;

  for (const league of leagues) {
    const id = String(league.leagueId);
    // "The top four teams" means the four that looked strongest GOING IN, not
    // the four that turned out best. Judging them on the result would make the
    // comparison circular: of course the teams that won produced more.
    //
    // Best source is form in the tournaments played before this event, since
    // that is what anyone actually had to go on. Failing that, the stored
    // rating - but only where it passed its accuracy check for this event.
    // Failing both, final placement, and the page says so.
    const priorForm = preEventStrengthFor.get(league.leagueId) ?? {};
    const named = new Map(league.teams.map((t) => [t.name, t]));
    const byForm = Object.entries(priorForm)
      .filter(([name]) => named.has(name))
      .sort((a, b) => b[1].rating - a[1].rating)
      .map(([name]) => name);

    const ratingsOk = league.ratingCheck?.usable ?? false;
    const byRating = [...league.teams]
      .filter((t) => t.elo != null)
      .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
      .map((t) => t.name);
    const byPlacement = [...league.teams]
      .filter((t) => (t.stages?.playoffs?.maps ?? 0) > 0)
      .sort((a, b) => (b.stages?.playoffs?.maps ?? 0) - (a.stages?.playoffs?.maps ?? 0))
      .map((t) => t.name);

    const strongBasis: "form" | "rating" | "placement" =
      byForm.length >= 4 ? "form" : ratingsOk && byRating.length >= 4 ? "rating" : "placement";
    const order = strongBasis === "form" ? byForm : strongBasis === "rating" ? byRating : byPlacement;
    const strong = new Set(order.slice(0, 4));

    const stagesPresent: Stage[] = [];
    spread[id] = {} as Record<Stage, Record<Role, RoleSpread>>;

    for (const stage of STAGES) {
      const entries = buildLineups(toPlayerEntries(league, stage));
      if (!entries.length) continue;
      stagesPresent.push(stage);

      spread[id][stage] = Object.fromEntries(ROLES.map((role) => {
        // Only stats a role's banner can actually hold.
        const colours = [...new Set(BANNER_SLOTS[role])];
        const stats = colours.flatMap((c) => statsForColor(c)) as StatKey[];
        return [role, statSpread(entries, role, stats, strong)];
      })) as Record<Role, RoleSpread>;

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
