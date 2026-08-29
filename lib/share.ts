// Putting a whole calculator setup in the URL.
//
// Everything the calculator holds - three banners, the risk level, the stage,
// the two titles - currently lives in localStorage, which means it is invisible
// and cannot leave the browser it was set in. That is fine for coming back
// tomorrow and useless for anything else.
//
// A URL fixes both. You can send someone the exact roster you are looking at,
// bookmark two setups and flip between them, or paste one into a message and
// have the other person see the same numbers rather than a description of them.
//
// The encoding is short and readable on purpose - it survives being pasted into
// a chat window, and a wrong character fails cleanly rather than silently
// producing a different banner.

import { Emblem, TIERS, TRAITS, Tier, Trait } from "./fantasy";
import { Role, STAT_KEYS, StatKey } from "./scoring";
import { STAGES, type Stage } from "./stages";

const ROLES: Role[] = ["core", "mid", "support"];

export type Setup = {
  banners: Record<Role, Emblem[]>;
  risk: number;
  stage: Stage;
  prefix: string | null;
  suffix: string | null;
};

/** Emblems are `stat.tier.trait`, slots joined by commas, roles by pipes. */
function encodeBanner(emblems: Emblem[]): string {
  return emblems.map((e) => `${e.stat}.${e.tier}.${e.trait}`).join(",");
}

function decodeBanner(text: string): Emblem[] | null {
  const slots = text.split(",").filter(Boolean);
  if (!slots.length) return null;
  const out: Emblem[] = [];
  for (const slot of slots) {
    const [stat, tier, trait] = slot.split(".");
    if (!STAT_KEYS.includes(stat as StatKey)) return null;
    if (!TIERS.includes(tier as Tier)) return null;
    if (!TRAITS.includes(trait as Trait)) return null;
    out.push({ stat: stat as StatKey, tier: tier as Tier, trait: trait as Trait });
  }
  return out;
}

export function encodeSetup(setup: Setup): string {
  const params = new URLSearchParams();
  params.set("b", ROLES.map((r) => encodeBanner(setup.banners[r])).join("|"));
  params.set("r", String(Math.round(setup.risk)));
  params.set("s", setup.stage);
  if (setup.prefix) params.set("p", setup.prefix);
  if (setup.suffix) params.set("x", setup.suffix);
  return params.toString();
}

/**
 * Reads a setup back. Returns null on anything malformed rather than a partly
 * applied setup - a link that half works is worse than one that plainly does
 * not, because the numbers would look real.
 */
export function decodeSetup(query: string): Setup | null {
  const params = new URLSearchParams(query);
  const banners = params.get("b");
  if (!banners) return null;

  const parts = banners.split("|");
  if (parts.length !== ROLES.length) return null;

  const decoded = {} as Record<Role, Emblem[]>;
  for (const [i, role] of ROLES.entries()) {
    const emblems = decodeBanner(parts[i]);
    if (!emblems) return null;
    decoded[role] = emblems;
  }

  const risk = Number(params.get("r"));
  const stage = params.get("s");
  return {
    banners: decoded,
    risk: Number.isFinite(risk) ? Math.max(0, Math.min(100, risk)) : 50,
    stage: STAGES.includes(stage as Stage) ? (stage as Stage) : "groupStage",
    prefix: params.get("p"),
    suffix: params.get("x")
  };
}
