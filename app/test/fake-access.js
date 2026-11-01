// The real access check, with Keycloak answered here: a person's token is their roles.
import { accessCheck } from "../access.js";

export function fakeAccess() {
  return accessCheck({
    realmUrl: "https://auth.test/realms/team", clientId: "c", clientSecret: "s", role: "release",
    request: async (url, { headers }) => ({
      status: 200, ok: true,
      json: async () => (url.endsWith("/access-state") ? { hash: "h" } : { access: headers.Authorization.slice("Bearer ".length).split(",") }),
    }),
  });
}
