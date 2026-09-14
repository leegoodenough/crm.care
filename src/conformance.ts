// The conformance suite: the contract's guarantees, checked against a host.
//
// `crmcare conformance --host https://crm.care` runs every check below with
// the credential it is given and reports pass, fail or skip per guarantee
// (skip: the check needs something the run does not have — a granted
// tool, a read-only credential — and says what). A check that writes
// (idempotency) uses tag_campaign on one campaign and removes what it
// added; nothing else changes the workspace. crm.care runs this against
// its own hosts after every promote; an implementer of the contract runs
// it against theirs.

import { CrmCare, CrmCareError, type ToolsResponse } from "./client.js";
import { parseSpecText } from "./generated/text.js";
import { campaignSpecJsonSchema } from "./generated/schema.js";

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  id: string;
  /** The guarantee on /docs/contract this check holds the host to. */
  guarantee: string;
  status: CheckStatus;
  detail: string;
}

export interface ConformanceReport {
  host: string;
  credential: "workspace" | "user" | "none";
  registryVersion?: string;
  campaignId?: string;
  ranAt: string;
  results: CheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  ok: boolean;
}

export interface ConformanceOptions {
  host: string;
  token?: string;
  /** The campaign the read checks use; the first listed when absent. */
  campaignId?: string;
  fetch?: typeof globalThis.fetch;
  onResult?: (r: CheckResult) => void;
}

interface Ctx {
  host: string;
  crm: CrmCare;
  pub: CrmCare;
  fetch: typeof globalThis.fetch;
  token?: string;
  tools?: ToolsResponse;
  campaignId?: string;
}

type Outcome = { status: CheckStatus; detail: string };
const pass = (detail: string): Outcome => ({ status: "pass", detail });
const fail = (detail: string): Outcome => ({ status: "fail", detail });
const skip = (detail: string): Outcome => ({ status: "skip", detail });

interface Check {
  id: string;
  guarantee: string;
  run: (ctx: Ctx) => Promise<Outcome>;
}

async function raw(ctx: Ctx, path: string, init: RequestInit = {}): Promise<{ status: number; text: string; json: Record<string, unknown> | null }> {
  const res = await ctx.fetch(`${ctx.host}${path}`, { redirect: "manual", ...init });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

async function tools(ctx: Ctx): Promise<ToolsResponse> {
  if (!ctx.tools) ctx.tools = await ctx.crm.tools();
  return ctx.tools;
}

/** The campaign the read checks use: the one given, or the first list_campaigns names. */
async function campaign(ctx: Ctx): Promise<string | undefined> {
  if (ctx.campaignId) return ctx.campaignId;
  const listed = await ctx.crm.call("list_campaigns", {});
  const m = /`([A-Za-z0-9_-]+)`/.exec(listed.summary ?? "");
  ctx.campaignId = m?.[1];
  return ctx.campaignId;
}

const VALID_SPEC = { crmcare: "campaign/0.1", name: "Conformance", brief: { objective: "o", audience: "a", keyMessage: "k" }, channels: ["Email"] };

/** The spec without its provenance: `x-crmcare` carries the export time, so two exports of one campaign differ there and nowhere else. */
function content(spec: unknown): string {
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const { "x-crmcare": _provenance, ...rest } = spec as Record<string, unknown>;
    return JSON.stringify(rest);
  }
  return JSON.stringify(spec);
}

