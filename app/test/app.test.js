// The pages, with GitHub and storage answered here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, createVerify } from "node:crypto";
import { createServer } from "node:http";
import { cached, handler, stateHistory } from "../server.js";
import { appJwt, reader } from "../github.js";
import { boards } from "../storage.js";
import { lastRun } from "../runs.js";
import { changes } from "../history.js";
import { configFrom } from "../config.js";
import { escape } from "../render.js";
import { accessCheck } from "../access.js";
import { fakeAccess } from "./fake-access.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" },
});
const OWNER = { name: "example-org", installation: "11", tenant: "release-example-org" };
const roles = (o) => ({ board: true, protect: true, govern: false, ...o });
const BOARD = {
  summary: "2 repos: 1 A, 1 D.",
  problems: [],
  repos: [
    { repo: "example-org/good", kind: "package", released: "v1.0.0", pubkit: "0.23.2", overall: "A", project: "tools", visibility: "public",
      grades: { quality: { letter: "A", start: { text: "SonarQube Cloud: A" }, steps: [] }, security: { letter: "A" }, delivery: { letter: "A" } } },
    { repo: "example-org/bad", kind: "service", released: "-", pubkit: "<b>old</b>", overall: "D", project: "tools", visibility: "private",
      grades: { quality: { letter: "D", start: { text: "Start" }, steps: [{ text: "3 open <issues>" }] }, security: { letter: "A" }, delivery: { letter: "B" } } },
  ],
};
const STATE = { owner: "example-org", repos: { good: roles({ project: "tools", govern: true }), bad: roles({ protect: false }) } };
const SHA = "a".repeat(40);

function fakes(overrides = {}) {
  return {
    owner: OWNER,
    access: overrides.access ?? fakeAccess(),
    storage: { latest: async () => BOARD, log: async () => [{ hash: "a".repeat(64), time: "2026-10-30T10:00:00Z", principal: "github:x/y" }], ...overrides.storage },
    github: {
      state: async () => STATE,
      stateFile: async () => ({ state: STATE, sha: SHA }),
      repositories: async () => ["bad", "good", "unlisted"],
      commits: async () => [
        { sha: "new", message: "Govern good", author: "David", time: "2026-10-30T11:00:00Z" },
        { sha: "old", message: "Seed", author: "David", time: "2026-10-30T09:00:00Z" },
      ],
      ...overrides.github,
    },
  };
}

async function get(handle, path, email = "me@example.org", method = "GET", roles = "release") {
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: email ? { "X-Forwarded-Email": email, "X-Forwarded-Access-Token": roles } : {},
    });
    return { status: response.status, text: await response.text(), headers: response.headers };
  } finally {
    server.close();
  }
}

test("the board groups by project, worst first, and says when there is none", async () => {
  const { status, text } = await get(handler(fakes()), "/");
  assert.equal(status, 200);
  assert.ok(text.indexOf("example-org/bad") < text.indexOf("example-org/good"), "worst first");
  assert.match(text, /<h3>tools<\/h3>/);
  assert.match(text, /private/);
  assert.match(text, /aria-current="page">Board/);
  assert.match((await get(handler(fakes({ storage: { latest: async () => null } })), "/")).text, /No board yet/);
});

test("what a repository says is escaped, everywhere", async () => {
  const { text } = await get(handler(fakes()), "/");
  assert.ok(!text.includes("<b>old</b>") && !text.includes("<issues>"));
  assert.ok(text.includes(escape("3 open <issues>")));
});

test("the state shows each repository's roles", async () => {
  const { text } = await get(handler(fakes()), "/state");
  assert.match(text, /bad<\/td><td>·<\/td><td class="on">on<\/td><td class="off">off<\/td><td class="off">off/);
  assert.match(text, /good<\/td><td>tools<\/td><td class="on">on<\/td><td class="on">on<\/td><td class="on">on/);
});

