import { evaluatePolicy, validatePolicyDraft } from "./policy.js";
import { PolicyConfigValidationError, PolicyConfigStore } from "./configStore.js";
import type { PolicyPreview, SteeringPolicyConfig } from "./types.js";
import type { SteeringStore } from "./store.js";

export function previewPolicyChange(
  value: unknown,
  configs: PolicyConfigStore,
  cases: SteeringStore,
): PolicyPreview {
  const validated = validatePolicyDraft(value);
  if (!validated.ok) throw new PolicyConfigValidationError(validated.errors);
  const active = configs.active();
  const proposed: SteeringPolicyConfig = {
    ...validated.value,
    version: active.version + 1,
    createdAt: active.createdAt,
    createdBy: active.createdBy,
    changeSummary: "Preview only",
  };
  const items = cases.listAllCases().map((item) => {
    const decision = evaluatePolicy({
      action: item.action,
      risk: item.risk,
      reversible: item.reversible,
      facts: item.facts,
    }, proposed);
    return {
      caseId: item.id,
      title: item.title,
      currentOutcome: item.policy.outcome,
      proposedOutcome: decision.outcome,
      proposedRuleId: decision.policyId,
      changed: item.policy.outcome !== decision.outcome,
    };
  });
  const used = new Set(items.map((item) => item.proposedRuleId));
  const unusedRuleIds = proposed.rules.filter((rule) => rule.enabled && !used.has(rule.id)).map((rule) => rule.id);
  const automaticCases = items.filter((item) => item.proposedOutcome === "automatic").length;
  const warnings = [
    ...(items.length === 0 ? ["No current cases are available; preview covers validation only."] : []),
    ...(automaticCases > 0 ? [`${automaticCases} current case(s) would be classified automatic.`] : []),
    ...(unusedRuleIds.length > 0 ? [`${unusedRuleIds.length} enabled rule(s) did not match the current case set.`] : []),
  ];
  return {
    valid: true,
    evaluatedCases: items.length,
    changedCases: items.filter((item) => item.changed).length,
    automaticCases,
    cases: items,
    unusedRuleIds,
    warnings,
  };
}
