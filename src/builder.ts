// The typed builder: a spec an editor autocompletes and the schema checks.
//
// defineCampaign() is an identity with a guarantee — what comes back has
// passed the same validation the server runs, so an import cannot fail on
// shape. The version key is filled in; everything else is the spec.

import { z } from "zod";
import { CAMPAIGN_SPEC_VERSION, CampaignSpecSchema, validateCampaignSpec, type CampaignSpec, type SpecIssue } from "./generated/schema.js";

/** A spec as an author writes it: the version key is optional here and filled in. */
export type CampaignSpecInput = Omit<z.input<typeof CampaignSpecSchema>, "crmcare"> & {
  crmcare?: typeof CAMPAIGN_SPEC_VERSION;
};

export class CampaignSpecError extends Error {
  constructor(readonly issues: SpecIssue[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
    this.name = "CampaignSpecError";
  }
}

/** Validate and return the spec, or throw with every issue and its path. */
export function defineCampaign(input: CampaignSpecInput): CampaignSpec {
  const result = validateCampaignSpec({ crmcare: CAMPAIGN_SPEC_VERSION, ...input });
  if (!result.ok) throw new CampaignSpecError(result.issues);
  return result.spec;
}
