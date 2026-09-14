// GENERATED from lib/asset-kinds.ts by scripts/sync-crmcare-package.mjs — do not edit here.
// Edit the source in the crm.care app and run `npm run crmcare:build`.

export const GATED_ASSET_KINDS = [
  "white-paper",
  "guide",
  "checklist",
  "playbook",
  "landing-page",
  "press-release",
  "webinar-kit",
  "video-script",
  "faq"
] as const;

export type GatedAssetKind = (typeof GATED_ASSET_KINDS)[number];
