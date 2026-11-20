// An operator changing the state: the site saves through pubtest's fake "writer"
// service, so what it asked to save is what that service was sent.
import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { fakePublisher } from "pubpr/fake";
import { same } from "@sustenaut/pubtest";
import { labelsOf, noteFrom, shaFrom, stateFrom } from "../forms.js";
import { stateText, writer } from "../writer.js";
import { fakeAccess } from "./fake-access.js";
import { calling, send } from "./features/support.js";

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

// A save is sent to the fake service as { owner, state, sha, note, who }, and what it
// answers is the pull request's answer; a failure is its text.
const throughWriter = {
  save: async (owner, change) => {
    const response = await fetch(`${process.env.WRITER_URL}/save`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: owner.name, ...change }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text);
    return JSON.parse(text);
  },
};

Given("the site of {string}, saving its state through the {string} service", function (owner, name) {
  assert.equal(owner, OWNER.name);
  assert.equal(name, "writer");
  let board = null;
  const site = {
    owner: OWNER,
    access: fakeAccess(),
    storage: { latest: async () => board, log: async () => [] },
    github: {
      stateFile: async () => {
        this.calls["the state file"] = (this.calls["the state file"] ?? 0) + 1;
        return { state: this.state ?? STATE, sha: SHA };
      },
      state: async (_, ref) => (ref === COMMIT ? OLD : STATE),
      repositories: async () => ["bad", "good", "unlisted"],
      commits: async () => [{ sha: "d".repeat(40), message: "New", author: "a", time: "t" }, { sha: COMMIT, message: "Old", author: "a", time: "t" }],
    },
    save: throughWriter,
  };
  this.site = site;
  this.showBoard = (b) => { board = b; };
});

Given("the owner has no writer", function () {
  this.site.owner = READ_ONLY;
});

Given("the site can't save", function () {
  this.site.save = null;
});

const secretsOff = (repo) => ({ repo, kind: "package", overall: "B", grades: { security: { letter: "B", steps: [
  { text: "push protection off", delta: -1, facts: ["secret_protection"] }] } } });

Given("the board shows push protection off for good and bad", function () {
  this.showBoard({ summary: "s", repos: [secretsOff("example-org/good"), secretsOff("example-org/bad")] });
});

Given("the board shows bad's secret scanning settings as not available", function () {
  this.showBoard({ summary: "s", repos: [{ repo: "example-org/bad", kind: "package", overall: "A", grades: { security: { letter: "A", steps: [
    { text: "Secret scanning settings: not available", delta: 0, facts: ["secret_protection"] }] } } }] });
});

Given("the state on main is:", function (doc) {
  this.state = JSON.parse(doc);
});

When("the state is made from the form, with {string} visible, and its repositories are listed:", async function (visible, table) {
  const form = new URLSearchParams(table.raw());
  await this.attempt(() => Object.keys(stateFrom(form, STATE, visible.split(",")).repos));
});

When("the state on main is made from the form, and the keys of {string} are listed:", async function (name, table) {
  const form = new URLSearchParams(table.raw());
  await this.attempt(() => Object.keys(stateFrom(form, this.state, []).repos[name]));
});

Given("the state protects good, but not bad", function () {
  this.state = { owner: "example-org", repos: { good: roles({ project: "tools" }), bad: roles({ protect: false }) } };
});

Given("I have saved a change to the state", async function () {
  const body = new URLSearchParams([["base", SHA], ["note", "Govern good"], ["repo", "good"], ["good.board", "on"]]).toString();
  const answer = await send(this, "POST", "/state", { ...this.pubtest.headers, "content-type": "application/x-www-form-urlencoded" }, body);
  assert.equal(answer.status, 200, answer.text);
});

When("I POST a form of {int} KB to {string}", async function (size, path) {
  await this.attempt(async () => {
    this.pubtest.answer = await send(this, "POST", path, this.pubtest.headers, "x".repeat(size * 1024));
    return this.pubtest.answer;
  });
});

Then("the form is refused, by a 400 or by closing the connection", function () {
  this.pubtest.refusalRead = true;
  if (this.pubtest.refused) return;
  assert.equal(this.pubtest.answer.status, 400, this.pubtest.answer.text);
});

// The form's own functions, on a form given as fields and values.
Given("the form:", function (table) {
  this.form = new URLSearchParams(table.raw());
});

Given("an empty form", function () {
  this.form = new URLSearchParams();
});

When("the state is made from the form", async function () {
  await this.attempt(() => stateFrom(this.form, STATE, []));
});

When("the state is made from the form, with {string} visible", async function (visible) {
  await this.attempt(() => stateFrom(this.form, STATE, visible.split(",")));
});

When("the labels of the state made from the form are listed", async function () {
  await this.attempt(() => labelsOf(stateFrom(this.form, STATE, [])));
});

When("the labels of the state are listed", async function () {
  await this.attempt(() => labelsOf(STATE));
});

When("the note is read from the form", async function () {
  await this.attempt(() => noteFrom(this.form));
});

When("the sha is read from the form", async function () {
  await this.attempt(() => shaFrom(this.form));
});

Given("the state:", function (doc) {
  this.given = JSON.parse(doc);
});

When("the state's file is written", async function () {
  await this.attempt(() => stateText(this.given));
});

// The state writer app, its token from GitHub's fake service, its pull request
// written to pubpr's fake publisher.
Given("the state writer app, asking the {string} service for its token", function (name) {
  const publisher = fakePublisher();
  this.proposals = [];
  const propose = async (o) => {
    this.proposals.push({ ...o, token: await o.token() });
    return publisher.propose(o);
  };
  this.writer = writer({ writerId: "9", writerKey: privateKey }, { propose, caller: calling(this, name, "https://api.github.com"), now: () => this.time });
});

When("the writer saves the state, noting {string}, for {string}", async function (note, who) {
  await this.attempt(() => this.writer.save(OWNER, { state: STATE, sha: SHA, note, who }));
});

const proposal = (world) => {
  assert.equal(world.proposals.length, 1, `${world.proposals.length} proposals`);
  return world.proposals[0];
};

Then("the proposal's {string} is {string}", function (key, value) {
  const got = proposal(this)[key];
  assert.ok(same(got, value), `the proposal's ${key} is ${JSON.stringify(got)}`);
});

Then("the proposal's {string} is:", function (key, doc) {
  const got = proposal(this)[key];
  assert.ok(same(got, doc), `the proposal's ${key} is ${JSON.stringify(got)}`);
});

Then("the proposal's {string} matches the expression {string}", function (key, expression) {
  const got = proposal(this)[key];
  assert.match(got, new RegExp(expression));
});
