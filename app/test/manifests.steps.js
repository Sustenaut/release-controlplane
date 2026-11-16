// What the deploy applies, where kustomize is installed, as it is in CI: a mistake here would
// stop the deploy of both sites.
import { After, Then } from "@cucumber/cucumber";
import { mock as nodeMock } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// What node:test gave each test as `t`: its mocks, restored when the
// scenario ends, and the cleanups it registers with t.after().
const cleanups = [];
const scenarioContext = { mock: nodeMock, after: (fn) => cleanups.push(fn) };
After("@manifests", async function () {
  while (cleanups.length) await cleanups.pop()();
  nodeMock.restoreAll();
});


const installed = spawnSync("kustomize", ["version"]).status === 0;
const build = (dir) => {
  const { status, stdout, stderr } = spawnSync("kustomize", ["build", dir], { encoding: "utf8" });
  assert.equal(status, 0, stderr);
  return stdout;
};

Then("schryer's deployment is its own, with its own host, realm and list", function () {
  if (!installed) return "skipped";
  return (() => {
  const text = build("k8s-schryer");
  assert.doesNotMatch(text, /namespace: release\n/);
  assert.match(text, /namespace: release-schryer/);
  assert.match(text, /host: release\.schryer\.eu/);
  assert.doesNotMatch(text, /release\.sustenaut\.eu/);
  assert.match(text, /realms\/family/);
  assert.doesNotMatch(text, /realms\/team/);
  assert.match(text, /--authenticated-emails-file=\/etc\/oauth2-proxy\/emails/);
  assert.match(text, /ALLOWED_EMAILS/);
  assert.doesNotMatch(text, /OIDC_CLIENT_ID\n|allowed-group|email-domain/);
  assert.match(text, /value: schryer\n/);
})(scenarioContext);
});

Then("Sustenaut's deployment is unchanged by it", function () {
  if (!installed) return "skipped";
  return (() => {
  const text = build("k8s");
  assert.doesNotMatch(text, /schryer/);
  assert.match(text, /namespace: release\n/);
  assert.match(text, /--allowed-group=release/);
})(scenarioContext);
});