test("the history shows state changes in words, and the board's snapshots", async () => {
  const states = { new: { owner: "o", repos: { good: roles({ govern: true }) } }, old: { owner: "o", repos: { good: roles() } } };
  const { text } = await get(handler(fakes({ github: { state: async (_, ref) => states[ref] ?? STATE } })), "/history");
  assert.match(text, /good: govern on/);
  assert.match(text, /good added/);
  assert.match(text, /Govern good/);
  assert.match(text, /aaaaaaaaaaaa/);
  assert.ok(!text.includes("a".repeat(13)), "a snapshot's hash is shortened");
});

test("someone without the role gets in nowhere", async () => {
  const handle = handler(fakes());
  for (const [email, roles] of [["stranger@example.org", "opportunity"], ["", "release"]]) {
    const { status, text } = await get(handle, "/state", email, "GET", roles);
    assert.equal(status, 403);
    assert.ok(!text.includes("good"));
  }
});

test("the health check needs no sign-in, and tells nothing", async () => {
  const { status, text } = await get(handler(fakes()), "/healthz", "");
  assert.equal(status, 200);
  assert.equal(text, "ok\n");
});

test("only GET and POST are taken, and an unknown page is not found", async () => {
  assert.equal((await get(handler(fakes()), "/", "me@example.org", "PUT")).status, 405);
  assert.equal((await get(handler(fakes()), "/", "me@example.org", "POST")).status, 404);
  assert.equal((await get(handler(fakes()), "/example-org")).status, 404);
  assert.equal((await get(handler(fakes()), "/nope")).status, 404);
});

test("pages allow no scripts and are not stored", async () => {
  const { headers } = await get(handler(fakes()), "/");
  assert.match(headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(headers.get("cache-control"), "no-store");
});

test("what can't be read is said on the page", async () => {
  const failing = { latest: async () => { throw new Error("storage said 500"); } };
  const { status, text } = await get(handler(fakes({ storage: failing })), "/");
  assert.equal(status, 200);
  assert.match(text, /storage said 500/);
});

test("the page names only this deployment's owner, and reads only its tenant and repository", async () => {
  const asked = [];
  const handle = handler(fakes({
    storage: { latest: async (o) => (asked.push(o), BOARD), log: async (o) => (asked.push(o), []) },
    github: { stateFile: async (o) => (asked.push(o), { state: STATE, sha: "s" }), state: async (o) => (asked.push(o), STATE), commits: async (o) => (asked.push(o), []) },
  }));
  for (const path of ["/", "/state", "/history"]) assert.equal((await get(handle, path)).status, 200);
  assert.ok(asked.length >= 3);
  assert.ok(asked.every((o) => o === OWNER));
});

test("a read is kept for a minute, and a failure isn't kept", async () => {
  let reads = 0;
  let time = 0;
  let fail = true;
  const read = cached(async () => { reads++; if (fail) throw new Error("no"); return reads; }, () => time);
  await assert.rejects(read("a"));
  fail = false;
  assert.equal(await read("a"), 2);
  assert.equal(await read("a"), 2);
  time = 60_000;
  assert.equal(await read("a"), 3);
});

test("a commit's state file is read once, and a failed read is tried again", async () => {
  let reads = 0;
  let fail = true;
  const github = {
    commits: async () => [{ sha: "c1", message: "m", author: "a", time: "t" }],
    state: async () => { reads++; if (fail) throw new Error("no"); return STATE; },
  };
  const history = stateHistory(github);
  await assert.rejects(history(OWNER));
  fail = false;
  await history(OWNER);
  await history(OWNER);
  assert.equal(reads, 2);
});

test("changes says what moved, added and went", () => {
  const before = { repos: { a: roles(), b: roles(), c: roles({ project: "x" }) } };
  const after = { repos: { a: roles({ board: false }), c: roles({ project: "y" }), d: roles() } };
  assert.deepEqual(changes(before, after), ["a: board off", "b removed", "c: project y", "d added"]);
  assert.deepEqual(changes(after, after), []);
  assert.deepEqual(changes({ repos: { a: roles({ project: "x" }) } }, { repos: { a: roles() } }), ["a: project none"]);
});

test("the app's token is a signed JWT GitHub can check", () => {
  const jwt = appJwt("123", privateKey, 1_000_000);
  const [head, body, signature] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url"));
  assert.equal(claims.iss, "123");
  assert.ok(claims.iat < 1000 && claims.exp - claims.iat <= 600);
  assert.ok(createVerify("RSA-SHA256").update(`${head}.${body}`).verify(createPublicKey(privateKey), signature, "base64url"));
});

test("the reader reads as each owner's installation, Contents read only, and keeps its token", async () => {
  const calls = [];
  let time = Date.parse("2026-10-30T10:00:00Z");
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/access_tokens")) {
      return Response.json({ token: `token-${url.match(/installations\/(\d+)/)[1]}`, expires_at: new Date(time + 3_600_000).toISOString() });
    }
    if (url.includes("/commits?")) {
      return Response.json([{ sha: "s", commit: { message: "Title\n\nbody", author: { name: "David", date: "d" } } }]);
    }
    return new Response(JSON.stringify(STATE));
  };
  const github = reader({ appId: "1", appKey: privateKey }, { fetch, now: () => time });
  assert.deepEqual(await github.state(OWNER), STATE);
  await github.state(OWNER);
  assert.equal(calls.filter((c) => c.url.includes("access_tokens")).length, 1, "the token is kept");
  const made = calls.find((c) => c.url.includes("access_tokens"));
  assert.match(made.url, /installations\/11\/access_tokens/);
  assert.deepEqual(JSON.parse(made.init.body), { permissions: { contents: "read" } });
  assert.match(calls.at(-1).url, /repos\/example-org\/release-state\/contents\/state\.json\?ref=main/);
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer token-11");

  assert.deepEqual(await github.commits(OWNER), [{ sha: "s", message: "Title", author: "David", time: "d" }]);
  time += 3_600_000;
  await github.state(OWNER);
  assert.equal(calls.filter((c) => c.url.includes("installations/11")).length, 2, "a token near its end is replaced");
});

