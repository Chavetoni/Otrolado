# otrolado-ingest-cron

A Cloudflare Worker whose only job is to call `workflow_dispatch` on
`.github/workflows/ingest.yml` every 15 minutes, because GitHub's own
`schedule` event does not keep time reliably enough to build the archive.
See `wrangler.toml` for the measurements that led here.

Nothing here talks to Postgres or to CBP. It is a clock.

## Deploy

Two things need a browser, once:

1. A Cloudflare account (no credit card for the free tier), then:
   ```bash
   npx wrangler login
   ```
2. A GitHub **fine-grained** personal access token:
   - Settings > Developer settings > Personal access tokens > Fine-grained
   - Repository access: only `Chavetoni/Otrolado`
   - Permissions: **Actions: Read and write** (nothing else)
   - Set an expiry you will actually notice; renewing means re-running the
     `secret put` below.

Then, from this directory:

```bash
npx wrangler secret put GITHUB_TOKEN   # paste the PAT
npx wrangler deploy
```

## Verify

```bash
npx wrangler tail                       # watch invocations live
gh run list --workflow=ingest.yml       # runs should now say workflow_dispatch
```

A dispatch that fails throws, so a broken token shows up as an errored
invocation rather than as silence.
