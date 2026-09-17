// The client for the REST twin: every documented call, typed, over fetch.
//
// One class, one host, one credential. validate and schema need no
// credential; everything else takes a workspace token (ccr_…) — or the
// connector's OAuth access token or a personal token (crm_pat_…) for reads.
// The execution outcomes are returned as the server answers them (planned,
// applied, replayed, refused, failed); only a transport or credential
// failure throws, as CrmCareError with the status and the body.

import type { CampaignSpec, SpecIssue } from "./generated/schema.js";

export const DEFAULT_HOST = "https://crm.care";

export interface CrmCareOptions {
  /** ccr_… workspace token; or the connector's OAuth token / crm_pat_… personal token for reads. */
  token?: string;
  /** Default https://crm.care. */
  host?: string;
  /** For tests, or a runtime without a global fetch. */
  fetch?: typeof globalThis.fetch;
}

export class CrmCareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "CrmCareError";
  }
}

export interface SpecSummary {
  name: string;
  channels: string[];
  counts: { emails: number; social: number; calendar: number; segments: number; assets: number };
  /** The territory key the spec pins, when it names one (campaign/0.1, V.3). */
  visualTerritory?: string;
  wouldPublish: false;
}

export type ValidateResult =
  | { ok: true; version: string; schema: string; format: "json" | "yaml"; summary: SpecSummary; next: string }
  | { ok: false; version: string; schema: string; format?: "json" | "yaml"; issues: SpecIssue[] };

export interface PlannedEffect {
  kind: "create" | "update" | "delete" | "generate" | "external" | "none";
  entity: string;
  id?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export type ExecutionStatus = "planned" | "applied" | "replayed" | "refused" | "failed";

/** What the door answers: the same shape over REST and MCP. */
export interface ExecutionOutcome {
  status: ExecutionStatus;
  tool: string;
  summary?: string;
  data?: unknown;
  undoable?: boolean;
  requestId?: string;
  /** planned */
  effects?: PlannedEffect[];
  problems?: string[];
  cost?: { model: boolean; estimatePence: number | null; quota?: string };
  gates?: {
    granted: boolean;
    readOnlyCredential: boolean;
    idempotency?: "free" | "replay" | "conflict" | "in_progress";
    allowance?: { ok: boolean; reason?: string };
  };
  wouldRefuse?: { code: string; reason: string };
  /** refused */
  code?: string;
  /** refused | failed */
  reason?: string;
}

export interface CallResult extends ExecutionOutcome {
  httpStatus: number;
}

export type PlatformAction = "create" | "update" | "unchanged" | "blocked" | "unsupported";

export interface PlatformStep {
  kind: "segment" | "email" | "nurture" | "crm_campaign";
  id?: string;
  label: string;
  action: PlatformAction;
  target: string;
  reason?: string;
  consent: string;
}

export interface PlatformPlan {
  summary: string;
  campaignId: string | null;
  fromSpec: boolean;
  connections: {
    map: { provider: string; label: string; connected: boolean; status: string };
    crm: { provider: string; label: string; connected: boolean };
  };
  steps: PlatformStep[];
  counts: Record<PlatformAction, number>;
  cost: { modelPence: number; platformCalls: number };
  nothingToPublish: boolean;
}

/** A spec not yet imported: the workspace side (the import's dry run) and the platform side. */
export interface SpecPlan {
  status: "planned";
  workspace: ExecutionOutcome;
  platform: PlatformPlan;
}

export interface ToolCost {
  model: boolean;
  estimatePence: number | null;
  quota?: string;
}

export interface ToolListing {
  name: string;
  kind: "operator" | "workspace";
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  cost: ToolCost;
  effects: string;
  undoable: boolean;
  callable: boolean;
  reason?: string;
}

export interface ToolsResponse {
  version: string;
  workspace: string;
  token: string;
  credential: "workspace" | "user";
  readOnly: boolean;
  tools: ToolListing[];
}

export interface CallOptions {
  /** Makes a retry a no-op: the same key and input replays the first result. */
  idempotencyKey?: string;
  /** Answer with what the call would change, changing nothing. */
  dryRun?: boolean;
}

export interface ApplyOptions {
  /** One key per run; each step derives its own (`key:kind:id`). */
  key: string;
  dryRun?: boolean;
  /** Called after each step, as it lands. */
  onStep?: (step: ApplyStepResult) => void;
}

export interface ApplyStepResult {
  step: PlatformStep;
  tool: string;
  idempotencyKey: string;
  result: CallResult;
  /** applied, replayed, or planned without a foreseen refusal. */
  ok: boolean;
}

export interface ApplyResult {
  campaignId: string;
  dryRun: boolean;
  connections: PlatformPlan["connections"];
  steps: ApplyStepResult[];
  /** Steps the plan said not to run: unchanged, blocked, unsupported. */
  skipped: PlatformStep[];
  ok: boolean;
}

/** The tool each plan step runs through. */
export const APPLY_TOOL_FOR: Record<PlatformStep["kind"], string> = {
  segment: "publish_segment",
  email: "publish_email",
  nurture: "write_nurture",
  crm_campaign: "sync_to_crm"
};

/** A spec as text (YAML or JSON) or as an object. */
export type SpecInput = string | CampaignSpec | Record<string, unknown>;

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
}

