import type { PolicyDecision, PolicyInput } from "./types.js";

const POLICY_VERSION = "steering.delegation.v1";

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  if (input.facts.forceDeny) {
    return decision("explicit-deny", "deny", "A fixture policy explicitly denies this proposed action.");
  }

  if (input.facts.securityFinding && Number(input.facts.attempts ?? 0) >= 2) {
    return decision(
      "repeated-security-finding",
      "escalate",
      "A security finding remains after repeated attempts, so the case requires escalation.",
    );
  }

  if (input.facts.evidenceComplete === false) {
    return decision(
      "missing-decision-evidence",
      "defer",
      "Required decision evidence is incomplete; automation must wait for clarification.",
    );
  }

  if (
    input.action === "prelude.package_accepted_export"
    && input.facts.accepted === true
    && input.risk === "low"
    && input.reversible
  ) {
    return decision(
      "accepted-export-packaging",
      "automatic",
      "Packaging an accepted, low-risk, reversible export is explicitly delegated.",
    );
  }

  return decision(
    "safe-manual-default",
    "human_required",
    input.risk === "high"
      ? "High-impact actions require an explicit human decision."
      : "No narrow automation rule applies, so the safe default is human steering.",
  );
}

function decision(
  policyId: string,
  outcome: PolicyDecision["outcome"],
  explanation: string,
): PolicyDecision {
  return { policyId, policyVersion: POLICY_VERSION, outcome, explanation };
}
