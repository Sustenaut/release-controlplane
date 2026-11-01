// What the deploy applies, where kustomize is installed, as it is in CI: a mistake here would
// stop the deploy of both sites.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const installed = spawnSync("kustomize", ["version"]).status === 0;
const build = (dir) => {
  const { status, stdout, stderr } = spawnSync("kustomize", ["build", dir], { encoding: "utf8" });
  assert.equal(status, 0, stderr);
  return stdout;
};

test("schryer's deployment is its own, with its own host, realm and list", { skip: !installed }, () => {
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
});

test("Sustenaut's deployment is unchanged by it", { skip: !installed }, () => {
  const text = build("k8s");
  assert.doesNotMatch(text, /schryer/);
  assert.match(text, /namespace: release\n/);
  assert.match(text, /--allowed-group=release/);
});
