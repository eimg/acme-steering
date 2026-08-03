import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluatePolicy } from "../src/policy.js";

describe("fixture delegation policy", () => {
  it("automates only the narrow accepted export rule", () => {
    const decision = evaluatePolicy({
      action: "prelude.package_accepted_export",
      risk: "low",
      reversible: true,
      facts: { accepted: true, evidenceComplete: true },
    });
    assert.equal(decision.outcome, "automatic");
    assert.equal(decision.policyId, "accepted-export-packaging");
  });

  it("falls back to human steering when no delegation matches", () => {
    assert.equal(evaluatePolicy({
      action: "issues.start_implementation",
      risk: "medium",
      reversible: false,
      facts: { evidenceComplete: true },
    }).outcome, "human_required");
  });

  it("defers incomplete evidence, escalates repeated security findings, and honors denial", () => {
    assert.equal(evaluatePolicy({
      action: "helix.bootstrap_target.select",
      risk: "high",
      reversible: false,
      facts: { evidenceComplete: false },
    }).outcome, "defer");
    assert.equal(evaluatePolicy({
      action: "helix.review.retry",
      risk: "high",
      reversible: true,
      facts: { securityFinding: true, attempts: 2 },
    }).outcome, "escalate");
    assert.equal(evaluatePolicy({
      action: "anything",
      risk: "low",
      reversible: true,
      facts: { forceDeny: true },
    }).outcome, "deny");
  });
});