export const CHECKS: Check[] = [
  {
    id: "docs-public",
    guarantee: "The route an agent reads is public: /docs/spec, /docs/contract, /docs/api, /llms.txt answer without a credential.",
    run: async (ctx) => {
      const bad: string[] = [];
      for (const p of ["/docs/spec", "/docs/contract", "/docs/api", "/llms.txt"]) {
        const r = await raw(ctx, p);
        if (r.status !== 200) bad.push(`${p} → ${r.status}`);
      }
      return bad.length ? fail(bad.join("; ")) : pass("four public pages answer 200");
    }
  },
  {
    id: "schema-served",
    guarantee: "The spec's JSON Schema is served at a stable URL and is the one this package carries.",
    run: async (ctx) => {
      const served = await ctx.pub.schema();
      if (served.$schema !== "https://json-schema.org/draft/2020-12/schema") return fail(`$schema is ${String(served.$schema)}`);
      const same = JSON.stringify(served) === JSON.stringify(campaignSpecJsonSchema());
      return same ? pass(`draft 2020-12, $id ${String(served.$id)}, equal to this package's schema.json`) : fail("the host serves a schema this package version does not carry — versions differ");
    }
  },
  {
    id: "validate-public",
    guarantee: "A spec validates with no account: every problem at once with a path, or the summary.",
    run: async (ctx) => {
      const ok = await ctx.pub.validate(VALID_SPEC);
      if (!ok.ok) return fail(`a valid spec was refused: ${JSON.stringify(ok.issues)}`);
      const r = await raw(ctx, "/api/v1/campaign-spec/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ crmcare: "campaign/0.1", name: "", channels: [] }) });
      const issues = (r.json?.issues as Array<{ path?: string }> | undefined) ?? [];
      if (r.status !== 422 || issues.length === 0 || !issues.every((i) => typeof i.path === "string")) return fail(`an invalid spec answered ${r.status} with ${issues.length} issue(s)`);
      return pass(`valid → ok with summary "${ok.summary.name}"; invalid → 422 with ${issues.length} issues, each with a path`);
    }
  },
  {
    id: "registry",
    guarantee: "One registry: every tool listed with kind, cost, effects, undoable and callable; reads callable on any credential; names unique; a version on the listing.",
    run: async (ctx) => {
      const t = await tools(ctx);
      if (!/^\d+\.\d+\.\d+$/.test(t.version)) return fail(`version "${t.version}" is not semver`);
      const names = t.tools.map((x) => x.name);
      if (new Set(names).size !== names.length) return fail("a name is listed twice");
      const missing = t.tools.filter((x) => typeof x.readOnly !== "boolean" || typeof x.callable !== "boolean" || typeof x.undoable !== "boolean" || !x.cost || typeof x.effects !== "string" || !x.inputSchema);
      if (missing.length) return fail(`${missing.length} tool(s) lack a field: ${missing.map((x) => x.name).join(", ")}`);
      const readsClosed = t.tools.filter((x) => x.readOnly && !x.callable);
      if (readsClosed.length) return fail(`reads not callable: ${readsClosed.map((x) => x.name).join(", ")}`);
      for (const w of ["launch_campaign", "list_campaigns", "get_campaign_status", "get_goal_pnl", "export_campaign_spec", "plan_campaign"]) {
        if (!names.includes(w)) return fail(`"${w}" is not listed`);
      }
      const uncallable = t.tools.filter((x) => !x.callable && !x.reason);
      if (uncallable.length) return fail(`not callable without a reason: ${uncallable.map((x) => x.name).join(", ")}`);
      return pass(`${t.tools.length} tools, registry ${t.version}, credential ${t.credential}${t.readOnly ? " (read-only)" : ""}`);
    }
  },
  {
    id: "grant-rule",
    guarantee: "A mutation is refused until a workspace admin grants it, with a sentence that says how.",
    run: async (ctx) => {
      const t = await tools(ctx);
      if (t.readOnly) return skip("a read-only credential cannot show the grant rule; run with a workspace token");
      const closed = t.tools.find((x) => x.kind === "operator" && !x.readOnly && !x.callable);
      if (!closed) return skip("every mutation is granted on this workspace; nothing to refuse");
      const r = await ctx.crm.call(closed.name, { id: "conformance" });
      if (r.httpStatus !== 403 || r.status !== "refused" || r.code !== "not_granted") return fail(`"${closed.name}" answered ${r.httpStatus} ${r.status}/${r.code ?? ""}`);
      if (!/admin/i.test(r.reason ?? "")) return fail("the refusal does not say who grants it");
      return pass(`"${closed.name}" → 403 not_granted, names the admin`);
    }
  },
  {
    id: "unknown-tool",
    guarantee: "An unknown tool is refused as unknown_tool (404), never executed.",
    run: async (ctx) => {
      const r = await ctx.crm.call("no_such_tool_conformance", {});
      return r.httpStatus === 404 && r.status === "refused" && r.code === "unknown_tool" ? pass("404 unknown_tool") : fail(`answered ${r.httpStatus} ${r.status}/${r.code ?? ""}`);
    }
  },
  {
    id: "reads-open",
    guarantee: "Reads run on any valid credential and change nothing.",
    run: async (ctx) => {
      const id = await campaign(ctx);
      const listed = await ctx.crm.call("list_campaigns", {});
      if (listed.status !== "applied") return fail(`list_campaigns → ${listed.status}`);
      if (!id) return skip("no campaign in the workspace; the campaign reads were not checked");
      const status = await ctx.crm.call("get_campaign_status", { id });
      return status.status === "applied" && status.undoable === false ? pass(`list_campaigns and get_campaign_status applied, undoable false, campaign ${id}`) : fail(`get_campaign_status → ${status.status}, undoable ${String(status.undoable)}`);
    }
  },
  {
    id: "dry-run",
    guarantee: "Dry-Run answers planned — effects or the foreseen refusal, the gates, the cost — and changes nothing.",
    run: async (ctx) => {
      const id = await campaign(ctx);
      if (!id) return skip("no campaign to plan against");
      const before = await ctx.crm.export(id, "json");
      const r = await ctx.crm.call("tag_campaign", { id, addTags: ["conformance-dry-run"] }, { dryRun: true, idempotencyKey: "conformance-dry-run" });
      if (r.httpStatus !== 200 || r.status !== "planned" || !r.gates || !r.cost || !Array.isArray(r.effects)) return fail(`answered ${r.httpStatus} ${r.status}`);
      if (r.gates.idempotency !== "free") return fail(`the key was not free after a dry run: ${String(r.gates.idempotency)}`);
      const after = await ctx.crm.export(id, "json");
      if (content(before) !== content(after)) return fail("the campaign changed under a dry run");
      return pass(`planned${r.wouldRefuse ? ` (would be refused: ${r.wouldRefuse.code})` : ""}, key left free, campaign unchanged`);
    }
  },
  {
    id: "idempotency",
    guarantee: "The same key and input replays the first result and applies nothing twice; the same key with different input is refused as key_conflict.",
    run: async (ctx) => {
      const t = await tools(ctx);
      const tag = t.tools.find((x) => x.name === "tag_campaign");
      if (!tag?.callable) return skip("grant tag_campaign on this workspace to check replay and conflict (the check adds a tag and removes it)");
      const id = await campaign(ctx);
      if (!id) return skip("no campaign to tag");
      const key = `conformance-${Date.now().toString(36)}`;
      const first = await ctx.crm.call("tag_campaign", { id, addTags: ["conformance"] }, { idempotencyKey: key });
      if (first.status !== "applied") return fail(`first call → ${first.status}: ${first.reason ?? first.summary ?? ""}`);
      const again = await ctx.crm.call("tag_campaign", { id, addTags: ["conformance"] }, { idempotencyKey: key });
      const other = await ctx.crm.call("tag_campaign", { id, addTags: ["conformance-other"] }, { idempotencyKey: key });
      const cleanup = await ctx.crm.call("tag_campaign", { id, removeTags: ["conformance"] }, { idempotencyKey: `${key}-cleanup` });
      if (again.status !== "replayed" || again.httpStatus !== 200) return fail(`the repeat answered ${again.httpStatus} ${again.status}`);
      if (other.status !== "refused" || other.code !== "key_conflict" || other.httpStatus !== 409) return fail(`different input answered ${other.httpStatus} ${other.status}/${other.code ?? ""}`);
      if (cleanup.status !== "applied") return fail(`the cleanup answered ${cleanup.status}; remove the tag "conformance" from ${id} by hand`);
      return pass(`applied → replayed → 409 key_conflict; tag removed again (campaign ${id})`);
    }
  },
  {
    id: "plan-free",
    guarantee: "The plan against the platforms is free and repeatable: no model runs, no platform call, the same answer twice.",
    run: async (ctx) => {
      const id = await campaign(ctx);
      if (!id) return skip("no campaign to plan");
      const a = await ctx.crm.planCampaign(id);
      const b = await ctx.crm.planCampaign(id);
      if (a.cost.modelPence !== 0) return fail(`modelPence ${a.cost.modelPence}`);
      if (JSON.stringify(a.steps) !== JSON.stringify(b.steps)) return fail("two plans differed");
      return pass(`${a.steps.length} step(s): ${Object.entries(a.counts).map(([k, v]) => `${k} ${v}`).join(", ")}; ${a.cost.platformCalls} platform call(s) foreseen, none made`);
    }
  },
  {
    id: "spec-round-trip",
    guarantee: "A campaign exports as a spec that validates, in YAML and JSON alike.",
    run: async (ctx) => {
      const id = await campaign(ctx);
      if (!id) return skip("no campaign to export");
      const yaml = await ctx.crm.export(id, "yaml");
      const json = await ctx.crm.export(id, "json");
      const parsed = parseSpecText(yaml, "application/yaml");
      if (!parsed.ok) return fail(parsed.error);
      if (content(parsed.value) !== content(json)) return fail("the YAML and JSON exports differ");
      const v = await ctx.pub.validate(yaml);
      return v.ok ? pass(`campaign ${id} exports as ${yaml.split("\n").length} lines of YAML that validate; JSON equal`) : fail(`the export does not validate: ${JSON.stringify(v.issues.slice(0, 3))}`);
    }
  },
  {
    id: "mcp-parity",
    guarantee: "REST and MCP serve one registry: every tool the REST listing names, tools/list names too.",
    run: async (ctx) => {
      if (!ctx.token) return skip("needs a credential");
      const t = await tools(ctx);
      // A user credential's MCP server is /api/mcp/v1, six reads not yet folded into the registry (the contract's open item); only a workspace token can show parity.
      if (t.credential === "user") return skip("a user credential reaches /api/mcp/v1, which is not yet folded into the registry; run with a workspace token");
      const r = await raw(ctx, "/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ctx.token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      const mcp = ((r.json?.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? []).map((x) => x.name);
      if (mcp.length === 0) return fail(`tools/list answered ${r.status} with no tools`);
      const missing = t.tools.map((x) => x.name).filter((n) => !mcp.includes(n));
      return missing.length ? fail(`REST lists tools MCP does not: ${missing.join(", ")}`) : pass(`${mcp.length} MCP tools cover the ${t.tools.length} REST tools`);
    }
  },
  {
    id: "read-only-credential",
    guarantee: "A user credential (OAuth or personal token) reads everything and changes nothing, and the listing says so.",
    run: async (ctx) => {
      const t = await tools(ctx);
      if (t.credential !== "user") return skip("run with the connector's OAuth token or a crm_pat_ token to check the read-only rule");
      const open = t.tools.filter((x) => !x.readOnly && x.callable);
      if (open.length) return fail(`mutations callable on a read-only credential: ${open.map((x) => x.name).join(", ")}`);
      const r = await ctx.crm.call("tag_campaign", { id: "conformance", addTags: ["x"] });
      return r.status === "refused" && r.httpStatus === 403 ? pass("every mutation listed not callable; a call is refused 403") : fail(`a mutation answered ${r.httpStatus} ${r.status}`);
    }
  }
];

export async function runConformance(opts: ConformanceOptions): Promise<ConformanceReport> {
  const host = opts.host.replace(/\/$/, "");
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const ctx: Ctx = {
    host,
    fetch: fetchImpl,
    token: opts.token?.trim() || undefined,
    crm: new CrmCare({ host, token: opts.token, fetch: fetchImpl }),
    pub: new CrmCare({ host, fetch: fetchImpl }),
    campaignId: opts.campaignId
  };
  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    let outcome: Outcome;
    try {
      outcome = ctx.token || ["docs-public", "schema-served", "validate-public"].includes(check.id) ? await check.run(ctx) : skip("needs a credential");
    } catch (err) {
      outcome = err instanceof CrmCareError ? fail(`HTTP ${err.status}: ${err.message}`) : fail((err as Error)?.message ?? String(err));
    }
    const r: CheckResult = { id: check.id, guarantee: check.guarantee, ...outcome };
    results.push(r);
    opts.onResult?.(r);
  }
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return {
    host,
    credential: ctx.tools?.credential ?? (ctx.token ? "workspace" : "none"),
    ...(ctx.tools ? { registryVersion: ctx.tools.version } : {}),
    ...(ctx.campaignId ? { campaignId: ctx.campaignId } : {}),
    ranAt: new Date().toISOString(),
    results,
    passed: count("pass"),
    failed: count("fail"),
    skipped: count("skip"),
    ok: count("fail") === 0
  };
}

/** The report as the lines the CLI prints. */
export function renderConformance(report: ConformanceReport): string {
  const mark = { pass: "✓", fail: "✗", skip: "·" } as const;
  const lines = [
    `crm.care conformance — ${report.host} — ${report.credential} credential${report.registryVersion ? ` — registry ${report.registryVersion}` : ""}${report.campaignId ? ` — campaign ${report.campaignId}` : ""}`,
    ...report.results.map((r) => `${mark[r.status]} ${r.id.padEnd(22)} ${r.status === "skip" ? `skipped — ${r.detail}` : r.detail}`),
    `${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`
  ];
  return lines.join("\n");
}
