// An operator changing the state, with the pull request written to memory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { fakePublisher } from "pubpr/fake";
import { handler } from "../server.js";
import { FormError, labelsOf, noteFrom, shaFrom, stateFrom } from "../forms.js";
import { stateText, writer } from "../writer.js";
import { reader } from "../github.js";
import { configFrom } from "../config.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" },
});
const OWNER = { name: "example-org", installation: "11", writerInstallation: "33", tenant: "t" };
const READ_ONLY = { name: "someone", installation: "22", tenant: "u" };
const roles = (o) => ({ board: true, protect: true, govern: false, ...o });
const STATE = { owner: "example-org", repos: { good: roles({ project: "tools" }), bad: roles() } };
const SHA = "a".repeat(40);
const COMMIT = "c".repeat(40);
const OLD = { owner: "example-org", repos: { good: roles() } };

function app(overrides = {}) {
  const saved = [];
  const answers = { status: "opened", url: "https://github.com/x/pull/1", autoMerge: "on", ...overrides.answer };
  let reads = 0;
  const handle = handler({
    owner: overrides.owner ?? OWNER,
    team: ["op@x.org", "reader@x.org"],
    operators: ["op@x.org"],
    storage: { latest: async () => null, log: async () => [] },
    github: {
      stateFile: async () => { reads++; return { state: STATE, sha: SHA }; },
      state: async (_, ref) => (ref === COMMIT ? OLD : STATE),
      repositories: async () => ["bad", "good", "unlisted"],
      commits: async () => [{ sha: "d".repeat(40), message: "New", author: "a", time: "t" }, { sha: COMMIT, message: "Old", author: "a", time: "t" }],
    },
    save: overrides.noSave ? null : { save: async (owner, change) => { saved.push({ owner, ...change }); return answers; } },
  });
  return { handle, saved, reads: () => reads };
}

async function call(handle, path, { email = "op@x.org", method = "GET", body, origin = "same" } = {}) {
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = { "X-Forwarded-Email": email };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (origin) headers.Origin = origin === "same" ? base : origin;
    const response = await fetch(base + path, { method, headers, body });
    return { status: response.status, text: await response.text() };
  } finally {
    server.close();
  }
}

const form = (fields) => new URLSearchParams(fields).toString();
const SAVE = form([["base", SHA], ["note", "Govern good"], ["repo", "good"], ["good.board", "on"], ["good.protect", "on"], ["good.govern", "on"], ["good.project", "tools"], ["repo", "bad"], ["bad.board", "on"], ["bad.protect", "on"]]);
const post = (handle, path, options) => call(handle, path, { method: "POST", ...options });

test("an operator's state page is a form, with the repositories not in the state in grey", async () => {
  const { text } = await call(app().handle, "/state");
  assert.match(text, /<form method="post" action="\/state">/);
  assert.ok(text.includes(`name="base" value="${SHA}"`));
  assert.match(text, /name="good.govern"/);
  assert.match(text, /class="absent"[^]*unlisted/);
  assert.match(text, /name="note" required/);
});

test("someone not an operator sees no form, and an owner with no writer has none either", async () => {
  const { text } = await call(app().handle, "/state", { email: "reader@x.org" });
  assert.ok(!text.includes("<form"));
  assert.ok(!text.includes("unlisted"));
  assert.ok(!(await call(app({ owner: READ_ONLY }).handle, "/state")).text.includes("<form"));
  assert.ok(!(await call(app({ noSave: true }).handle, "/state")).text.includes("<form"));
});

test("a save opens a pull request with the new state, the note and who asked", async () => {
  const { handle, saved } = app();
  const { status, text } = await post(handle, "/state", { body: SAVE });
  assert.equal(status, 200);
  assert.match(text, /merges by itself/);
  assert.match(text, /github.com\/x\/pull\/1/);
  assert.equal(saved[0].owner.name, "example-org");
  assert.equal(saved[0].note, "Govern good");
  assert.equal(saved[0].who, "op@x.org");
  assert.equal(saved[0].sha, SHA);
  assert.equal(saved[0].state.repos.good.govern, true);
  assert.equal(saved[0].state.owner, "example-org");
});

test("what GitHub answered is said plainly", async () => {
  for (const [answer, status, words] of [
    [{ status: "nothing to change" }, 200, /already says this/],
    [{ status: "stale", path: "state.json" }, 409, /changed while you were looking/],
    [{ autoMerge: "merged" }, 200, /It has merged/],
    [{ autoMerge: "not allowed" }, 200, /GitHub said: not allowed/],
  ]) {
    const result = await post(app({ answer }).handle, "/state", { body: SAVE });
    assert.equal(result.status, status);
    assert.match(result.text, words);
  }
});

