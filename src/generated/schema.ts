// GENERATED from lib/campaign-spec/schema.ts by scripts/sync-crmcare-package.mjs — do not edit here.
// Edit the source in the crm.care app and run `npm run crmcare:build`.

// Phase 65 (workstream K, slice 1) — the campaign spec, the schema.
//
// Campaign-as-code, the sane way: not a language, a declarative document in
// a host format. Zod is the source of truth here; the JSON Schema served at
// /api/v1/campaign-spec/schema is generated from it, so the two cannot
// drift, and the TypeScript types are inferred from it, so neither can the
// code. YAML is the portable file (lib/campaign-spec/text.ts); JSON is the
// wire form.
//
// The spec describes what a campaign IS — the brief, the channels, the
// sequence, the segments, the assets, the guardrails, the visual world its
// images live in — never what happened to it. Status, performance, learnings, CRM links and image-generation
// counters are outcomes and state; they stay on the row. An `x-crmcare`
// block carries provenance on export and is ignored on import.
//
// Objects are strict: an unknown key is an error, not a silent drop. For an
// agent authoring a spec that is the difference between a typo caught before
// anything is spent and a field that never took effect.

import { z } from "zod";
import { GATED_ASSET_KINDS } from "./asset-kinds.js";
import { SCREEN_MOTIF_PATTERN, VISUAL_TERRITORIES, VISUAL_TERRITORY_KEYS } from "./visual-territory-catalogue.js";

export const CAMPAIGN_SPEC_VERSION = "campaign/0.1" as const;

/** The channels a brief may name — the same list the app's campaign creation accepts. */
export const CAMPAIGN_CHANNELS = [
  "Email",
  "LinkedIn",
  "X",
  "Facebook",
  "Instagram",
  "Webinar",
  "Landing Page",
  "Paid Search",
  "Display Ads",
  "Conference",
  "Direct Mail"
] as const;

export const SOCIAL_PLATFORMS = ["LinkedIn", "X", "Facebook", "Instagram"] as const;
export const CALENDAR_KINDS = ["social", "email", "webinar", "landing", "asset"] as const;

/** A spec-local key: how a calendar entry names the email or post it belongs to. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const key = z
  .string()
  .regex(KEY_PATTERN, "a key is lowercase letters, digits and hyphens, up to 64 characters")
  .describe("A name local to this spec, so a calendar entry can point at this item.");

const isoDate = z
  .string()
  .regex(DATE_PATTERN, "an ISO date (2026-10-01) or date-time (2026-10-01T09:00:00Z)");

const text = (max: number) => z.string().trim().min(1, "cannot be empty").max(max);

export const EmailBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("heading"), text: text(300) }).strict(),
  z.object({ kind: z.literal("paragraph"), text: text(4000) }).strict(),
  z
    .object({
      kind: z.literal("cta"),
      text: text(120),
      urlHint: z.string().max(2000).optional().describe("Placeholder URL; the real link is set in the marketing platform.")
    })
    .strict(),
  z.object({ kind: z.literal("signoff"), text: text(600) }).strict()
]);

/**
 * An image: an https URL, or — so a spec can be self-contained, and because
 * a workspace without hosted storage keeps images inline — a base64 data
 * URL of up to 4 MB.
 */
const IMAGE_URL_MAX = 4_000_000;
const imageUrl = z
  .string()
  .max(IMAGE_URL_MAX)
  .refine(
    (v) => (/^https?:\/\/\S+$/.test(v) && v.length <= 2000) || /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/.test(v),
    "an https URL (up to 2000 characters) or a base64 data URL of an image"
  )
  .describe("An https URL, or a base64 data URL of an image (up to 4 MB).");

export const HeroSchema = z
  .object({
    url: imageUrl,
    alt: z.string().max(300).optional()
  })
  .strict();

