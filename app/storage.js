// Reading each owner's board from storage.sustenaut.eu, as this pod, with integrations'
// generated storage client: the token file is read for each request (Kubernetes renews
// it), and a storage that doesn't answer within its class's timeout is an error that
// says so, not a page that waits. A board never written yet is no board.

import { NotFound, Storage, StorageUnavailable } from "@sustenaut/integrations/storage.js";
import { caller as defaultCaller } from "./calls.js";

const AGENT = "sustenaut-release-controlplane";

export function boards({ storageUrl, storageTokenFile }, { caller = defaultCaller(), readFile } = {}) {
  const store = (owner) => new Storage({ tenant: owner.tenant, baseUrl: storageUrl, tokenFile: storageTokenFile, readFile, caller, userAgent: AGENT });
  async function read(get, missing) {
    try {
      return await get();
    } catch (err) {
      if (err instanceof NotFound) return missing;
      if (err instanceof StorageUnavailable && err.status === null) throw new Error(`storage didn't answer: ${err.detail}`);
      if (err.status) throw new Error(`storage said ${err.status}${err.error ? `: ${err.error}` : ""}`);
      throw err;
    }
  }
  return {
    latest: (owner) => read(async () => JSON.parse(new TextDecoder().decode((await store(owner).getHead("board")).body)), null),
    log: (owner) => read(() => store(owner).headLog("board"), []),
  };
}
