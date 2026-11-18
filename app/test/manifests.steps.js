// What the deploy applies, built with kustomize where it is installed, as it is in CI:
// a mistake here would stop the deploy of both sites. Without kustomize these skip.
import { Before, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const installed = spawnSync("kustomize", ["version"]).status === 0;

Before("@manifests", function () {
  return installed ? undefined : "skipped";
});

// pubtest's pattern: literal text in which only * stands for anything.
const matches = (pattern, text) => new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "s").test(text);

Then("it prints no line matching {string}", function (pattern) {
  const lines = (this.pubtest.outcome?.stdout ?? "").split("\n").filter((line) => matches(pattern, line));
  assert.deepEqual(lines, [], `lines match ${pattern}`);
});
