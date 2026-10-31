// When the board's workflow last ran, from GitHub's public API. A board is only kept
// when something changed, so its own time can't say the runs are still going. The
// workflow is in a public repository, so this needs no token and no app's access.

const AGENT = "sustenaut-release-controlplane";

export function lastRun(workflow, { fetch = globalThis.fetch } = {}) {
  const [owner, repo, file] = workflow.split("/");
  return async () => {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${file}/runs?status=completed&per_page=1`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": AGENT },
    });
    if (!response.ok) throw new Error(`GitHub said ${response.status}`);
    const [run] = (await response.json()).workflow_runs;
    return run ? { time: run.updated_at, conclusion: run.conclusion, url: run.html_url } : null;
  };
}
