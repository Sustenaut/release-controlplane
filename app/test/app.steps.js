// The pages, with GitHub and storage answered here: by stand-ins for the app's readers,
// or by pubtest's fake services where the code under test makes the calls itself.
import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { cached, readiness, stateHistory } from "../server.js";
import { appJwt, reader } from "../github.js";
import { boards } from "../storage.js";
import { lastRun } from "../runs.js";
import { callLog, caller as defaultCaller } from "../calls.js";
import { changes } from "../history.js";
import { configFrom } from "../config.js";
import { accessCheck } from "../access.js";
import { fakeAccess } from "./fake-access.js";
import { calling, count, routed } from "./features/support.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" },
});
const OWNER = { name: "example-org", installation: "11", tenant: "release-example-org" };
const roles = (o) => ({ board: true, protect: true, govern: false, ...o });
const BOARD = {
  summary: "2 repos: 1 A, 1 D.",
  problems: [],
  repos: [
    { repo: "example-org/good", kind: "package", released: "v1.0.0", pubrules: "0.23.2", overall: "A", project: "tools", visibility: "public",
      grades: { quality: { letter: "A", start: { text: "SonarQube Cloud: A" }, steps: [] }, security: { letter: "A" }, delivery: { letter: "A" } } },
    { repo: "example-org/bad", kind: "service", released: "-", pubrules: "<b>old</b>", overall: "D", project: "tools", visibility: "private",
      grades: { quality: { letter: "D", start: { text: "Start" }, steps: [{ text: "3 open <issues>" }] }, security: { letter: "A" }, delivery: { letter: "B" } } },
  ],
};
const STATE = { owner: "example-org", repos: { good: roles({ project: "tools", govern: true }), bad: roles({ protect: false }) } };
const SHA = "a".repeat(40);

// The site's readers, as the app's handler takes them.
Given("the site of {string}, whose board shows a good and a bad repository", function (owner) {
  assert.equal(owner, OWNER.name);
  this.site = {
    owner: OWNER,
    access: fakeAccess(),
    storage: { latest: async () => BOARD, log: async () => [{ hash: "a".repeat(64), time: "2026-10-30T10:00:00Z", principal: "github:x/y" }] },
    github: {
      state: async () => STATE,
      stateFile: async () => ({ state: STATE, sha: SHA }),
      repositories: async () => ["bad", "good", "unlisted"],
      commits: async () => [
        { sha: "new", message: "Govern good", author: "David", time: "2026-10-30T11:00:00Z" },
        { sha: "old", message: "Seed", author: "David", time: "2026-10-30T09:00:00Z" },
      ],
    },
  };
});

Given("the board isn't there yet", function () {
  this.site.storage.latest = async () => null;
});

Given("storage fails, saying {string}", function (said) {
  this.site.storage.latest = async () => { throw new Error(said); };
});

Given("the state's history has a commit governing good, after one adding it", function () {
  const states = { new: { owner: "o", repos: { good: roles({ govern: true }) } }, old: { owner: "o", repos: { good: roles() } } };
  this.site.github.state = async (_, ref) => states[ref] ?? STATE;
});

Given("the app isn't ready, saying {string}", function (problem) {
  this.site.ready = async () => problem;
});

Given("every read is recorded", function () {
  this.asked = [];
  for (const reads of [this.site.storage, this.site.github]) {
    for (const [name, read] of Object.entries(reads)) reads[name] = async (owner, ...rest) => (this.asked.push(owner), read(owner, ...rest));
  }
});

Then("every read asked for this deployment's owner", function () {
  assert.ok(this.asked.length >= 1, "nothing was read");
  assert.ok(this.asked.every((o) => o === OWNER), `a read asked for ${JSON.stringify(this.asked)}`);
});

Given("the board's workflow last ran at {string}, ending in {string}, its page {string}", function (time, conclusion, url) {
  this.site.boardRun = async () => ({ time, conclusion, url });
});

