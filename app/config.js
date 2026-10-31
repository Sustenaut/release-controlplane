// What the app is told, all from its environment; see the README. One deployment is
// for one owner: another owner runs its own, with its own settings, sign-in and storage.

export function configFrom(env) {
  const need = (name) => {
    if (!env[name]) throw new Error(`${name} is not set`);
    return env[name];
  };
  const name = need("RELEASE_OWNER");
  const installation = (key, value) => {
    if (!/^\d+$/.test(value)) throw new Error(`${key} must be a number`);
    return value;
  };
  const emails = (text) => text.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const writerInstallation = env.RELEASE_STATE_WRITER_INSTALLATION_ID;
  return {
    owner: {
      name,
      installation: installation("RELEASE_READER_APP_INSTALLATION_ID", need("RELEASE_READER_APP_INSTALLATION_ID")),
      writerInstallation: writerInstallation ? installation("RELEASE_STATE_WRITER_INSTALLATION_ID", writerInstallation) : undefined,
      tenant: `release-${name.toLowerCase()}`,
    },
    team: emails(need("TEAM")),
    // Without these the app only reads.
    operators: emails(env.OPERATORS ?? ""),
    writerId: env.RELEASE_STATE_WRITER_APP_ID,
    writerKey: env.RELEASE_STATE_WRITER_APP_KEY,
    appId: need("RELEASE_READER_APP_ID"),
    appKey: need("RELEASE_READER_APP_KEY"),
    storageUrl: (env.STORAGE_URL ?? "https://storage.sustenaut.eu").replace(/\/$/, ""),
    storageTokenFile: need("STORAGE_TOKEN_FILE"),
    port: Number(env.PORT ?? 8080),
  };
}
