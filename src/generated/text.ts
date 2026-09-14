// GENERATED from lib/campaign-spec/text.ts by scripts/sync-crmcare-package.mjs — do not edit here.
// Edit the source in the crm.care app and run `npm run crmcare:build`.

// Phase 65 (workstream K, slice 1) — the spec as text.
//
// YAML is the portable file; JSON is the wire form. Both are accepted
// everywhere a spec is taken, and told apart by content type when there is
// one and by the first character when there is not.

import YAML from "yaml";

export type SpecTextParse = { ok: true; value: unknown; format: "json" | "yaml" } | { ok: false; error: string };

export function parseSpecText(text: string, contentType?: string | null): SpecTextParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "The body is empty." };
  const ct = (contentType ?? "").toLowerCase();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const asJson = ct.includes("json") || (!ct.includes("yaml") && looksJson);
  try {
    if (asJson) return { ok: true, value: JSON.parse(trimmed), format: "json" };
    return { ok: true, value: YAML.parse(trimmed, { strict: true }), format: "yaml" };
  } catch (err) {
    return { ok: false, error: `Could not parse the spec as ${asJson ? "JSON" : "YAML"}: ${(err as Error).message}` };
  }
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * A date written bare reads as a date object in YAML 1.1 parsers (PyYAML,
 * Ruby's Psych) and as text in 1.2 ones. The spec's dates are text, so they
 * go out quoted and every parser agrees.
 */
function quoteDates(v: unknown): unknown {
  if (typeof v === "string") {
    if (!DATE_LIKE.test(v)) return v;
    const node = new YAML.Scalar(v);
    node.type = YAML.Scalar.QUOTE_DOUBLE;
    return node;
  }
  if (Array.isArray(v)) return v.map(quoteDates);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, quoteDates(x)]));
  }
  return v;
}

/** The spec as YAML, keys in the order the schema declares them, long text as block scalars, dates quoted. */
export function specToYaml(spec: unknown): string {
  return YAML.stringify(quoteDates(spec), { lineWidth: 0, blockQuote: "literal", defaultStringType: "PLAIN", defaultKeyType: "PLAIN" });
}

/** A filename for a downloaded spec. */
export function specFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "campaign"}.campaign.yaml`;
}
