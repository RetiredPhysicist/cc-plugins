import { test } from "node:test";
import assert from "node:assert/strict";
import { RISK_RULE_IDS, assessCommand, describeRisks } from "../hooks/risk.js";

function ids(command) {
  return assessCommand(command).map((risk) => risk.id);
}

test("flags a recursive delete", () => {
  assert.ok(ids("rm -rf build").includes("rm-recursive"));
  assert.ok(ids("rm -r node_modules").includes("rm-recursive"));
});

test("flags a force push but not a lease push", () => {
  assert.ok(ids("git push --force origin main").includes("git-push-force"));
  assert.ok(ids("git push -f").includes("git-push-force"));
  assert.deepEqual(ids("git push --force-with-lease"), []);
});

test("flags a hard reset and a destructive clean", () => {
  assert.ok(ids("git reset --hard HEAD~1").includes("git-reset-hard"));
  assert.ok(ids("git clean -fd").includes("git-clean"));
});

test("flags publishing", () => {
  assert.ok(ids("npm publish --access public").includes("publish"));
  assert.ok(ids("docker push image:tag").includes("publish"));
});

test("leaves ordinary commands alone", () => {
  for (const command of ["ls -la", "git status", "npm test", "git push origin main", "rm file.txt"]) {
    assert.deepEqual(ids(command), [], `expected no risk for: ${command}`);
  }
});

test("handles empty and missing input", () => {
  assert.deepEqual(assessCommand(""), []);
  assert.deepEqual(assessCommand(null), []);
  assert.deepEqual(assessCommand(undefined), []);
  assert.deepEqual(assessCommand("   "), []);
});

test("can report more than one reason at once", () => {
  const risks = assessCommand("sudo rm -rf /");
  const found = risks.map((risk) => risk.id);
  assert.ok(found.includes("sudo"));
  assert.ok(found.includes("rm-recursive"));
});

test("describes risks for a prompt", () => {
  const risks = assessCommand("rm -rf /");
  const text = describeRisks(risks);
  assert.match(text, /recursive delete/);
  assert.equal(describeRisks([]), "");
});

test("rule ids are unique", () => {
  assert.equal(new Set(RISK_RULE_IDS).size, RISK_RULE_IDS.length);
});
