// When the board's workflow last ran, from GitHub's public API. A board is only kept
// when something changed, so its own time can't say the runs are still going. The
// workflow is in a public repository, so this needs no token and no app's access.
// The call is github.board-read's read, through the app's Caller; GitHub not answering
// is an error, so the board shows without it.

import { Unavailable } from "@sustenaut/integrations/caller.js";
import { caller as defaultCaller } from "./calls.js";

const AGENT = "sustenaut-release-controlplane";

export function lastRun(workflow, { caller = defaultCaller() } = {}) {
  const [owner, repo, file] = workflow.split("/");
  return async () => {
    let answer;
    try {
      answer = await caller.call("github.board-read", "read", {
        method: "GET",
        url: `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${file}/runs?status=completed&per_page=1`,
        headers: { Accept: "application/vnd.github+json", "User-Agent": AGENT },
      });
    } catch (err) {
      if (!(err instanceof Unavailable)) throw err;
      throw new Error(err.answer ? `GitHub said ${err.answer.status}` : `GitHub didn't answer: ${err.detail}`);
    }
    if (!answer.ok) throw new Error(`GitHub said ${answer.status}`);
    const [run] = answer.json().workflow_runs;
    return run ? { time: run.updated_at, conclusion: run.conclusion, url: run.html_url } : null;
  };
}
