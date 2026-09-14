// The crmcare CLI, over the client.
//
//   crmcare validate <file>            no account: every problem at once, or the summary
//   crmcare plan <file> | <campaign id> the plan — workspace side for a file, platform side for both
//   crmcare import <file> [--key K] [--dry-run]   a draft campaign with its content
//   crmcare export <campaign id>       the campaign as a spec (YAML)
//   crmcare apply <campaign id> --key K [--dry-run]   run the plan: one tool call per step, one key each
//   crmcare tools                      the registry, with what this credential may run
//   crmcare templates                  the shipped templates
//   crmcare template <name>            a template's YAML, to stdout
//   crmcare schema                     the JSON Schema, to stdout
//   crmcare conformance [--campaign ID] [--json]
//                                      the contract's guarantees, checked against the host
//
// Env: CRMCARE_TOKEN (ccr_… workspace token, or the connector's OAuth token /
// a crm_pat_… personal token for reads), CRMCARE_HOST (default https://crm.care).
// Flags --token and --host override the env.

import { existsSync, readFileSync } from "node:fs";
import { CrmCare, CrmCareError, looksLikeCampaignId, type ApplyStepResult, type PlatformStep } from "./client.js";
import { listTemplates, readTemplate } from "./templates.js";
import { campaignSpecJsonSchema } from "./generated/schema.js";
import { renderConformance, runConformance } from "./conformance.js";

// `crmcare <command> [positional] [--flag value] …` — flags may come anywhere after the command.
const argv = process.argv.slice(2);
const cmd = argv[0];
const positional: string[] = [];
const flags: Record<string, string> = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else {
      flags[a.slice(2)] = "true";
    }
  } else {
    positional.push(a);
  }
}
const arg: string | undefined = positional[0];

function die(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}
function file(p: string): string {
  return readFileSync(p, "utf8");
}
// A file on disk is a spec; anything else is a campaign id.
const isId = (s: string | undefined): s is string => Boolean(s) && !existsSync(s as string) && looksLikeCampaignId(s as string);

const token = flags.token && flags.token !== "true" ? flags.token : process.env.CRMCARE_TOKEN;
const host = flags.host && flags.host !== "true" ? flags.host : process.env.CRMCARE_HOST;
const client = new CrmCare({ token, host });

function printStep(s: ApplyStepResult): void {
  const r = s.result;
  const detail =
    r.status === "planned"
      ? r.wouldRefuse
        ? `would be refused (${r.wouldRefuse.code}): ${r.wouldRefuse.reason}`
        : r.summary
      : (r.summary ?? r.reason ?? "");
  console.log(`${s.ok ? "✓" : "✗"} ${r.status.padEnd(9)} ${s.step.kind.padEnd(12)} ${s.step.label} — ${detail}`);
}
function printSkipped(s: PlatformStep): void {
  console.log(`· ${s.action.padEnd(9)} ${s.kind.padEnd(12)} ${s.label}${s.reason ? ` — ${s.reason}` : ""}`);
}

