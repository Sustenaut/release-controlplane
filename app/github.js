// Reading the state repositories as the reader app, through pubpr's request
// function. Each owner has its own installation, so each gets its own token, which
// asks for Contents read and nothing else, kept until shortly before it expires.

import { createSign } from "node:crypto";
import { github } from "pubpr";

const STATE_FILE = "state.json";
const b64url = (value) => Buffer.from(value).toString("base64url");

export function appJwt(appId, key, now = Date.now()) {
  const seconds = Math.floor(now / 1000);
  // GitHub allows ten minutes, and a clock a little behind its own.
  const claims = { iat: seconds - 60, exp: seconds + 540, iss: appId };
  const body = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(key, "base64url")}`;
}

export function reader({ appId, appKey }, { fetch, now = Date.now } = {}) {
  const tokens = new Map();

  async function tokenFor(owner) {
    const held = tokens.get(owner.name);
    if (held && held.expires - now() > 60_000) return held.token;
    const api = github({ token: appJwt(appId, appKey, now()), fetch });
    const made = await api(`/app/installations/${owner.installation}/access_tokens`, {
      method: "POST",
      body: { permissions: { contents: "read" } },
    });
    tokens.set(owner.name, { token: made.token, expires: Date.parse(made.expires_at) });
    return made.token;
  }

  const forOwner = (owner) => github({ token: () => tokenFor(owner), fetch });
  const at = (owner) => `/repos/${owner.name}/release-state`;

  return {
    // The state file as it is on main, or at a commit, parsed.
    async state(owner, ref = "main") {
      const text = await forOwner(owner)(`${at(owner)}/contents/${STATE_FILE}?ref=${ref}`, { raw: true });
      return JSON.parse(text);
    },
    // The commits that changed the state file, newest first.
    async commits(owner, count = 20) {
      const found = await forOwner(owner)(`${at(owner)}/commits?path=${STATE_FILE}&per_page=${count}`);
      return found.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author?.name ?? "",
        time: c.commit.author?.date ?? "",
      }));
    },
  };
}
