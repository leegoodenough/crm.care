// GENERATED from lib/visual-territory-catalogue.ts by scripts/sync-crmcare-package.mjs — do not edit here.
// Edit the source in the crm.care app and run `npm run crmcare:build`.

// Phase 67 (V.3) — the visual territory catalogue, dependency-free.
//
// The territories a campaign's images can live in, the motifs every campaign
// avoids, and the one pattern that names the pictures the territories exist
// to replace. Nothing is imported here on purpose: the campaign spec's
// `visual.territory` enum reads this list, and the crmcare package carries a
// copy (scripts/sync-crmcare-package.mjs), so the catalogue a spec validates
// against locally is the one the server chooses from. The chooser, the
// prompts and the fallback live in lib/visual-territory.

export interface TerritoryDef {
  key: string;
  name: string;
  /**
   * True when this territory may name an interface in its motif. Only the
   * territory whose subject IS the software is exempt from SCREEN_MOTIF_PATTERN;
   * everywhere else the ban is what stops every campaign looking the same.
   */
  allowsInterface?: boolean;
  /** What the pictures are, in a sentence. */
  essence: string;
  /** The briefs it suits. */
  suits: string;
}

/** The catalogue. Keys are stable; names and essences are what the model reads. */
export const VISUAL_TERRITORIES: TerritoryDef[] = [
  { key: "still-life", name: "Editorial still life", essence: "One physical object, lit like a magazine cover, standing in for the idea — a folded map, a brass key, a single chair.", suits: "Product launches, one-claim messages, premium positioning." },
  { key: "documentary", name: "Documentary moment", essence: "A real person mid-task in a real place, caught rather than posed; the work is visible, no screen is the subject.", suits: "Customer stories, operations, trust, people-first brands." },
  { key: "architecture", name: "Architecture and structure", essence: "Buildings, bridges, scaffolding, stairwells, load-bearing forms — structure as the metaphor.", suits: "Platforms, infrastructure, partnerships, scale." },
  { key: "material", name: "Macro material", essence: "A surface at close range — woven fibre, brushed metal, layered paper, poured concrete, cut stone.", suits: "Quality, craft, integration, the texture of a process." },
  { key: "wayfinding", name: "Maps and wayfinding", essence: "Routes, contour lines, signage, transit diagrams, a path drawn across terrain.", suits: "Journeys, onboarding, attribution, funnels, handoffs." },
  { key: "typographic", name: "Typographic poster", essence: "The headline or one number set large as the whole image, restrained colour, real typesetting.", suits: "Announcements, statistics, offers, dates." },
  { key: "analogue", name: "Paper and analogue tools", essence: "Index cards, ledgers, rubber stamps, drafting instruments, pinned notes — the pre-digital version of the task.", suits: "Governance, process, before-and-after without a screen." },
  { key: "nature-systems", name: "Nature as a system", essence: "Root systems, river deltas, murmurations, tide lines, mycelium — natural structures that behave like the idea.", suits: "Networks, growth, automation, flow, ecosystems." },
  { key: "engineered", name: "Engineered precision", essence: "Instruments, gauges, machined parts, a watch movement, calipers — precision as the point.", suits: "Reliability, measurement, accuracy, tooling." },
  { key: "miniature", name: "Diorama and miniature", essence: "A tiny built scene — a model office, a tabletop city, a train-set warehouse — photographed with real depth of field.", suits: "Scale contrasts, teams, ecosystems, before-and-after." },
  { key: "optics", name: "Light and optics", essence: "Prisms, projections, long exposures, refraction, a beam through dust — light as the subject.", suits: "Clarity, insight, personalisation, focus." },
  { key: "motion", name: "Motion and timing", essence: "Relay handovers, starting blocks, a rowing crew at pace, a conductor's hands — coordination and timing.", suits: "Launches, speed, handoffs, teamwork." },
  { key: "everyday", name: "Domestic and everyday", essence: "A kitchen table, a commute, a corner shop, a garden shed — the idea landing in ordinary life.", suits: "Re-engagement, warmth, plain-English positioning." },
  { key: "geometric", name: "Abstract geometric field", essence: "Repeated forms, grids, tessellations, one deliberate break in the pattern — no objects, no screens.", suits: "Segmentation, patterns, data at scale." },
  { key: "data-physical", name: "Data made physical", essence: "Real objects sorted, stacked or arranged so they read as a chart — coins, tiles, fruit, timber — never a chart drawn by software.", suits: "Results, comparisons, attribution, pricing." },
  { key: "workshop", name: "Workshop and craft", essence: "Hands at a bench with tools and materials — carpentry, ceramics, letterpress, tailoring — the making, not the machine.", suits: "Building, customisation, agencies, services." },
  { key: "technical-artefact", name: "Technical artefact", essence: "The product's own output treated as a designed object — a directory entry, a config line, a version tag, a release note, a label on a case — set and lit like print, never a stock screenshot of an app.", suits: "Integrations, connectors, APIs, developer products, directory listings, releases.", allowsInterface: true }
];

/** The motifs every campaign starts by avoiding — the ones the generator drew by default. */
export const DEFAULT_MOTIFS_TO_AVOID: string[] = [
  "hands typing on a laptop or keyboard",
  "a laptop, monitor or phone screen as the subject of the image",
  "an overhead flat-lay of a desk with a notebook and a coffee cup",
  "a team gathered around a screen, table or whiteboard",
  "a person at a standing desk or in a modern office at dusk",
  "isometric illustrations of nodes, pipelines, funnels or dashboards",
  "a split-screen before-and-after (cluttered left, clean right)",
  "abstract glowing network lines, particles or data streams"
];

/** The keys, for the spec's enum. */
export const VISUAL_TERRITORY_KEYS = VISUAL_TERRITORIES.map((t) => t.key) as [string, ...string[]];

/** A motif that names the pictures the territories exist to replace; the chooser's parser and the spec refuse it alike. */
export const SCREEN_MOTIF_PATTERN = /\b(laptop|keyboard|monitor|screen|dashboard|isometric)\b/i;

/** True when this territory's motif may name an interface. See TerritoryDef.allowsInterface. */
export function territoryAllowsInterface(key: string): boolean {
  return territoryDef(key)?.allowsInterface === true;
}

export function territoryDef(key: string): TerritoryDef | undefined {
  return VISUAL_TERRITORIES.find((t) => t.key === key);
}
