// The access check against auth's contract, with Keycloak answered here.
import { After, Then } from "@cucumber/cucumber";
import { mock as nodeMock } from "node:test";
import assert from "node:assert/strict";
import { accessCheck, DEGRADED, emailAccess, NO_ROLE, OK, SIGN_IN, UNAVAILABLE } from "../access.js";

// What node:test gave each test as `t`: its mocks, restored when the
// scenario ends, and the cleanups it registers with t.after().
const cleanups = [];
const scenarioContext = { mock: nodeMock, after: (fn) => cleanups.push(fn) };
After("@access", async function () {
  while (cleanups.length) await cleanups.pop()();
  nodeMock.restoreAll();
});


function keycloak() {
  const k = { hash: "h1", roles: ["release"], hashes: 0, userinfos: 0, hashStatus: 200, userinfoStatus: 200, down: false, time: 0 };
  k.request = async (url, { headers }) => {
    if (k.down) throw new Error("connection refused");
    const reply = (status, body) => ({ status, ok: status === 200, json: async () => body });
    if (url.endsWith("/access-state")) {
      k.hashes++;
      k.basic = headers.Authorization;
      k.hashUrl = url;
      return reply(k.hashStatus, { hash: k.hash });
    }
    k.userinfos++;
    k.bearer = headers.Authorization;
    return reply(k.userinfoStatus, { access: k.roles });
  };
  k.check = accessCheck({ realmUrl: "https://auth.test/realms/team/", clientId: "sustenaut.eu", clientSecret: "a b", role: "release", now: () => k.time, request: k.request });
  return k;
}

Then("it asks with the client's id and secret, and the person's token", function () {
  return (async () => {
  const k = keycloak();
  assert.equal((await k.check("a@x.org", "tok")).reason, OK);
  assert.equal(k.hashUrl, "https://auth.test/realms/team/app-registration/sustenaut.eu/access-state");
  assert.equal(k.basic, `Basic ${Buffer.from("sustenaut.eu:a%20b").toString("base64")}`);
  assert.equal(k.bearer, "Bearer tok");
})(scenarioContext);
});

Then("an unchanged hash makes no second full check, and a burst makes one fetch", function () {
  return (async () => {
  const k = keycloak();
  await Promise.all([k.check("a@x.org", "t"), k.check("b@x.org", "t")]);
  assert.equal(k.hashes, 1);
  assert.equal(k.userinfos, 2);
  k.time += 1_000;
  await k.check("a@x.org", "t");
  assert.equal(k.hashes, 1);
  k.time += 2_000;
  await k.check("a@x.org", "t");
  assert.equal(k.hashes, 2);
  assert.equal(k.userinfos, 2);
})(scenarioContext);
});

Then("a changed hash takes the role away at the next request after its 2 seconds", function () {
  return (async () => {
  const k = keycloak();
  assert.equal((await k.check("a@x.org", "t")).allowed, true);
  k.hash = "h2";
  k.roles = ["opportunity"];
  assert.equal((await k.check("a@x.org", "t")).allowed, true);
  k.time += 2_000;
  const { allowed, reason } = await k.check("a@x.org", "t");
  assert.equal(allowed, false);
  assert.equal(reason, NO_ROLE);
})(scenarioContext);
});

Then("a full check comes after 5 minutes even with the hash unchanged", function () {
  return (async () => {
  const k = keycloak();
  await k.check("a@x.org", "t");
  k.time += 299_999;
  await k.check("a@x.org", "t");
  assert.equal(k.userinfos, 1);
  k.time += 1;
  await k.check("a@x.org", "t");
  assert.equal(k.userinfos, 2);
})(scenarioContext);
});

Then("a refused token, or none, is sent to sign in, and forgotten", function () {
  return (async () => {
  for (const status of [401, 403]) {
    const k = keycloak();
    await k.check("a@x.org", "t");
    k.hash = "h2";
    k.time += 2_000;
    k.userinfoStatus = status;
    assert.equal((await k.check("a@x.org", "t")).reason, SIGN_IN);
    k.down = true;
    k.time += 2_000;
    assert.equal((await k.check("a@x.org", "t")).reason, UNAVAILABLE);
  }
  assert.equal((await keycloak().check("a@x.org", "")).reason, SIGN_IN);
})(scenarioContext);
});

Then("Keycloak unreachable: someone vouched for reads on, changes are refused, and so is anyone else", function () {
  return (async () => {
  const k = keycloak();
  k.roles = ["release", "controller"];
  await k.check("a@x.org", "t");
  k.down = true;
  k.time += 2_000;
  const reading = await k.check("a@x.org", "t");
  assert.equal(reading.reason, DEGRADED);
  assert.equal(reading.roles.has("controller"), true);
  assert.equal((await k.check("a@x.org", "t", { write: true })).reason, UNAVAILABLE);
  assert.equal((await k.check("b@x.org", "t")).reason, UNAVAILABLE);
})(scenarioContext);
});

Then("the 503 before auth's key is set counts as unreachable", function () {
  return (async () => {
  const k = keycloak();
  k.hashStatus = 503;
  assert.equal((await k.check("a@x.org", "t")).reason, UNAVAILABLE);
})(scenarioContext);
});

Then("a stored hash already out of date isn't vouched for", function () {
  return (async () => {
  const k = keycloak();
  await k.check("a@x.org", "t");
  k.hash = "h2";
  k.time += 2_000;
  await k.check("b@x.org", "t");
  k.down = true;
  k.time += 2_000;
  assert.equal((await k.check("b@x.org", "t")).reason, DEGRADED);
  assert.equal((await k.check("a@x.org", "t")).reason, UNAVAILABLE);
})(scenarioContext);
});

Then("userinfo failing with the hash answering goes on the last answer", function () {
  return (async () => {
  const k = keycloak();
  await k.check("a@x.org", "t");
  k.time += 300_000;
  k.userinfoStatus = 500;
  assert.equal((await k.check("a@x.org", "t")).reason, DEGRADED);
  assert.equal((await k.check("a@x.org", "t", { write: true })).reason, UNAVAILABLE);
})(scenarioContext);
});

Then("the role is matched by its exact name, and a bad claim gives nothing", function () {
  return (async () => {
  for (const claim of [["released"], ["role:release"], [], "release", [1]]) {
    const k = keycloak();
    k.roles = claim;
    assert.equal((await k.check("a@x.org", "t")).reason, NO_ROLE);
  }
})(scenarioContext);
});

Then("it remembers at most so many people", function () {
  return (async () => {
  const k = keycloak();
  const small = accessCheck({ realmUrl: "https://auth.test/r", clientId: "c", clientSecret: "s", role: "release", maxPeople: 1, now: () => k.time, request: k.request });
  await small("a@x.org", "t");
  await small("b@x.org", "t");
  await small("a@x.org", "t");
  assert.equal(k.userinfos, 3);
})(scenarioContext);
});

Then("an email list lets those on it do everything, and asks nobody", function () {
  return (async () => {
  const check = emailAccess(["a@x.org"], ["release", "controller"]);
  const on = await check("a@x.org");
  assert.equal(on.allowed, true);
  assert.equal(on.reason, OK);
  assert.equal(on.roles.has("controller"), true);
  const off = await check("b@x.org");
  assert.equal(off.allowed, false);
  assert.equal(off.reason, NO_ROLE);
  assert.equal(off.roles.size, 0);
})(scenarioContext);
});
