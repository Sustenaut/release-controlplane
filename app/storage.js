// Reading each owner's board from storage.sustenaut.eu, as this pod. Kubernetes
// renews the token in its file, so the file is read for each request. Cloudflare
// refuses some default User-Agents, so this one says who it is. A storage that
// hasn't answered within TIMEOUT_MS is an error that says so, not a page that waits.

import { readFile } from "node:fs/promises";

const AGENT = "sustenaut-release-controlplane";
const TIMEOUT_MS = 10_000;

export function boards({ storageUrl, storageTokenFile }, { fetch = globalThis.fetch, read = readFile, timeout = TIMEOUT_MS } = {}) {
  async function get(owner, path) {
    const token = (await read(storageTokenFile, "utf8")).trim();
    const response = await fetch(`${storageUrl}/${owner.tenant}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": AGENT },
      signal: AbortSignal.timeout(timeout),
    }).catch((err) => {
      throw err?.name === "TimeoutError" ? new Error(`storage didn't answer within ${timeout / 1000} s`) : err;
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`storage said ${response.status}`);
    return response.json();
  }
  return {
    latest: (owner) => get(owner, "/head/board"),
    log: async (owner) => (await get(owner, "/head/board/log"))?.log ?? [],
  };
}