test("storage reads the token afresh, names itself, and a missing head is no board", async () => {
  const seen = [];
  let token = "first";
  const fetch = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("release-none")) return new Response("", { status: 404 });
    return url.endsWith("/log") ? Response.json({ log: [{ hash: "h" }] }) : Response.json(BOARD);
  };
  const store = boards({ storageUrl: "https://s", storageTokenFile: "f" }, { fetch, read: async () => `${token}\n` });
  assert.deepEqual(await store.latest({ tenant: "release-x" }), BOARD);
  token = "second";
  assert.deepEqual(await store.log({ tenant: "release-x" }), [{ hash: "h" }]);
  assert.equal(seen[0].url, "https://s/release-x/head/board");
  assert.equal(seen[0].init.headers.Authorization, "Bearer first");
  assert.equal(seen[1].init.headers.Authorization, "Bearer second");
  assert.equal(seen[0].init.headers["User-Agent"], "sustenaut-release-controlplane");
  assert.equal(await store.latest({ tenant: "release-none" }), null);
  assert.deepEqual(await store.log({ tenant: "release-none" }), []);
});

test("storage refusing is an error, not an empty board", async () => {
  const store = boards({ storageUrl: "https://s", storageTokenFile: "f" }, {
    fetch: async () => new Response("", { status: 403 }), read: async () => "t",
  });
  await assert.rejects(store.latest({ tenant: "x" }), /storage said 403/);
});

// A fetch that never answers, until the request's signal gives up. AbortSignal.timeout's
// timer doesn't keep Node running, so this one does, for at most a second.
const silent = async (url, init) => new Promise((_, reject) => {
  const alive = setTimeout(() => reject(new Error("the signal never gave up")), 1000);
  init.signal.addEventListener("abort", () => {
    clearTimeout(alive);
    reject(init.signal.reason);
  });
});

