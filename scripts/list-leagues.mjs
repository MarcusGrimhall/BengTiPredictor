#!/usr/bin/env node
// Searches leagues so you can find the right ID to fetch.
//
//   npm run leagues -- international
//   npm run leagues -- blast --tier premium

import { odFetch } from "./opendota.mjs";

const args = process.argv.slice(2);
const tierIndex = args.indexOf("--tier");
const tier = tierIndex !== -1 ? args[tierIndex + 1] : null;
const query = args.filter((a, i) => a !== "--tier" && i !== tierIndex + 1).join(" ").toLowerCase();

const leagues = await odFetch("/leagues");
const hits = leagues
  .filter((l) => (l.name ?? "").toLowerCase().includes(query))
  .filter((l) => !tier || l.tier === tier)
  .sort((a, b) => b.leagueid - a.leagueid)
  .slice(0, 40);

if (!hits.length) {
  console.log(`No leagues matched "${query}".`);
  process.exit(0);
}

console.log(`${hits.length} matches (newest first):\n`);
for (const l of hits) {
  console.log(`  ${String(l.leagueid).padEnd(8)} ${String(l.tier ?? "-").padEnd(12)} ${l.name}`);
}
console.log(`\nFetch with: npm run fetch -- <id>`);
