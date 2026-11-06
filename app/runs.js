// When the board's workflow last ran, from GitHub's public API. A board is only kept
// when something changed, so its own time can't say the runs are still going. The
// workflow is in a public repository, so this needs no token and no app's access.
// GitHub not answering within TIMEOUT_MS is an error, so the board shows without it.

const AGENT = "sustenaut-release-controlplane";
const TIMEOUT_MS = 10_000;

export function lastRun(workflow, { fetch = globalThis.fetch, timeout = TIMEOUT_MS } = {}) {
  const [owner, repo, file] = workflow.split("/");
  return async () => {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${file}/runs?status=completed&per_page=1`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": AGENT },
      signal: AbortSignal.timeout(timeout),
    }).catch((err) => {
      throw err?.name === "TimeoutError" ? new Error(`GitHub didn't answer within ${timeout / 1000} s`) : err;
    });
    if (!response.ok) throw new Error(`GitHub said ${response.status}`);
    const [run] = (await response.json()).workflow_runs;
    return run ? { time: run.updated_at, conclusion: run.conclusion, url: run.html_url } : null;
  };
}
