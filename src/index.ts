// crmcare — the crm.care campaign spec, as a package.
//
//   import { defineCampaign, CrmCare } from "crmcare";
//
//   const spec = defineCampaign({ name: "Q4 attribution launch", brief: { … }, channels: ["Email"] });
//   const crm = new CrmCare({ token: process.env.CRMCARE_TOKEN });
//   await crm.validate(spec);                       // no account needed
//   const plan = await crm.planSpec(spec);          // what importing and publishing would do
//   const draft = await crm.import(spec, { idempotencyKey: "q4-2026-11" });
//   await crm.apply(campaignId, { key: "q4-2026-11" });   // the plan's steps, through the door
//
// The schema and the YAML layer are generated from the crm.care app so the
// package validates exactly what the server validates.

export * from "./generated/schema.js";
export * from "./generated/text.js";
export { GATED_ASSET_KINDS, type GatedAssetKind } from "./generated/asset-kinds.js";
export * from "./builder.js";
export * from "./client.js";
export * from "./templates.js";
export * from "./conformance.js";