Given("the board's workflow can't be read, GitHub saying {string}", function (said) {
  this.site.boardRun = async () => { throw new Error(said); };
});

Given("the owner has a writer", function () {
  this.site.owner = { ...OWNER, writerInstallation: "3" };
  this.site.save = { save: async () => { throw new Error("no save"); } };
});

// Keycloak answered here: the hash, and userinfo as given; a token is only a token.
function keycloakAnswers(world, answers) {
  return accessCheck({
    realmUrl: "https://auth.test/r", clientId: "c", clientSecret: "s", role: "release", now: () => world.time,
    request: async (url) => {
      const { status, body } = world.keycloakDown ? { status: 0 } : answers(url);
      if (status === 0) throw new Error("connection refused");
      return { status, ok: status === 200, json: async () => body };
    },
  });
}

Given("Keycloak says my sign-in has ended", function () {
  this.site.access = keycloakAnswers(this, (url) => (url.endsWith("access-state") ? { status: 200, body: { hash: "h" } } : { status: 401, body: {} }));
});

Given("the site asks Keycloak, which grants {string}", function (granted) {
  this.site.access = keycloakAnswers(this, (url) => (url.endsWith("access-state") ? { status: 200, body: { hash: "h" } } : { status: 200, body: { access: granted.split(",") } }));
});

// Readiness, a read kept for a while, and the state history, each on stand-ins that fail
// until the failure ends, and count their calls.
Given("a readiness check that fails, saying {string}", function (problem) {
  this.failing = true;
  this.ready = readiness(async () => {
    count(this, "the readiness check");
    if (this.failing) throw new Error(problem);
  }, () => this.time);
});

Given("the failure ends", function () {
  this.failing = false;
});

Given("readiness was asked", async function () {
  await this.ready();
});

When("readiness is asked", async function () {
  await this.attempt(() => this.ready());
});

Given("a read, kept for a minute, that fails at first", function () {
  this.failing = true;
  // What it reads is how many reads there have been.
  this.read = cached(async () => {
    count(this, "the read");
    if (this.failing) throw new Error("no");
    return this.calls["the read"];
  }, () => this.time);
});

Given("the read was asked for {string}", async function (key) {
  await this.read(key).catch(() => null);
});

When("the read is asked for {string}", async function (key) {
  await this.attempt(() => this.read(key));
});

Given("a state history whose reads of a state fail at first", function () {
  this.failing = true;
  this.history = stateHistory({
    commits: async () => [{ sha: "c1", message: "m", author: "a", time: "t" }],
    state: async () => {
      count(this, "the state read");
      if (this.failing) throw new Error("no");
      return STATE;
    },
  });
});

Given("the state history was read", async function () {
  await this.history(OWNER).catch(() => null);
});

When("the state history is read", async function () {
  await this.attempt(() => this.history(OWNER));
});

Given("the state before:", function (doc) {
  this.before = JSON.parse(doc);
});

Given("the state after:", function (doc) {
  this.after = JSON.parse(doc);
});

When("the changes from one to the other are listed", async function () {
  await this.attempt(() => changes(this.before, this.after));
});

When("the app {string} makes its token at {int} seconds past the epoch", async function (app, seconds) {
  await this.attempt(() => appJwt(app, privateKey, seconds * 1000));
});

Then("the result is a JWT signed with the app's key, claiming:", function (doc) {
  const [head, body, signature] = String(this.pubtest.result).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(body, "base64url")), JSON.parse(doc));
  assert.ok(createVerify("RSA-SHA256").update(`${head}.${body}`).verify(createPublicKey(privateKey), signature, "base64url"), "the signature doesn't check");
});

// The reader app, with GitHub's API answered by a fake service.
Given("the time is {string}", function (time) {
  this.time = Date.parse(time);
});

