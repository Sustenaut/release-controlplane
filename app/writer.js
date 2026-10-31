// Saving a state file as a pull request that merges itself, as the state writer app,
// which may write only to the state repositories. Its key is only on the server.

import { randomBytes } from "node:crypto";
import { propose as realPropose } from "pubpr";
import { installationTokens } from "./github.js";

const STATE_FILE = "state.json";

export function stateText(state) {
  const repos = Object.fromEntries(Object.entries(state.repos).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ owner: state.owner, repos }, null, 2)}\n`;
}

export function writer({ writerId, writerKey }, { propose = realPropose, fetch, now = Date.now } = {}) {
  const tokenFor = installationTokens({
    appId: writerId, appKey: writerKey, fetch, now, installationOf: (owner) => owner.writerInstallation,
    permissions: { contents: "write", pull_requests: "write" },
  });
  return {
    save(owner, { state, sha, note, who }) {
      const stamp = new Date(now()).toISOString().replace(/\D/g, "").slice(0, 14);
      return propose({
        repo: `${owner.name}/release-state`,
        base: "main",
        branch: `state/${stamp}-${randomBytes(3).toString("hex")}`,
        title: note,
        body: `Requested by ${who} in the release control plane.`,
        message: `${note}\n\nRequested-by: ${who}\n`,
        changes: { [STATE_FILE]: stateText(state) },
        expect: { [STATE_FILE]: sha },
        autoMerge: true,
        token: () => tokenFor(owner),
        fetch,
      });
    },
  };
}