test("storage that doesn't answer in time is an error that says so", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(init.signal);
    return silent(url, init);
  };
  const store = boards({ storageUrl: "https://s", storageTokenFile: "f" }, { fetch, read: async () => "t", timeout: 20 });
  await assert.rejects(store.latest({ tenant: "x" }), /storage didn't answer within 0.02 s/);
  assert.ok(seen[0] instanceof AbortSignal);
  const broken = boards({ storageUrl: "https://s", storageTokenFile: "f" }, { fetch: async () => { throw new TypeError("fetch failed"); }, read: async () => "t" });
  await assert.rejects(broken.latest({ tenant: "x" }), /fetch failed/);
});

test("storage and GitHub get ten seconds by default", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push(init.signal);
    return Response.json({ workflow_runs: [] });
  };
  await boards({ storageUrl: "https://s", storageTokenFile: "f" }, { fetch, read: async () => "t" }).latest({ tenant: "x" });
  await lastRun("o/r/b.yml", { fetch })();
  assert.equal(seen.length, 2);
  for (const signal of seen) assert.ok(signal instanceof AbortSignal && !signal.aborted);
});

test("the config is for one owner, and needs everything", () => {
  const env = { RELEASE_OWNER: "A-org", RELEASE_READER_APP_INSTALLATION_ID: "1", OIDC_CLIENT_ID: "c", OIDC_CLIENT_SECRET: "s", RELEASE_READER_APP_ID: "9", RELEASE_READER_APP_KEY: "k", STORAGE_TOKEN_FILE: "f" };
  const config = configFrom(env);
  assert.deepEqual(config.owner, { name: "A-org", installation: "1", writerInstallation: undefined, tenant: "release-a-org" });
  assert.equal(config.storageUrl, "https://storage.sustenaut.eu");
  assert.equal(config.port, 8080);
  for (const name of Object.keys(env)) {
    assert.throws(() => configFrom({ ...env, [name]: "" }), new RegExp(`${name} is not set`));
  }
  assert.throws(() => configFrom({ ...env, RELEASE_READER_APP_INSTALLATION_ID: "x" }), /must be a number/);
});

test("the board says when it was last checked, apart from when it last changed", async () => {
  const boardRun = async () => ({ time: "2026-10-31T09:13:00Z", conclusion: "success", url: "https://github.com/x/runs/1" });
  const { text } = await get(handler({ ...fakes(), boardRun }), "/");
  assert.match(text, /Last checked <a href="https:\/\/github.com\/x\/runs\/1">2026-10-31T09:13:00Z<\/a>\./);
  assert.match(text, /2 repos: 1 A, 1 D/);
  assert.ok(!text.includes("It ended"));
});

test("a run that didn't pass says so", async () => {
  const boardRun = async () => ({ time: "t", conclusion: "failure", url: "https://u" });
  assert.match((await get(handler({ ...fakes(), boardRun }), "/")).text, /It ended: failure/);
});

test("with no workflow, or GitHub not answering, the board still shows, without that line", async () => {
  assert.ok(!(await get(handler(fakes()), "/")).text.includes("Last checked"));
  const failing = await get(handler({ ...fakes(), boardRun: async () => { throw new Error("GitHub said 403"); } }), "/");
  assert.equal(failing.status, 200);
  assert.ok(!failing.text.includes("Last checked"));
  assert.match(failing.text, /example-org\/good/);
});

test("the last run comes from the workflow named, with no token", async () => {
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return Response.json({ workflow_runs: [{ updated_at: "t", conclusion: "success", html_url: "https://u" }] });
  };
  assert.deepEqual(await lastRun("o/r/board.yml", { fetch })(), { time: "t", conclusion: "success", url: "https://u" });
  assert.equal(seen[0].url, "https://api.github.com/repos/o/r/actions/workflows/board.yml/runs?status=completed&per_page=1");
  assert.equal(seen[0].init.headers.Authorization, undefined);
  assert.equal(await lastRun("o/r/b.yml", { fetch: async () => Response.json({ workflow_runs: [] }) })(), null);
  await assert.rejects(lastRun("o/r/b.yml", { fetch: async () => new Response("", { status: 403 }) })(), /GitHub said 403/);
});

