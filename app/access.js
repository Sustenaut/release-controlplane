// Has this person's access changed? auth's "Checking access on each request", whose
// reference is its access_check.py. Nothing runs on a timer: on a request it fetches the
// realm's hash of this client's access state, or uses one fetched within 2 seconds. If
// that differs from the hash stored for this person, or their last full check is over 5
// minutes old, it does one full check at userinfo with their access token, and stores
// the answer here on the server.
//
// If Keycloak can't be reached, someone whose stored hash is still the last one known
// keeps reading on their last roles. Changes are refused, and so is anyone else.

export const OK = "ok";
export const DEGRADED = "degraded"; // allowed, on the last answer, while Keycloak can't be reached
export const NO_ROLE = "no_role"; // signed in, without the role
export const SIGN_IN = "sign_in"; // the session has ended, or the account was removed
export const UNAVAILABLE = "unavailable"; // Keycloak can't be reached, and this can't be vouched for

export function accessCheck({ realmUrl, clientId, clientSecret, role, hashFor = 2_000, fullEvery = 300_000, maxPeople = 1000, timeout = 3_000, now = Date.now, request = fetch }) {
  const realm = realmUrl.replace(/\/$/, "");
  const people = new Map();
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
  let known = null; // the last hash Keycloak gave
  let fetched = null;
  let fetching = null;

  const get = async (url, authorization) => {
    try {
      const response = await request(url, { headers: { Accept: "application/json", Authorization: authorization }, signal: AbortSignal.timeout(timeout) });
      return { status: response.status, body: response.ok ? await response.json() : {} };
    } catch {
      return { status: 0, body: {} };
    }
  };

  // The current hash, or null if Keycloak can't say. A burst of requests makes one fetch.
  const currentHash = () => {
    if (fetched !== null && now() - fetched < hashFor) return Promise.resolve(known);
    fetching ??= get(`${realm}/app-registration/${encodeURIComponent(clientId)}/access-state`, `Basic ${basic}`)
      .then(({ status, body }) => {
        const fresh = status === 200 && typeof body?.hash === "string" && body.hash ? body.hash : null;
        fetched = fresh ? now() : null;
        if (fresh) known = fresh;
        return fresh;
      })
      .finally(() => { fetching = null; });
    return fetching;
  };

  const decide = (roles, reason) => (role && !roles.has(role) ? { allowed: false, reason: NO_ROLE, roles } : { allowed: true, reason, roles });
  const refused = (reason) => ({ allowed: false, reason, roles: new Set() });
  const onTheLastAnswer = (stored, write) => (write || !stored || stored.hash !== known ? refused(UNAVAILABLE) : decide(stored.roles, DEGRADED));

  return async function check(person, token, { write = false } = {}) {
    const current = await currentHash();
    const stored = people.get(person);
    if (current === null) return onTheLastAnswer(stored, write);
    if (stored && stored.hash === current && now() - stored.checked < fullEvery) return decide(stored.roles, OK);
    if (!token) {
      people.delete(person);
      return refused(SIGN_IN);
    }
    const { status, body } = await get(`${realm}/protocol/openid-connect/userinfo`, `Bearer ${token}`);
    if (status === 401 || status === 403) {
      people.delete(person);
      return refused(SIGN_IN);
    }
    if (status !== 200 || typeof body !== "object" || body === null) return onTheLastAnswer(stored, write);
    // The hash asked for before the full check: a change between the two is seen next time.
    const claim = Array.isArray(body.access) ? body.access : [];
    const roles = new Set(claim.filter((r) => typeof r === "string"));
    people.delete(person);
    people.set(person, { hash: current, roles, checked: now() });
    while (people.size > maxPeople) people.delete(people.keys().next().value);
    return decide(roles, OK);
  };
}
