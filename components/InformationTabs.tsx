"use client";

import { useState } from "react";
import StatSpreadChart, { type SpreadData } from "./StatSpreadChart";
import TraitMap from "./TraitMap";
import type { Emblem, PlayerEntry } from "../lib/fantasy";
import type { bestTraitArrangement } from "../lib/traitStudy";
import type { Role } from "../lib/scoring";
import type { Stage } from "../lib/stages";

type Tab = "stats" | "mechanics";

export default function InformationTabs({
  spread, leagues, entriesByStage, bannersByRole, bestTraitsByRole, leagueName
}: {
  spread: SpreadData;
  leagues: Array<{
    id: string;
    name: string;
    stages: Stage[];
    strongTeams: string[];
    strongBasis: "form" | "rating" | "placement";
    meta?: { months: number; events: number; maps: number; from: number; to: number };
  }>;
  entriesByStage: Record<Stage, PlayerEntry[]>;
  bannersByRole: Record<Stage, Record<Role, Emblem[]>>;
  bestTraitsByRole: Record<Stage, Record<Role, ReturnType<typeof bestTraitArrangement>>>;
  leagueName: string;
}) {
  const [tab, setTab] = useState<Tab>("stats");

  return (
    <div className="stack">
      <div className="pill-row" role="tablist" aria-label="Information view">
        <button className="pill" role="tab" aria-pressed={tab === "stats"}
          onClick={() => setTab("stats")}>
          Stats <span className="faint">· who produced what</span>
        </button>
        <button className="pill" role="tab" aria-pressed={tab === "mechanics"}
          onClick={() => setTab("mechanics")}>
          Emblem mechanics <span className="faint">· tiers and traits</span>
        </button>
      </div>

      {tab === "stats" && <StatSpreadChart data={spread} leagues={leagues} />}
      {tab === "mechanics" && (
        <TraitMap
          entriesByStage={entriesByStage}
          bannersByRole={bannersByRole}
          bestTraitsByRole={bestTraitsByRole}
          leagueName={leagueName}
        />
      )}
    </div>
  );
}