export const EmailSpecSchema = z
  .object({
    key: key.optional(),
    role: z.string().max(60).optional().describe('Where it sits in the sequence: "launch", "follow-up", "final reminder".'),
    position: z.string().max(60).optional().describe("A label for its position, shown in the app."),
    subject: text(300),
    preview: z.string().max(300).default("").describe("The preheader."),
    blocks: z.array(EmailBlockSchema).max(60).optional().describe("The body, as blocks. The HTML is rendered in the workspace's own theme."),
    html: z.string().max(200_000).optional().describe("Full HTML, only when there are no blocks."),
    hero: HeroSchema.optional(),
    scheduledFor: isoDate.optional(),
    rationale: z.string().max(2000).optional()
  })
  .strict();

export const SocialSpecSchema = z
  .object({
    key: key.optional(),
    platform: z.enum(SOCIAL_PLATFORMS),
    copy: text(6000),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    imagePrompt: z.string().max(4000).optional(),
    image: HeroSchema.optional().describe("An image already made for this post."),
    references: z
      .array(z.object({ assetId: z.string().min(1).max(80) }).strict())
      .max(4)
      .optional()
      .describe("Media library images to generate from. Ids that are not in the target workspace are dropped with a warning."),
    scheduledFor: isoDate.optional(),
    scheduledTime: z.string().regex(TIME_PATTERN, "HH:MM").optional(),
    tone: z.string().max(60).optional()
  })
  .strict();

export const SegmentRuleSchema = z
  .object({
    field: text(200),
    operator: text(60),
    value: z.string().max(500),
    source: z.enum(["crm", "apollo"]).optional()
  })
  .strict();

export const SegmentSpecSchema = z
  .object({
    key: key.optional(),
    name: text(200),
    description: z.string().max(2000).default(""),
    rules: z.array(SegmentRuleSchema).max(40).default([]),
    // Free text as the model writes it: "~400", or a sentence with a caveat.
    estimatedSize: z.string().max(300).optional()
  })
  .strict();

export const CalendarSpecSchema = z
  .object({
    kind: z.enum(CALENDAR_KINDS),
    label: text(200),
    channel: text(60),
    date: isoDate,
    content: z.string().max(4000).optional(),
    ref: key.optional().describe("The key of the email or post this entry schedules.")
  })
  .strict();

export const AssetSpecSchema = z
  .object({
    key: key.optional(),
    kind: z.enum(GATED_ASSET_KINDS),
    title: text(300),
    abstract: z.string().max(2000).default(""),
    body: z.string().max(200_000).describe("Markdown.")
  })
  .strict();

export const BriefSpecSchema = z
  .object({
    objective: text(2000).describe("What it should achieve — ideally with a number."),
    audience: text(2000),
    keyMessage: text(2000).describe("The one thing the audience should believe afterwards."),
    segment: z.string().max(500).optional(),
    tone: z.string().max(60).optional(),
    context: z.string().max(8000).optional(),
    language: z.enum(["en", "es"]).optional()
  })
  .strict();

export const GuardrailsSchema = z
  .object({
    autoPost: z.boolean().optional().describe("Scheduled LinkedIn posts publish themselves."),
    imageGenerationCap: z.number().int().min(1).max(500).optional()
  })
  .strict();

/**
 * Phase 67 (V.3) — the visual territory: the world the campaign's images
 * live in. Without it a campaign is chosen one on its first generation, from
 * the catalogue, unlike the workspace's recent campaigns (lib/visual-
 * territory). A spec that names one pins it: no chooser runs, every image
 * the campaign makes sits inside it, and the export carries it.
 */
export const VisualSpecSchema = z
  .object({
    territory: z
      .enum(VISUAL_TERRITORY_KEYS)
      .describe(`The world the images live in — one of: ${VISUAL_TERRITORIES.map((t) => `${t.key} (${t.name})`).join(", ")}.`),
    motif: z
      .string()
      .trim()
      .min(8, "a motif is a line, not a word")
      .max(300)
      .refine((m) => !SCREEN_MOTIF_PATTERN.test(m), "a motif is physical and specific — never a screen, laptop, keyboard, monitor, dashboard or isometric diagram")
      .optional()
      .describe("The concrete subject inside the territory, one line: a thing, a place, a material, a moment. Defaults to the territory's essence."),
    rationale: z.string().trim().max(400).optional().describe("Why this world serves the key message, one sentence."),
    seeds: z.array(z.string().trim().min(1).max(300)).max(5).optional().describe("Subjects inside the territory a sequence of posts can draw on, one per post."),
    avoid: z.array(z.string().trim().min(1).max(300)).max(16).optional().describe("Motifs the images must never use, on top of the defaults every campaign avoids (screens, desks, diagrams). Up to 16.")
  })
  .strict();


