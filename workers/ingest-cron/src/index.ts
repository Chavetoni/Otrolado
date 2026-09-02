/**
 * Fires `workflow_dispatch` on the ingest workflow, on a schedule that is
 * actually kept. See wrangler.toml for why this exists rather than relying on
 * GitHub's own cron.
 *
 * Failures throw rather than log-and-continue: a silently dead trigger would
 * look exactly like a working one until someone noticed a hole in the archive
 * weeks later, and holes cannot be backfilled. Throwing marks the invocation
 * as errored in Cloudflare's dashboard and in `wrangler tail`.
 */

interface Env {
  /** Fine-grained PAT, repo-scoped, Actions: read and write. */
  readonly GITHUB_TOKEN: string;
  readonly REPO: string;
  readonly WORKFLOW: string;
  readonly REF: string;
}

export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const url =
      `https://api.github.com/repos/${env.REPO}` +
      `/actions/workflows/${env.WORKFLOW}/dispatches`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API requests without one.
        'User-Agent': 'otrolado-ingest-cron',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: env.REF }),
    });

    // 204 No Content is the documented success for this endpoint.
    if (res.status !== 204) {
      throw new Error(
        `dispatch failed: HTTP ${res.status} ${await res.text().catch(() => '')}`,
      );
    }
  },
};
