// The public checkout's own test: build, then the package as a consumer sees it.
//
//   npm install && npm run build && npm test
//
// The fuller suites — the client against a fake host, the drift checks
// against the app's sources — run in the crm.care app, where the schema is
// generated. This holds what a checkout can hold: the templates validate,
// the builder fills and checks, schema.json is the schema the package
// computes, the CLI lists what it ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(resolve(root, "dist/index.js"));

test("every template validates as a spec", () => {
  const templates = mod.listTemplates();
  assert.equal(templates.length, 5);
  for (const t of templates) {
    const parsed = mod.parseSpecText(readFileSync(t.file, "utf8"), "application/yaml");
    assert.ok(parsed.ok, t.name);
    const v = mod.validateCampaignSpec(parsed.value);
    assert.ok(v.ok, `${t.name}: ${JSON.stringify(v.issues)}`);
    assert.equal(v.spec.name, t.title);
  }
});

test("defineCampaign fills the version and rejects a bad spec with paths", () => {
  const spec = mod.defineCampaign({ name: "Smoke", brief: { objective: "o", audience: "a", keyMessage: "k" }, channels: ["Email"] });
  assert.equal(spec.crmcare, mod.CAMPAIGN_SPEC_VERSION);
  assert.throws(() => mod.defineCampaign({ name: "", brief: { objective: "o", audience: "a", keyMessage: "k" }, channels: [] }), (e) => e.name === "CampaignSpecError" && e.issues.length === 2);
});

test("schema.json is the schema the package computes", () => {
  const file = JSON.parse(readFileSync(resolve(root, "schema.json"), "utf8"));
  assert.deepEqual(file, mod.campaignSpecJsonSchema());
});

test("the CLI runs and lists the templates", () => {
  const out = execFileSync(process.execPath, [resolve(root, "bin/crmcare.mjs"), "templates"], { encoding: "utf8" });
  assert.match(out, /webinar-launch/);
  assert.match(out, /crmcare template <name>/);
});

test("the conformance checks cover the contract's guarantees", () => {
  const ids = mod.CHECKS.map((c) => c.id);
  for (const id of ["docs-public", "schema-served", "validate-public", "registry", "grant-rule", "dry-run", "idempotency", "plan-free", "spec-round-trip", "mcp-parity", "read-only-credential"]) {
    assert.ok(ids.includes(id), id);
  }
});
