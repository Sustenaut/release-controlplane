// cucumber-js's setup for these scenarios: pubtest's steps (its GRAMMAR.md), the
// site's HTTP client they send requests with, and the steps every feature here shares.
import * as cucumber from "@cucumber/cucumber";
import { Given, Then, setDefaultTimeout } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Answer, register, same } from "@sustenaut/pubtest";
import { handler } from "../../server.js";

setDefaultTimeout(60_000);

// The site under test is the app's handler on what the Givens put in this.site, made at
// its first request and kept for the scenario, as a pod keeps it. Each request is sent to
// it listening on a port of its own; "requests come from this site" sends that port's
// address as the Origin, as a browser does on a form from its own pages.
export async function send(world, method, path, headers = {}, body = undefined) {
  world.handle ??= handler(world.site);
  const handle = world.handle;
  const server = createServer((req, res) => handle(req, res)).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const sent = { ...(world.sameSite ? { origin: base } : {}), ...headers };
    const response = await fetch(base + path, { method, headers: sent, body: body ?? undefined, redirect: "manual" });
    return new Answer(response.status, Object.fromEntries(response.headers.entries()), await response.text());
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

register(cucumber, { client: (world) => (method, path, headers, body) => send(world, method, path, headers, body) });

cucumber.Before(function () {
  this.time = 0;
  this.calls = {};
  this.signals = {};
});

// A count of the calls made to a stand-in function the scenario named.
export function count(world, name) {
  world.calls[name] = (world.calls[name] ?? 0) + 1;
}

// fetch, for code that calls an https address: the call goes to pubtest's fake service
// of that name instead (its address in NAME_URL), and its deadline is kept.
export function routed(world, name, from) {
  return (url, init = {}) => {
    count(world, name);
    (world.signals[name] ??= []).push(init.signal);
    const to = process.env[`${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_URL`];
    assert.ok(to, `there is no fake ${name} service`);
    return fetch(String(url).replace(from, to), init);
  };
}

Given("my access token is {string}", function (token) {
  this.pubtest.headers["x-forwarded-access-token"] = token;
});

Given("requests come from this site", function () {
  this.sameSite = true;
});

Given("requests come from nowhere", function () {
  this.sameSite = false;
  delete this.pubtest.headers.origin;
});

Given("{int} second(s) pass(es)", function (seconds) {
  this.time += seconds * 1000;
});

Given("{int} ms pass(es)", function (ms) {
  this.time += ms;
});

Then("{string} was called {int} time(s)", function (name, times) {
  assert.equal(this.calls[name] ?? 0, times, `${name} was called ${this.calls[name] ?? 0} times`);
});

Then("every call to {string} had a deadline", function (name) {
  const signals = this.signals[name] ?? [];
  assert.ok(signals.length > 0, `nothing called ${name}`);
  assert.ok(signals.every((s) => s instanceof AbortSignal), `a call to ${name} had no deadline`);
});

Then("the refusal is a {word}", function (kind) {
  this.pubtest.refusalRead = true;
  const error = this.pubtest.refused?.error;
  assert.ok(error, "it was not refused");
  assert.equal(error.constructor.name, kind, `it was refused with a ${error.constructor.name}: ${error.message}`);
});

Then("the answer is the line {string}", function (line) {
  assert.equal(this.pubtest.answer?.text, `${line}\n`);
});

Then("the answer shows {string} before {string}", function (first, then) {
  const text = this.pubtest.answer?.text ?? "";
  const at = text.indexOf(first);
  assert.ok(at >= 0, `the answer does not show ${first}`);
  assert.ok(text.indexOf(then) > at, `the answer does not show ${then} first after ${first}`);
});

const requestsOf = (world, name) => {
  const fake = world.pubtest.fakes[name];
  assert.ok(fake, `there is no fake ${name} service`);
  return fake.requests;
};

Then("the {string} service was asked a request matching the expression {string} {int} time(s)", function (name, expression, times) {
  const asked = requestsOf(this, name).map((q) => `${q.method} ${q.path}`);
  const found = asked.filter((r) => new RegExp(expression).test(r)).length;
  assert.equal(found, times, `${name} was asked ${JSON.stringify(asked)}`);
});

Then("the {string} service was asked a request matching the expression {string} with the header {string} set to {string}", function (name, expression, header, value) {
  const asked = requestsOf(this, name).filter((q) => new RegExp(expression).test(`${q.method} ${q.path}`));
  assert.ok(asked.some((q) => q.headers[header.toLowerCase()] === value), `${name} was asked ${JSON.stringify(asked.map((q) => [q.method, q.path, q.headers[header.toLowerCase()]]))}`);
});

Then("the {string} service was asked {string} without the header {string}", function (name, request, header) {
  const asked = requestsOf(this, name).filter((q) => `${q.method} ${q.path}` === request);
  assert.ok(asked.length > 0, `${name} was not asked ${request}`);
  assert.ok(asked.every((q) => q.headers[header.toLowerCase()] === undefined), `${name} was asked ${request} with ${header}`);
});

// The records a Caller kept, one row each, the header row naming their fields.
Then("the call records are:", function (table) {
  const [keys, ...rows] = table.raw();
  const records = this.sink?.records ?? [];
  assert.equal(records.length, rows.length, `the records are ${JSON.stringify(records)}`);
  rows.forEach((row, i) => keys.forEach((k, j) => assert.ok(same(records[i][k], row[j]), `record ${i}'s ${k} is ${records[i][k]}, not ${row[j]}`)));
});

// A page looked at before the scenario's action, as the person it signed in.
Given("I have looked at {string}", async function (path) {
  await send(this, "GET", path, this.pubtest.headers);
});