test("only an operator may save, and only from this site", async () => {
  const { handle, saved } = app();
  assert.equal((await post(handle, "/state", { email: "reader@x.org", body: SAVE })).status, 403);
  assert.equal((await post(handle, "/state", { email: "stranger@x.org", body: SAVE })).status, 403);
  assert.equal((await post(handle, "/state", { origin: "https://evil.example", body: SAVE })).status, 403);
  assert.equal((await post(handle, "/state", { origin: null, body: SAVE })).status, 403);
  assert.equal((await post(app({ owner: READ_ONLY }).handle, "/state", { body: SAVE })).status, 403, "no writer for this owner");
  assert.equal((await post(handle, "/other", { body: SAVE })).status, 404);
  assert.equal((await post(app({ noSave: true }).handle, "/state", { body: SAVE })).status, 403);
  assert.deepEqual(saved, []);
});

test("a bad form says why, and saves nothing", async () => {
  const { handle, saved } = app();
  const bad = async (fields, words) => {
    const { status, text } = await post(handle, "/state", { body: form(fields) });
    assert.equal(status, 400);
    assert.match(text, words);
  };
  await bad([["base", SHA]], /needs a note/);
  await bad([["base", SHA], ["note", "   "]], /needs a note/);
  await bad([["base", SHA], ["note", "x".repeat(201)]], /at most 200/);
  await bad([["note", "n"]], /Reload the page/);
  await bad([["base", "nope"], ["note", "n"]], /Reload the page/);
  await bad([["base", SHA], ["note", "n"], ["repo", "stranger"]], /isn&#39;t a repository/);
  await bad([["base", SHA], ["note", "n"], ["repo", "good"], ["good.project", "typo"]], /isn&#39;t one of the labels/);
  await bad([["base", SHA], ["note", "n"], ["repo", "good"], ["good.project", "__new__"]], /none is given/);
  await bad([["base", SHA], ["note", "n"], ["new-label", "Bad Label"], ["repo", "good"], ["good.project", "__new__"]], /A label is lower case/);
  await bad([["base", SHA], ["note", "n"], ["new-label", "spare"], ["repo", "good"], ["good.project", "tools"]], /wouldn&#39;t be kept/);
  assert.deepEqual(saved, []);
});

test("a form too large is refused", async () => {
  const { handle, saved } = app();
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const answered = await fetch(`${base}/state`, {
      method: "POST", headers: { "X-Forwarded-Email": "op@x.org", Origin: base }, body: "x".repeat(300 * 1024),
    }).then((r) => r.status, () => "closed");
    assert.ok(answered === 400 || answered === "closed");
    assert.deepEqual(saved, []);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});

test("a failure saving is said, not thrown", async () => {
  const handle = handler({
    owner: OWNER, team: ["op@x.org"], operators: ["op@x.org"], storage: {},
    github: { stateFile: async () => ({ state: STATE, sha: SHA }), repositories: async () => ["good", "bad"] },
    save: { save: async () => { throw new Error("GitHub said 500"); } },
  });
  const { status, text } = await post(handle, "/state", { body: SAVE });
  assert.equal(status, 502);
  assert.match(text, /GitHub said 500/);
});

test("a save reads the state afresh, and doesn't show the old one after", async () => {
  const { handle, reads } = app();
  await call(handle, "/state");
  const before = reads();
  await post(handle, "/state", { body: SAVE });
  assert.equal(reads(), before + 1);
  await call(handle, "/state");
  assert.equal(reads(), before + 2);
});

test("history offers going back to any but the newest, and reverting saves the old file", async () => {
  const { handle, saved } = app();
  const page = await call(handle, "/history");
  assert.ok(page.text.includes(`/state/revert/${COMMIT}`));
  assert.ok(!page.text.includes(`/revert/${"d".repeat(40)}`));
  const reader_ = await call(handle, "/history", { email: "reader@x.org" });
  assert.ok(!reader_.text.includes("revert"));
  const { status } = await post(handle, `/state/revert/${COMMIT}`, { body: form([["base", SHA], ["note", "Undo it"]]) });
  assert.equal(status, 200);
  assert.deepEqual(saved[0].state, OLD);
  assert.equal(saved[0].note, "Undo it");
});

test("the state page offers the labels in use, the current one chosen, and a new one", async () => {
  const { text } = await call(app().handle, "/state");
  assert.match(text, /<select name="good.project"[^>]*><option value="">None<\/option><option value="tools" selected>tools<\/option><option value="__new__">New label…/);
  assert.match(text, /<select name="bad.project"[^>]*><option value="" selected>None/);
  assert.match(text, /<select name="unlisted.project"/);
  assert.match(text, /name="new-label"/);
});

test("a new label goes to each repository set to it, and then is one of the labels", () => {
  const f = new URLSearchParams(form([["new-label", "shiny"], ["repo", "good"], ["good.board", "on"], ["good.project", "__new__"], ["repo", "bad"], ["bad.board", "on"], ["bad.project", "__new__"]]));
  const made = stateFrom(f, STATE, []);
  assert.equal(made.repos.good.project, "shiny");
  assert.equal(made.repos.bad.project, "shiny");
  assert.deepEqual(labelsOf(made), ["shiny"]);
  assert.deepEqual(labelsOf(STATE), ["tools"]);
});

test("stateFrom keeps what the form doesn't name, adds on a role, and drops a project", () => {
  const f = new URLSearchParams(form([["new-label", "pub"], ["repo", "good"], ["good.board", "on"], ["repo", "unlisted"], ["repo", "more"], ["more.govern", "on"], ["more.project", "__new__"]]));
  const made = stateFrom(f, STATE, ["good", "bad", "unlisted", "more"]);
  assert.deepEqual(made.repos.bad, STATE.repos.bad, "not in the form");
  assert.deepEqual(made.repos.good, { board: true, protect: false, govern: false }, "project emptied");
  assert.equal(made.repos.unlisted, undefined, "no role, so it doesn't join");
  assert.deepEqual(made.repos.more, { project: "pub", board: false, protect: false, govern: true });
});

test("a repository in the state stays even with every role off", () => {
  const made = stateFrom(new URLSearchParams("repo=good"), STATE, []);
  assert.deepEqual(made.repos.good, { board: false, protect: false, govern: false });
});

test("form checks throw FormError", () => {
  assert.throws(() => noteFrom(new URLSearchParams()), FormError);
  assert.throws(() => shaFrom(new URLSearchParams("base=zz")), FormError);
  assert.equal(noteFrom(new URLSearchParams("note=a%0Ab")), "a b");
});

test("the file is stable: sorted, indented, ending in a newline", () => {
  assert.equal(stateText({ owner: "o", repos: { b: { board: true }, a: { board: false } } }),
    '{\n  "owner": "o",\n  "repos": {\n    "a": {\n      "board": false\n    },\n    "b": {\n      "board": true\n    }\n  }\n}\n');
});

test("the writer proposes one file, expecting what was read, merging itself, with its own token", async () => {
  const fake = fakePublisher();
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url, body: init.body });
    return Response.json({ token: "w", expires_at: "2030-01-01T00:00:00Z" });
  };
  let token;
  const propose = (o) => { token = o.token; return fake.propose(o); };
  const save = writer({ writerId: "9", writerKey: privateKey }, { propose, fetch, now: () => Date.parse("2026-10-30T10:00:00Z") });
  const answer = await save.save(OWNER, { state: STATE, sha: SHA, note: "Why", who: "op@x.org" });
  assert.equal(answer.autoMerge, "on");
  const p = fake.proposals[0];
  assert.equal(p.repo, "example-org/release-state");
  assert.equal(p.base, "main");
  assert.match(p.branch, /^state\/20261030100000-[0-9a-f]{6}$/);
  assert.equal(p.title, "Why");
  assert.match(p.body, /op@x\.org/);
  assert.match(p.message, /Requested-by: op@x\.org\n$/);
  assert.deepEqual(p.expect, { "state.json": SHA });
  assert.equal(p.autoMerge, true);
  assert.equal(p.changes["state.json"], stateText(STATE));
  assert.equal(await token(), "w");
  assert.match(asked[0].url, /installations\/33\/access_tokens/);
  assert.deepEqual(JSON.parse(asked[0].body), { permissions: { contents: "write", pull_requests: "write" } });
});