function specBody(spec: SpecInput): { body: string; contentType: string } {
  if (typeof spec === "string") {
    const looksJson = /^\s*[[{]/.test(spec);
    return { body: spec, contentType: looksJson ? "application/json" : "application/yaml" };
  }
  return { body: JSON.stringify(spec), contentType: "application/json" };
}

/** A campaign id, as opposed to a spec: one token, no whitespace, not a document. */
export function looksLikeCampaignId(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(s);
}

export class CrmCare {
  readonly host: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof globalThis.fetch | undefined;

  constructor(opts: CrmCareOptions = {}) {
    this.host = (opts.host ?? DEFAULT_HOST).replace(/\/$/, "");
    this.token = opts.token?.trim() || undefined;
    this.fetchImpl = opts.fetch;
  }

  /** A header value must be plain ASCII; a placeholder pasted literally (ccr_…) is the usual cause. */
  private assertTokenUsable(): void {
    if (this.token && !/^[\x21-\x7e]+$/.test(this.token)) {
      throw new CrmCareError(
        "The token contains a character that is not plain ASCII — was a placeholder such as ccr_… pasted literally? Use the token exactly as minted.",
        401,
        null
      );
    }
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    opts: { body?: string; contentType?: string; headers?: Record<string, string>; auth?: boolean } = {}
  ): Promise<Reply> {
    if (opts.auth && !this.token) {
      throw new CrmCareError(
        "No credential. Pass { token } — a workspace admin mints a ccr_… token in the Operator console (app.crm.care/campaigns/operator → Agent access).",
        401,
        null
      );
    }
    if (opts.auth) this.assertTokenUsable();
    const headers: Record<string, string> = { accept: "application/json", ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers["content-type"] = opts.contentType ?? "application/json";
    if (opts.auth) headers.authorization = `Bearer ${this.token}`;
    const doFetch = this.fetchImpl ?? globalThis.fetch;
    const res = await doFetch(`${this.host}${path}`, { method, headers, body: opts.body, redirect: "manual" });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { status: res.status, json, text };
  }

  private fail(reply: Reply, fallback: string): never {
    const message =
      (reply.json && typeof reply.json.error === "string" && reply.json.error) ||
      (reply.json && typeof reply.json.reason === "string" && reply.json.reason) ||
      `${fallback} (HTTP ${reply.status}): ${reply.text.slice(0, 300)}`;
    throw new CrmCareError(message, reply.status, reply.json ?? reply.text);
  }

  /** An execution outcome, whatever its status; a non-outcome answer throws. */
  private outcome(reply: Reply, fallback: string): CallResult {
    if (reply.json && typeof reply.json.status === "string") {
      return { ...(reply.json as unknown as ExecutionOutcome), httpStatus: reply.status };
    }
    return this.fail(reply, fallback);
  }

  // ── Public, no credential ───────────────────────────────────────────────

  /** Every problem at once, or the summary. No account needed. */
  async validate(spec: SpecInput): Promise<ValidateResult> {
    const { body, contentType } = specBody(spec);
    const reply = await this.request("POST", "/api/v1/campaign-spec/validate", { body, contentType });
    if (reply.json && typeof reply.json.ok === "boolean") return reply.json as unknown as ValidateResult;
    return this.fail(reply, "Validation did not answer");
  }

  /** The JSON Schema (draft 2020-12) the spec is validated against. */
  async schema(): Promise<Record<string, unknown>> {
    const reply = await this.request("GET", "/api/v1/campaign-spec/schema");
    if (reply.status === 200 && reply.json) return reply.json;
    return this.fail(reply, "The schema did not answer");
  }

  // ── With a credential ───────────────────────────────────────────────────

  /** The plan against the connected platforms for a campaign in the workspace. */
  async planCampaign(id: string): Promise<PlatformPlan> {
    const reply = await this.request("GET", `/api/v1/campaigns/${encodeURIComponent(id)}/plan`, { auth: true });
    if (reply.status === 200 && reply.json && Array.isArray(reply.json.steps)) return reply.json as unknown as PlatformPlan;
    return this.fail(reply, "The plan did not answer");
  }

  /** The plan for a spec not yet imported: the import's dry run and the platform side. */
  async planSpec(spec: SpecInput): Promise<SpecPlan> {
    const { body, contentType } = specBody(spec);
    const reply = await this.request("POST", "/api/v1/campaigns/spec/plan", { body, contentType, auth: true });
    if (reply.status === 200 && reply.json && reply.json.platform) return reply.json as unknown as SpecPlan;
    return this.fail(reply, "The plan did not answer");
  }

  /** planCampaign for an id, planSpec for a spec. */
  async plan(idOrSpec: SpecInput): Promise<PlatformPlan | SpecPlan> {
    return typeof idOrSpec === "string" && looksLikeCampaignId(idOrSpec) ? this.planCampaign(idOrSpec) : this.planSpec(idOrSpec);
  }

  /** Import a spec as a draft campaign with its content. Nothing is published. */
  async import(spec: SpecInput, opts: CallOptions = {}): Promise<CallResult> {
    const { body, contentType } = specBody(spec);
    const reply = await this.request("POST", "/api/v1/campaigns/spec", { body, contentType, auth: true, headers: callHeaders(opts) });
    return this.outcome(reply, "The import did not answer");
  }

  /** A campaign as a spec: YAML text, or the object with format "json". */
  async export(id: string, format: "yaml"): Promise<string>;
  async export(id: string, format: "json"): Promise<CampaignSpec>;
  async export(id: string, format: "yaml" | "json" = "yaml"): Promise<string | CampaignSpec> {
    const reply = await this.request("GET", `/api/v1/campaigns/${encodeURIComponent(id)}/spec`, {
      auth: true,
      headers: { accept: format === "json" ? "application/json" : "application/yaml" }
    });
    if (reply.status !== 200) return this.fail(reply, "The export did not answer");
    if (format === "json") {
      if (!reply.json) return this.fail(reply, "The export was not JSON");
      return reply.json as unknown as CampaignSpec;
    }
    return reply.text;
  }

  /** The registry, with what this credential may run. */
  async tools(): Promise<ToolsResponse> {
    const reply = await this.request("GET", "/api/v1/tools", { auth: true });
    if (reply.status === 200 && reply.json && Array.isArray(reply.json.tools)) return reply.json as unknown as ToolsResponse;
    return this.fail(reply, "The registry did not answer");
  }

  /** Run one tool through the door. */
  async call(tool: string, input: Record<string, unknown> = {}, opts: CallOptions = {}): Promise<CallResult> {
    const reply = await this.request("POST", `/api/v1/tools/${encodeURIComponent(tool)}`, {
      body: JSON.stringify(input),
      auth: true,
      headers: callHeaders(opts)
    });
    return this.outcome(reply, `"${tool}" did not answer`);
  }

  /**
   * Apply a campaign's plan: every create and update step as a tool call,
   * one derived key per step. Two passes — segments and emails, then the
   * plan again (a nurture program builds from published emails), then the
   * nurture program and the CRM campaign. A dry run plans each step instead.
   */
  async apply(campaignId: string, opts: ApplyOptions): Promise<ApplyResult> {
    if (!opts.key) throw new CrmCareError("apply needs a key: one per run; each step derives its own.", 400, null);
    const dryRun = opts.dryRun === true;
    const steps: ApplyStepResult[] = [];
    const skipped: PlatformStep[] = [];
    const runnable = (s: PlatformStep) => s.action === "create" || s.action === "update";
    const pass = async (plan: PlatformPlan, kinds: PlatformStep["kind"][]) => {
      for (const step of plan.steps.filter((s) => kinds.includes(s.kind))) {
        if (!runnable(step)) {
          skipped.push(step);
          continue;
        }
        const targetId = step.kind === "nurture" || step.kind === "crm_campaign" ? campaignId : (step.id ?? campaignId);
        const idempotencyKey = `${opts.key}:${step.kind}:${targetId}`;
        const tool = APPLY_TOOL_FOR[step.kind];
        const result = await this.call(tool, { id: targetId }, { idempotencyKey, dryRun });
        const ok =
          result.status === "applied" || result.status === "replayed" || (result.status === "planned" && !result.wouldRefuse);
        const r: ApplyStepResult = { step, tool, idempotencyKey, result, ok };
        steps.push(r);
        opts.onStep?.(r);
      }
    };
    const first = await this.planCampaign(campaignId);
    await pass(first, ["segment", "email"]);
    const second = dryRun ? first : await this.planCampaign(campaignId);
    await pass(second, ["nurture", "crm_campaign"]);
    return { campaignId, dryRun, connections: first.connections, steps, skipped, ok: steps.every((s) => s.ok) };
  }
}

function callHeaders(opts: CallOptions): Record<string, string> {
  const h: Record<string, string> = {};
  if (opts.idempotencyKey) h["idempotency-key"] = opts.idempotencyKey;
  if (opts.dryRun) h["dry-run"] = "true";
  return h;
}
