# Contributing

This repository is the public home of the `crmcare` package: the campaign
spec's schema and types, the builder, the client, the CLI, the templates,
and the conformance suite.

**Where the spec lives.** The schema under `src/generated/` is generated
from the crm.care application, which is where the spec is validated on the
server. A change to the spec — a new field, a new channel — starts there
and is synced here with the next release; a pull request that edits a
generated file will be overwritten. Open an issue instead and say what the
spec should carry and why.

**What to send pull requests for.** The client (`src/client.ts`), the CLI
(`src/cli.ts`), the templates (`templates/*.campaign.yaml` — a template is
a valid spec with a `template` tag), the conformance suite
(`src/conformance.ts`), and the README.

**Running it.**

```bash
npm install
npm run build
npm test
node bin/crmcare.mjs conformance --host https://crm.care      # the public checks
CRMCARE_TOKEN=ccr_… node bin/crmcare.mjs conformance          # with a workspace token
```

**Versioning.** `0.x` while the spec is `campaign/0.1`; additive within a
minor. The policy is on [crm.care/docs/contract](https://crm.care/docs/contract).