test("GitHub not answering in time for the last run is an error that says so", async () => {
  await assert.rejects(lastRun("o/r/b.yml", { fetch: silent, timeout: 20 })(), /GitHub didn't answer within 0.02 s/);
  await assert.rejects(lastRun("o/r/b.yml", { fetch: async () => { throw new TypeError("fetch failed"); } })(), /fetch failed/);
});

test("reading takes the release role, by its exact name", async () => {
  const seen = async (roles, email = "me@example.org") => (await get(handler(fakes()), "/", email, "GET", roles)).status;
  assert.equal(await seen("release"), 200);
  assert.equal(await seen("opportunity,release"), 200);
  assert.equal(await seen("opportunity"), 403);
  assert.equal(await seen("controller"), 403);
  assert.equal(await seen("role:release"), 403);
  assert.equal(await seen("released"), 403);
});

function keycloakAnswers(answers, now = Date.now) {
  return accessCheck({
    realmUrl: "https://auth.test/r", clientId: "c", clientSecret: "s", role: "release", now,
    request: async (url) => {
      const { status, body } = answers(url);
      if (status === 0) throw new Error("connection refused");
      return { status, ok: status === 200, json: async () => body };
    },
  });
}

test("the page's answer to a sign-in that has ended: a read goes to sign in, a change is refused", async () => {
  const access = keycloakAnswers((url) => (url.endsWith("access-state") ? { status: 200, body: { hash: "h" } } : { status: 401, body: {} }));
  const handle = handler(fakes({ access }));
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "X-Forwarded-Email": "me@example.org", "X-Forwarded-Access-Token": "t" };
  try {
    const read = await fetch(`${base}/state`, { headers, redirect: "manual" });
    assert.equal(read.status, 302);
    assert.equal(read.headers.get("location"), "/oauth2/start?rd=%2Fstate");
    const change = await fetch(`${base}/state`, { method: "POST", headers, redirect: "manual" });
    assert.equal(change.status, 403);
    assert.match(await change.text(), /nothing was saved/);
  } finally {
    server.close();
  }
});

test("with Keycloak down someone vouched for reads, without a form; anyone else gets a 503", async () => {
  let down = false;
  let time = 0;
  const access = keycloakAnswers((url) => {
    if (down) return { status: 0 };
    return url.endsWith("access-state") ? { status: 200, body: { hash: "h" } } : { status: 200, body: { access: ["release", "controller"] } };
  }, () => time);
  const handle = handler({ ...fakes({ access }), save: { save: async () => { throw new Error("no save"); } } });
  const owner = { ...OWNER, writerInstallation: "3" };
  const withWriter = handler({ ...fakes({ access }), owner, save: { save: async () => { throw new Error("no save"); } } });
  assert.match((await get(withWriter, "/state", "me@example.org", "GET", "t")).text, /<form/);
  down = true;
  time += 2_000;
  const { status, text } = await get(withWriter, "/state", "me@example.org", "GET", "t");
  assert.equal(status, 200);
  assert.doesNotMatch(text, /<form/);
  assert.equal((await get(withWriter, "/state", "me@example.org", "POST", "t")).status, 503);
  assert.equal((await get(handle, "/state", "other@example.org", "GET", "t")).status, 503);
});

test("with an email list the config needs no sign-in client", () => {
  const env = { RELEASE_OWNER: "a", RELEASE_READER_APP_INSTALLATION_ID: "1", ALLOWED_EMAILS: " Me@x.org, ", RELEASE_READER_APP_ID: "9", RELEASE_READER_APP_KEY: "k", STORAGE_TOKEN_FILE: "f" };
  const config = configFrom(env);
  assert.deepEqual(config.allowedEmails, ["me@x.org"]);
  assert.equal(config.clientId, undefined);
  assert.throws(() => configFrom({ ...env, ALLOWED_EMAILS: "" }), /OIDC_CLIENT_ID is not set/);
});
