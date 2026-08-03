import type { PolicyFacts, RiskAssessment, WorkflowNotification } from "./types.js";

const CLASSIFIER_ID = "steering.reference-impact";
const CLASSIFIER_VERSION = "v1";

export function assessNotificationRisk(notification: WorkflowNotification): RiskAssessment {
  const action = notification.steering?.action ?? notification.event.type;
  const reversible = notification.steering?.reversible === true;
  const facts = notification.steering?.facts ?? {};

  if (action === "prelude.package_accepted_export" && reversible && facts.accepted === true) {
    return assessment("low", "Packaging an already accepted Prelude inception is bounded and reversible in the reference workflow.", [
      "accepted inception", "reversible package creation", "no deployment or merge effect",
    ]);
  }
  if (action === "helix.recover_run") {
    return assessment("high", "Run recovery can repeat an uncertain execution effect and therefore requires human review.", [
      "uncertain prior outcome", "agent execution", reversible ? "reversible marker present" : "not declared reversible",
    ]);
  }
  if (action === "issues.trigger_implementation" || action === "projects.submit_ready_card") {
    return assessment("medium", "This action commits team capacity or advances work across a product boundary.", [
      "workflow transition", "capacity impact", reversible ? "reversible marker present" : "not declared reversible",
    ]);
  }
  return assessment("unassessed", "No bounded reference classifier covers this action; human steering remains the safe default.", [
    `unrecognized action: ${action}`,
  ]);
}

export function policyFactsWithAssessment(facts: PolicyFacts, risk: RiskAssessment): PolicyFacts {
  return {
    ...facts,
    riskClassifier: `${risk.classifierId}.${risk.classifierVersion}`,
    riskExplanation: risk.explanation,
  };
}

function assessment(level: RiskAssessment["level"], explanation: string, factors: string[]): RiskAssessment {
  return { level, classifierId: CLASSIFIER_ID, classifierVersion: CLASSIFIER_VERSION, explanation, factors };
}
