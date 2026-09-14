# crmcare

The [crm.care](https://crm.care) campaign spec as a package: the schema and
types for `campaign/0.1`, a typed builder, a client for the REST twin, the
`crmcare` CLI, and five templates. A campaign is a file; this is how a
person or an agent validates it, plans it against the connected marketing
platform and CRM, imports it, and applies the plan — through one door,
with an idempotency key on every change.

```bash
npm install crmcare        # the library and the CLI
npx crmcare templates      # the five shipped campaign shapes
```

## The shortest route

```bash
npx crmcare template webinar-launch > q4-webinar.campaign.yaml   # start from a shape
npx crmcare validate q4-webinar.campaign.yaml                     # no account: every problem at once
export CRMCARE_TOKEN=ccr_…                                        # a workspace admin mints it (Agent access)
npx crmcare plan q4-webinar.campaign.yaml                         # what importing and publishing would do
npx crmcare import q4-webinar.campaign.yaml --key q4-webinar-2026-11
npx crmcare apply c_… --key q4-webinar-2026-11 --dry-run          # the plan's steps, foreseen
npx crmcare apply c_… --key q4-webinar-2026-11                    # the plan's steps, through the door
```

Nothing publishes on import: a draft is created with its content. `apply`
runs the plan's create and update steps as tools — `publish_segment`,
`publish_email`, `write_nurture`, `sync_to_crm` — each behind a grant a
workspace admin turns on, each with its own idempotency key derived from
`--key`, so a re-run is a replay, not a repeat. A draft email is refused
until a person approves it; a written workflow is disabled until a person
enables it.

## The library

```ts
import { defineCampaign, CrmCare } from "crmcare";

const spec = defineCampaign({
  name: "Q4 attribution launch",
  brief: {
    objective: "40 demos booked by 30 November",
    audience: "RevOps leaders at 200–2,000-seat B2B SaaS",
    keyMessage: "Every touch reports to the pipeline it moved."
  },
  channels: ["Email", "LinkedIn"]
});
// defineCampaign throws CampaignSpecError with every issue and its path.

const crm = new CrmCare({ token: process.env.CRMCARE_TOKEN }); // host defaults to https://crm.care

await crm.validate(spec);                                    // no credential needed
const plan = await crm.planSpec(spec);                       // workspace side + platform side
const imported = await crm.import(spec, { idempotencyKey: "q4-2026-11" });
const campaignId = (imported.data as { campaignId: string }).campaignId;
const applied = await crm.apply(campaignId, { key: "q4-2026-11", dryRun: true });
```

Every execution answers with the door's outcome — `planned`, `applied`,
`replayed`, `refused` or `failed` — as the server states it. Only a
transport or credential failure throws (`CrmCareError`, with the status
and the body).

| Method | Credential | Does |
| --- | --- | --- |
| `validate(spec)` | none | every problem at once, or the summary |
| `schema()` | none | the JSON Schema (draft 2020-12) |
| `planCampaign(id)` / `planSpec(spec)` / `plan(x)` | read | the plan against the connected platforms; a spec also gets the import's dry run |
| `import(spec, { idempotencyKey, dryRun })` | workspace | a draft campaign with its content |
| `export(id, "yaml" \| "json")` | read | the campaign as a spec |
| `tools()` | read | the registry, with what this credential may run |
| `call(tool, input, { idempotencyKey, dryRun })` | per tool | one tool through the door |
| `apply(id, { key, dryRun, onStep })` | granted tools | the plan's create and update steps, one key each |

Also exported: `CampaignSpecSchema` (zod), `CampaignSpec` and the part
types, `validateCampaignSpec`, `parseSpecText`, `specToYaml`,
`campaignSpecJsonSchema`, `listTemplates`, `readTemplate`, and the constants
(`CAMPAIGN_CHANNELS`, `SOCIAL_PLATFORMS`, `CALENDAR_KINDS`,
`GATED_ASSET_KINDS`, `CAMPAIGN_SPEC_VERSION`).

## Credentials

- `ccr_…` — a workspace token. A workspace admin mints it in the Operator
  console (app.crm.care/campaigns/operator → Agent access). Reads work at
  once; each write is off until the admin grants that tool.
- The crm.care MCP connector's OAuth access token, or a `crm_pat_…`
  personal token — read-only: validate, plan, export, tools.

Set `CRMCARE_TOKEN` (and `CRMCARE_HOST` for another host), or pass
`--token` / `--host` to the CLI.

## The spec

What a campaign *is* — brief, channels, plan, guardrails, segments, emails,
social, calendar, assets — never what happened to it. Strict: an unknown
key is an error. The schema is generated from the same source the server
validates with, and served at `https://crm.care/api/v1/campaign-spec/schema`;
`schema.json` in this package is the same document. The full description,
the example and the versioning policy: [crm.care/docs/spec](https://crm.care/docs/spec).
The guarantees every call is held to: [crm.care/docs/contract](https://crm.care/docs/contract).

## Conformance

`crmcare conformance` checks a host against the guarantees on
[crm.care/docs/contract](https://crm.care/docs/contract): the public docs,
the served schema, validation without an account, the registry's shape,
the grant rule, unknown-tool and read-only refusals, dry run changing
nothing, idempotent replay and conflict, the plan being free, the spec
round trip, and REST/MCP parity. Each check passes, fails or is skipped
with the reason (a check that needs a granted tool or a read-only
credential says so). The one check that writes uses `tag_campaign` on one
campaign and removes what it added.

```bash
npx crmcare conformance --host https://crm.care                 # the public checks
CRMCARE_TOKEN=ccr_… npx crmcare conformance --campaign c_…     # with a workspace token
npx crmcare conformance --json                                  # the report as JSON
```

crm.care runs it against its own hosts after every release. An implementer
of the contract runs it against theirs.

## Versioning

The package follows the spec: `0.x` while the spec is `campaign/0.1`,
additive within a minor. A breaking change to the spec is a new version
string, and the old one keeps validating and importing for at least 90
days after the new one ships.