Given("the reader app, asking the {string} service for GitHub", function (name) {
  this.reader = reader({ appId: "1", appKey: privateKey }, { caller: calling(this, name, "https://api.github.com"), now: () => this.time });
});

Given("the reader has read the state", async function () {
  await this.reader.state(this.site.owner);
});

When("the reader reads the state", async function () {
  await this.attempt(() => this.reader.state(this.site.owner));
});

When("the reader reads the state file", async function () {
  await this.attempt(() => this.reader.stateFile(this.site.owner));
});

When("the reader reads the commits", async function () {
  await this.attempt(() => this.reader.commits(this.site.owner));
});

When("the reader lists the repositories", async function () {
  await this.attempt(() => this.reader.repositories(this.site.owner));
});

Given("the board store, asking the {string} service for storage, with the token {string}", function (name, token) {
  this.token = token;
  this.store = boards({ storageUrl: "https://storage.test", storageTokenFile: "f" }, { caller: calling(this, name, "https://storage.test"), readFile: async () => `${this.token}\n` });
});

Given("the storage token becomes {string}", function (token) {
  this.token = token;
});

Given("storage never answers in time", function () {
  this.fetching = async (url, init) => {
    count(this, "storage");
    (this.signals.storage ??= []).push(init.signal);
    throw new DOMException("The operation timed out.", "TimeoutError");
  };
});

Given("the board of {string} was read", async function (tenant) {
  await this.store.latest({ tenant });
});

When("the board of {string} is read", async function (tenant) {
  await this.attempt(() => this.store.latest({ tenant }));
});

When("the board's log of {string} is read", async function (tenant) {
  await this.attempt(() => this.store.log({ tenant }));
});

Given("the call log of the sender {string}, sending to the {string} service with the token file {string}", function (sender, name, file) {
  this.callSink = callLog({ storageUrl: "https://storage.test", storageTokenFile: file }, {
    sender, start: false, fetch: routed(this, name, "https://storage.test"), readFile: async (path) => `token from ${path}\n`,
  });
  this.store = boards({ storageUrl: "https://storage.test", storageTokenFile: "f" }, {
    caller: defaultCaller({ fetch: routed(this, name, "https://storage.test"), sink: this.callSink }), readFile: async () => "t",
  });
});

When("the board of {string} is read, and the call log sent", async function (tenant) {
  await this.attempt(async () => {
    await this.store.latest({ tenant });
    await this.callSink.flush();
  });
});

When("the call log is made for the sender {string}", async function (sender) {
  await this.attempt(() => callLog({ storageUrl: "https://storage.test", storageTokenFile: "/token" }, { sender, start: false }));
});

When("the app's caller is made", async function () {
  await this.attempt(() => defaultCaller());
});

// The app's settings, as its environment gives them.
Given("the settings:", function (table) {
  this.settings = Object.fromEntries(table.raw());
});

Given("the setting {string} is empty", function (name) {
  this.settings[name] = "";
});

Given("the setting {string} is {string}", function (name, value) {
  this.settings[name] = value;
});

Given("the setting {string} is not set", function (name) {
  delete this.settings[name];
});

When("the config is read", async function () {
  await this.attempt(() => configFrom(this.settings));
});

Given("the last run read from the workflow {string}, asking the {string} service for GitHub", function (workflow, name) {
  this.lastRun = lastRun(workflow, { caller: calling(this, name, "https://api.github.com") });
});

Given("GitHub doesn't answer, the connection failing", function () {
  this.fetching = async () => { throw new TypeError("fetch failed"); };
});

Given("the last run read from the workflow {string} by a caller that doesn't know the operation", function (workflow) {
  this.lastRun = lastRun(workflow, { caller: { call: async () => { throw new RangeError("not registered"); } } });
});

When("the last run is read", async function () {
  await this.attempt(() => this.lastRun());
});

Then("the caller waited {string} seconds between its tries", function (waits) {
  assert.equal(this.naps.join(", "), waits);
});
