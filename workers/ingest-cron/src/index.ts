/**
 * Fires `workflow_dispatch` on the ingest workflow, on a schedule that is
 * actually kept. See wrangler.toml for why this exists rather than relying on
 * GitHub's own cron.
 *
 * Failures throw rather than log-and-continue: a silently dead trigger would
 * look exactly like a working one until someone noticed a hole in the archive
 * weeks later, and holes cannot be backfilled. Throwing marks the invocation
 * as errored in Cloudflare's dashboard and in `wrangler tail`.
 *
 * Each tick re-enables the workflow before dispatching it. GitHub disables
 * workflows that carry a `schedule:` trigger after 60 days without a commit
 * on a public repo, and a disabled workflow rejects `workflow_dispatch` too —
 * so a quiet stretch waiting on the archive to mature would stop the archive.
 * Enabling an enabled workflow is a no-op (204). The PAT's Actions: write
 * already covers it.
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
    const workflowUrl =
      `https://api.github.com/repos/${env.REPO}` +
      `/actions/workflows/${env.WORKFLOW}`;
    const headers = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub rejects API requests without one.
      'User-Agent': 'otrolado-ingest-cron',
    };

    // Best-effort: a failed enable must not skip the dispatch. If the workflow
    // really is disabled, the dispatch below fails and throws anyway.
    const enable = await fetch(`${workflowUrl}/enable`, {
      method: 'PUT',
      headers,
    }).catch((err: unknown) => err);
    if (!(enable instanceof Response) || enable.status !== 204) {
      console.warn(
        'enable failed:',
        enable instanceof Response ? `HTTP ${enable.status}` : enable,
      );
    }

    const res = await fetch(`${workflowUrl}/dispatches`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
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
