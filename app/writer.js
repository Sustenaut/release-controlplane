// Saving a state file as a pull request that merges itself, as the state writer app,
// which may write only to the state repositories. Its key is only on the server.
// Its requests are calls of the app's Caller (calls.js): the token is
// github.app-token's mint-in-app, the pull request github.edit-pr's open-pr.

import { randomBytes } from "node:crypto";
import { propose as realPropose } from "pubpr";
import { caller as defaultCaller } from "./calls.js";
import { installationTokens } from "./github.js";

const STATE_FILE = "state.json";

export function stateText(state) {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function writer({ writerId, writerKey }, { propose = realPropose, caller = defaultCaller(), now = Date.now } = {}) {
  const tokenFor = installationTokens({
    appId: writerId, appKey: writerKey, caller, now, installationOf: (owner) => owner.writerInstallation,
    permissions: { contents: "write", pull_requests: "write" },
  });
  const fetch = caller.fetch("github.edit-pr", "open-pr");
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