test("the reader reads the file with its sha, and lists every page of repositories", async () => {
  const pages = { 1: Array.from({ length: 100 }, (_, i) => ({ name: `r${i}` })), 2: [{ name: "last" }] };
  const fetch = async (url) => {
    if (url.includes("access_tokens")) return Response.json({ token: "t", expires_at: "2030-01-01T00:00:00Z" });
    if (url.includes("/installation/repositories")) return Response.json({ repositories: pages[new URL(url).searchParams.get("page")] });
    return Response.json({ sha: SHA, content: Buffer.from(JSON.stringify(STATE)).toString("base64") });
  };
  const github = reader({ appId: "1", appKey: privateKey }, { fetch });
  assert.deepEqual(await github.stateFile(OWNER), { state: STATE, sha: SHA });
  const names = await github.repositories(OWNER);
  assert.equal(names.length, 101);
  assert.ok(names.includes("last"));
});

test("the config takes a writer installation, and operators", () => {
  const env = { RELEASE_OWNER: "a", RELEASE_READER_APP_INSTALLATION_ID: "1", RELEASE_STATE_WRITER_INSTALLATION_ID: "2", TEAM: "t@x.org", RELEASE_READER_APP_ID: "9", RELEASE_READER_APP_KEY: "k", STORAGE_TOKEN_FILE: "f", OPERATORS: "OP@x.org", RELEASE_STATE_WRITER_APP_ID: "8", RELEASE_STATE_WRITER_APP_KEY: "w" };
  const config = configFrom(env);
  assert.equal(config.owner.writerInstallation, "2");
  assert.deepEqual(config.operators, ["op@x.org"]);
  assert.equal(config.writerId, "8");
  assert.deepEqual(configFrom({ ...env, OPERATORS: undefined }).operators, []);
  assert.equal(configFrom({ ...env, RELEASE_STATE_WRITER_INSTALLATION_ID: undefined }).owner.writerInstallation, undefined);
  assert.throws(() => configFrom({ ...env, RELEASE_STATE_WRITER_INSTALLATION_ID: "x" }), /must be a number/);
});
