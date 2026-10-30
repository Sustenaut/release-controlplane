// The pages, with GitHub and storage answered here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, createVerify } from "node:crypto";
import { createServer } from "node:http";
import { cached, handler, stateHistory } from "../server.js";
import { appJwt, reader } from "../github.js";
import { boards } from "../storage.js";
import { changes } from "../history.js";
import { configFrom } from "../config.js";
import { escape } from "../render.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" },
});
const OWNERS = [
  { name: "example-org", installation: "11", tenant: "release-example-org" },
  { name: "someone", installation: "22", tenant: "release-someone" },
];
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
    owners: OWNERS,
    team: ["me@example.org"],
    storage: { latest: async (o) => (o.name === "example-org" ? BOARD : null), log: async () => [{ hash: "a".repeat(64), time: "2026-10-30T10:00:00Z", principal: "github:x/y" }], ...overrides.storage },
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

async function get(handle, path, email = "me@example.org", method = "GET") {
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: email ? { "X-Forwarded-Email": email } : {},
    });
    return { status: response.status, text: await response.text(), headers: response.headers };
  } finally {
    server.close();
  }
}

test("the board shows each owner, grouped by project, worst first, and says when there is none", async () => {
  const { status, text } = await get(handler(fakes()), "/");
  assert.equal(status, 200);
  assert.ok(text.indexOf("example-org/bad") < text.indexOf("example-org/good"), "worst first");
  assert.match(text, /<h3>tools<\/h3>/);
  assert.match(text, /private/);
  assert.match(text, /No board yet/);
  assert.match(text, /aria-current="page">Board/);
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

test("only the team gets in, and the check ignores case and fails closed", async () => {
  const handle = handler(fakes());
  assert.equal((await get(handle, "/", "ME@example.org")).status, 200);
  for (const email of ["stranger@example.org", ""]) {
    const { status, text } = await get(handle, "/state", email);
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
  assert.equal((await get(handler(fakes()), "/nope")).status, 404);
});

test("pages allow no scripts and are not stored", async () => {
  const { headers } = await get(handler(fakes()), "/");
  assert.match(headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(headers.get("cache-control"), "no-store");
});

test("one owner failing shows on its part of the page only", async () => {
  const failing = { latest: async (o) => { if (o.name === "someone") throw new Error("storage said 500"); return BOARD; } };
  const { status, text } = await get(handler(fakes({ storage: failing })), "/");
  assert.equal(status, 200);
  assert.match(text, /storage said 500/);
  assert.match(text, /example-org\/good/);
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
  await assert.rejects(history(OWNERS[0]));
  fail = false;
  await history(OWNERS[0]);
  await history(OWNERS[0]);
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
  assert.deepEqual(await github.state(OWNERS[0]), STATE);
  await github.state(OWNERS[0]);
  assert.equal(calls.filter((c) => c.url.includes("access_tokens")).length, 1, "the token is kept");
  const made = calls.find((c) => c.url.includes("access_tokens"));
  assert.match(made.url, /installations\/11\/access_tokens/);
  assert.deepEqual(JSON.parse(made.init.body), { permissions: { contents: "read" } });
  assert.match(calls.at(-1).url, /repos\/example-org\/release-state\/contents\/state\.json\?ref=main/);
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer token-11");

  assert.deepEqual(await github.commits(OWNERS[1]), [{ sha: "s", message: "Title", author: "David", time: "d" }]);
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer token-22");
  time += 3_600_000;
  await github.state(OWNERS[0]);
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

test("the config needs everything, and reads the owners", () => {
  const env = { RELEASE_OWNERS: "A-org:1, b:22", TEAM: "ME@x.org, you@x.org", RELEASE_READER_APP_ID: "9", RELEASE_READER_APP_KEY: "k", STORAGE_TOKEN_FILE: "f" };
  const config = configFrom(env);
  assert.deepEqual(config.owners[0], { name: "A-org", installation: "1", writerInstallation: undefined, tenant: "release-a-org" });
  assert.equal(config.owners[1].installation, "22");
  assert.deepEqual(config.team, ["me@x.org", "you@x.org"]);
  assert.equal(config.storageUrl, "https://storage.sustenaut.eu");
  assert.equal(config.port, 8080);
  for (const name of Object.keys(env)) {
    assert.throws(() => configFrom({ ...env, [name]: "" }), new RegExp(`${name} is not set`));
  }
  assert.throws(() => configFrom({ ...env, RELEASE_OWNERS: "A-org" }), /owner:reader-installation-id/);
});