export const CampaignSpecSchema = z
  .object({
    crmcare: z.literal(CAMPAIGN_SPEC_VERSION).describe("The spec version."),
    name: text(200),
    brief: BriefSpecSchema,
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).min(1).max(CAMPAIGN_CHANNELS.length),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    plan: z.string().max(200_000).optional().describe("The strategy plan, Markdown."),
    guardrails: GuardrailsSchema.optional(),
    visual: VisualSpecSchema.optional().describe("The world the campaign's images live in. Chosen from the brief when absent; pinned when named."),
    segments: z.array(SegmentSpecSchema).max(50).optional(),
    emails: z.array(EmailSpecSchema).max(100).optional(),
    social: z.array(SocialSpecSchema).max(200).optional(),
    calendar: z.array(CalendarSpecSchema).max(400).optional(),
    assets: z.array(AssetSpecSchema).max(50).optional(),
    "x-crmcare": z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Provenance written on export; ignored on import.")
  })
  .strict()
  .superRefine((spec, ctx) => {
    const seen = new Map<string, string>();
    const lists: Array<[string, Array<{ key?: string }> | undefined]> = [
      ["emails", spec.emails],
      ["social", spec.social],
      ["assets", spec.assets],
      ["segments", spec.segments]
    ];
    for (const [list, items] of lists) {
      (items ?? []).forEach((item, i) => {
        if (!item.key) return;
        const prior = seen.get(item.key);
        if (prior) {
          ctx.addIssue({ code: "custom", path: [list, i, "key"], message: `key "${item.key}" is also used by ${prior}` });
        } else {
          seen.set(item.key, `${list}[${i}]`);
        }
      });
    }
    (spec.calendar ?? []).forEach((entry, i) => {
      if (entry.ref && !seen.has(entry.ref)) {
        ctx.addIssue({ code: "custom", path: ["calendar", i, "ref"], message: `no email, post or asset has the key "${entry.ref}"` });
      }
    });
    (spec.emails ?? []).forEach((email, i) => {
      if (!email.blocks?.length && !email.html?.trim()) {
        ctx.addIssue({ code: "custom", path: ["emails", i], message: "an email needs blocks or html" });
      }
    });
  });

export type CampaignSpec = z.infer<typeof CampaignSpecSchema>;
export type EmailSpec = z.infer<typeof EmailSpecSchema>;
export type SocialSpec = z.infer<typeof SocialSpecSchema>;
export type SegmentSpec = z.infer<typeof SegmentSpecSchema>;
export type CalendarSpec = z.infer<typeof CalendarSpecSchema>;
export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type VisualSpec = z.infer<typeof VisualSpecSchema>;

export interface SpecIssue {
  /** JSON-pointer-ish path: "emails.0.subject". */
  path: string;
  message: string;
}

export type SpecValidation = { ok: true; spec: CampaignSpec } | { ok: false; issues: SpecIssue[] };

/** Validate anything that claims to be a spec. Issues carry paths an agent can act on. */
export function validateCampaignSpec(input: unknown): SpecValidation {
  const result = CampaignSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };
  const issues = result.error.issues.map((i) => ({
    path: i.path.map(String).join(".") || "(root)",
    message: i.message
  }));
  return { ok: false, issues };
}

export const CAMPAIGN_SPEC_SCHEMA_URL = "https://crm.care/api/v1/campaign-spec/schema";

/** The JSON Schema (draft 2020-12), generated from the zod schema above. */
export function campaignSpecJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(CampaignSpecSchema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: CAMPAIGN_SPEC_SCHEMA_URL,
    title: "crm.care campaign spec",
    description: `A campaign as a document: ${CAMPAIGN_SPEC_VERSION}. What the campaign is — brief, channels, visual territory, sequence, segments, assets, guardrails — never what happened to it.`,
    ...generated
  };
}
