// Reading each owner's board from storage.sustenaut.eu, as this pod. Kubernetes
// renews the token in its file, so the file is read for each request. Cloudflare
// refuses some default User-Agents, so this one says who it is.

import { readFile } from "node:fs/promises";

const AGENT = "sustenaut-release-controlplane";

export function boards({ storageUrl, storageTokenFile }, { fetch = globalThis.fetch, read = readFile } = {}) {
  async function get(owner, path) {
    const token = (await read(storageTokenFile, "utf8")).trim();
    const response = await fetch(`${storageUrl}/${owner.tenant}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": AGENT },
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
