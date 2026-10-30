// What the app is told, all from its environment; see the README. Nothing here
// names a repository: the owners come from RELEASE_OWNERS, and each owner's state
// repository is always <owner>/release-state.

export function configFrom(env) {
  const need = (name) => {
    if (!env[name]) throw new Error(`${name} is not set`);
    return env[name];
  };
  const owners = need("RELEASE_OWNERS").split(",").map((pair) => {
    const [name, installation] = pair.trim().split(":");
    if (!name || !/^\d+$/.test(installation ?? "")) {
      throw new Error("RELEASE_OWNERS is a list of owner:installation-id, separated by commas");
    }
    return { name, installation, tenant: `release-${name.toLowerCase()}` };
  });
  return {
    owners,
    team: need("TEAM").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    appId: need("RELEASE_READER_APP_ID"),
    appKey: need("RELEASE_READER_APP_KEY"),
    storageUrl: (env.STORAGE_URL ?? "https://storage.sustenaut.eu").replace(/\/$/, ""),
    storageTokenFile: need("STORAGE_TOKEN_FILE"),
    port: Number(env.PORT ?? 8080),
  };
}