async function main(): Promise<number> {
  switch (cmd) {
    case "validate": {
      if (!arg) die("crmcare validate <file>");
      const r = await client.validate(file(arg));
      console.log(JSON.stringify(r, null, 2));
      return r.ok ? 0 : 1;
    }
    case "plan": {
      if (!arg) die("crmcare plan <file> | <campaign id>");
      const j = isId(arg) ? await client.planCampaign(arg) : await client.planSpec(file(arg));
      if ("workspace" in j) {
        const w = j.workspace;
        console.log(`Workspace: ${w.status}${w.wouldRefuse ? ` — would be refused (${w.wouldRefuse.code}): ${w.wouldRefuse.reason}` : ""}`);
        for (const e of w.effects ?? []) console.log(`  ${e.kind}: ${e.summary}`);
        if (w.gates?.allowance && !w.gates.allowance.ok) console.log(`  allowance: ${w.gates.allowance.reason}`);
        console.log("");
        console.log(j.platform.summary ?? "");
      } else {
        console.log(j.summary ?? "");
      }
      return 0;
    }
    case "import": {
      if (!arg) die("crmcare import <file> [--key K] [--dry-run]");
      const r = await client.import(file(arg), {
        idempotencyKey: flags.key && flags.key !== "true" ? flags.key : undefined,
        dryRun: Boolean(flags["dry-run"])
      });
      console.log(r.summary ?? JSON.stringify(r, null, 2));
      const data = r.data as { campaignId?: string } | undefined;
      if (data?.campaignId) console.log(`\ncampaign: ${data.campaignId}`);
      return r.httpStatus === 200 ? 0 : 1;
    }
    case "export": {
      if (!isId(arg)) die("crmcare export <campaign id>");
      process.stdout.write(await client.export(arg, "yaml"));
      return 0;
    }
    case "apply": {
      if (!isId(arg)) die("crmcare apply <campaign id> --key K [--dry-run]");
      if (!flags.key || flags.key === "true") die("crmcare apply needs --key K (one key per run; each step derives its own from it).");
      const dry = Boolean(flags["dry-run"]);
      let headerShown = false;
      const result = await client.apply(arg, {
        key: flags.key,
        dryRun: dry,
        onStep: (s) => {
          if (!headerShown) headerShown = true;
          printStep(s);
        }
      });
      const c = result.connections;
      console.log(`${dry ? "Dry run — " : ""}${c.map.label} ${c.map.connected ? "connected" : "NOT connected"} · ${c.crm.label} ${c.crm.connected ? "connected" : "NOT connected"}`);
      for (const s of result.skipped) printSkipped(s);
      if (result.steps.length === 0) console.log("Nothing to run: no step is a create or an update.");
      if (dry) console.log("\nNothing was changed. Drop --dry-run to apply.");
      return result.ok ? 0 : 1;
    }
    case "tools": {
      const j = await client.tools();
      console.log(`${j.tools.length} tools · credential: ${j.credential}${j.readOnly ? " (read-only)" : ""} · workspace ${j.workspace}`);
      for (const t of j.tools) {
        console.log(
          `  ${t.callable ? "✓" : "·"} ${t.name.padEnd(28)} ${t.readOnly ? "read " : "write"}  ${t.cost.model ? `~${t.cost.estimatePence}p` : "free "}  ${t.undoable ? "      " : "no-undo"}  ${t.title}`
        );
      }
      return 0;
    }
    case "templates": {
      for (const t of listTemplates()) console.log(`  ${t.name.padEnd(22)} ${t.title}`);
      console.log(`\ncrmcare template <name> > my.campaign.yaml`);
      return 0;
    }
    case "template": {
      if (!arg) die(`crmcare template <name> — one of: ${listTemplates().map((t) => t.name).join(", ")}`);
      process.stdout.write(readTemplate(arg));
      return 0;
    }
    case "schema": {
      console.log(JSON.stringify(campaignSpecJsonSchema(), null, 2));
      return 0;
    }
    case "conformance": {
      // `arg` may be the campaign id, or absent (flags only).
      const campaignId = flags.campaign && flags.campaign !== "true" ? flags.campaign : isId(arg) ? arg : undefined;
      const report = await runConformance({ host: client.host, token, campaignId });
      console.log(flags.json ? JSON.stringify(report, null, 2) : renderConformance(report));
      return report.ok ? 0 : 1;
    }
    default:
      die(
        "crmcare validate <file> | plan <file|id> | import <file> [--key K] [--dry-run] | export <id> | apply <id> --key K [--dry-run] | tools | templates | template <name> | schema | conformance [--campaign ID] [--json]"
      );
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof CrmCareError) {
      console.error(`HTTP ${err.status}: ${err.message}`);
      process.exit(1);
    }
    console.error((err as Error)?.message ?? String(err));
    process.exit(1);
  }
);
