// The templates shipped with the package: the five campaign shapes a B2B
// team runs at least quarterly, each as a spec file under templates/.
// `crmcare template webinar-launch > my.campaign.yaml` is the quickest start.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const SUFFIX = ".campaign.yaml";

/** Where the files live: templates/ beside dist/ and src/. */
export function templatesDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

export interface TemplateEntry {
  /** The short name: webinar-launch. */
  name: string;
  file: string;
  /** The campaign name inside the file. */
  title: string;
}

export function listTemplates(): TemplateEntry[] {
  const dir = templatesDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(SUFFIX))
    .sort()
    .map((f) => {
      const text = readFileSync(resolve(dir, f), "utf8");
      const title = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? f;
      return { name: f.slice(0, -SUFFIX.length), file: resolve(dir, f), title };
    });
}

/** The template's YAML, by short name (with or without the suffix). */
export function readTemplate(name: string): string {
  const short = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : name;
  const entry = listTemplates().find((t) => t.name === short);
  if (!entry) {
    throw new Error(`No template "${name}". Available: ${listTemplates().map((t) => t.name).join(", ")}.`);
  }
  return readFileSync(entry.file, "utf8");
}
