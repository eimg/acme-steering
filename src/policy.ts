import type {
  DelegationRule,
  PolicyDecision,
  PolicyFactCondition,
  PolicyInput,
  SteeringActor,
  SteeringPolicyConfig,
  SteeringPolicyDraft,
} from "./types.js";

export const DEFAULT_POLICY_DRAFT: SteeringPolicyDraft = {
  schemaVersion: "acme.steering.policy.v1",
  name: "Safe local delegation",
  defaultOutcome: "human_required",
  defaultExplanation: "No narrow automation rule applies, so the safe default is human steering.",
  rules: [
    {
      id: "explicit-deny",
      description: "Honor an explicit product or fixture denial fact.",
      enabled: true,
      outcome: "deny",
      match: { facts: [{ key: "forceDeny", operator: "equals", value: true }] },
      explanation: "An explicit policy fact denies this proposed action.",
    },
    {
      id: "repeated-security-finding",
      description: "Escalate security findings that remain after repeated attempts.",
      enabled: true,
      outcome: "escalate",
      match: { facts: [
        { key: "securityFinding", operator: "equals", value: true },
        { key: "attempts", operator: "gte", value: 2 },
      ] },
      explanation: "A security finding remains after repeated attempts, so the case requires escalation.",
    },
    {
      id: "missing-decision-evidence",
      description: "Defer when required decision evidence is incomplete.",
      enabled: true,
      outcome: "defer",
      match: { facts: [{ key: "evidenceComplete", operator: "equals", value: false }] },
      explanation: "Required decision evidence is incomplete; automation must wait for clarification.",
    },
    {
      id: "accepted-export-packaging",
      description: "Delegate packaging of an accepted, low-risk, reversible Prelude export.",
      enabled: true,
      outcome: "automatic",
      match: {
        action: "prelude.package_accepted_export",
        risk: "low",
        reversible: true,
        facts: [{ key: "accepted", operator: "equals", value: true }],
      },
      explanation: "Packaging an accepted, low-risk, reversible export is explicitly delegated.",
    },
  ],
};

const bootstrapActor: SteeringActor = {
  id: "service:acme-steering",
  issuer: "acme-steering",
  username: "steering-bootstrap",
  displayName: "Acme Steering bootstrap",
  roles: [],
  permissions: ["steering.manage"],
  kind: "service",
};

export function defaultPolicyConfig(createdAt = new Date().toISOString()): SteeringPolicyConfig {
  return {
    ...structuredClone(DEFAULT_POLICY_DRAFT),
    version: 1,
    createdAt,
    createdBy: bootstrapActor,
    changeSummary: "Initial inspectable delegation policy.",
  };
}

export function evaluatePolicy(
  input: PolicyInput,
  config: SteeringPolicyConfig = defaultPolicyConfig("1970-01-01T00:00:00.000Z"),
): PolicyDecision {
  // Only Prelude's bounded accepted-export action has a complete automatic
  // reference loop. Other source actions stay human-required even if a broad
  // configuration rule would otherwise match.
  if (input.facts.sourceNotification === true && input.action !== "prelude.package_accepted_export") {
    return decision(
      "source-automation-not-enabled",
      config.version,
      "human_required",
      "This source action has no complete automatic host contract, so an administrator must decide.",
    );
  }
  const rule = config.rules.find((candidate) => candidate.enabled && matches(candidate, input));
  return rule
    ? decision(rule.id, config.version, rule.outcome, rule.explanation)
    : decision("default", config.version, config.defaultOutcome,
      input.risk === "high" && config.defaultOutcome === "human_required"
        ? "High-impact actions require an explicit human decision."
        : config.defaultExplanation);
}

export function validatePolicyDraft(value: unknown): { ok: true; value: SteeringPolicyDraft } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["Policy must be an object."] };
  const input = value as Partial<SteeringPolicyDraft>;
  if (input.schemaVersion !== "acme.steering.policy.v1") errors.push("schemaVersion must be acme.steering.policy.v1.");
  if (!cleanText(input.name, 120)) errors.push("name is required and must be 120 characters or fewer.");
  if (!outcome(input.defaultOutcome)) errors.push("defaultOutcome is invalid.");
  if (!cleanText(input.defaultExplanation, 500)) errors.push("defaultExplanation is required and must be 500 characters or fewer.");
  if (!Array.isArray(input.rules) || input.rules.length > 100) errors.push("rules must be an array with at most 100 entries.");
  const ids = new Set<string>();
  for (const [index, rule] of (input.rules ?? []).entries()) validateRule(rule, index, ids, errors);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: structuredClone(input as SteeringPolicyDraft) };
}

function validateRule(rule: DelegationRule, index: number, ids: Set<string>, errors: string[]): void {
  const prefix = `rules[${index}]`;
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) { errors.push(`${prefix} must be an object.`); return; }
  if (!cleanText(rule.id, 100) || !/^[a-z0-9][a-z0-9._-]*$/.test(rule.id)) errors.push(`${prefix}.id must be a stable lowercase identifier.`);
  else if (ids.has(rule.id)) errors.push(`${prefix}.id is duplicated.`);
  else ids.add(rule.id);
  if (!cleanText(rule.description, 500)) errors.push(`${prefix}.description is required.`);
  if (typeof rule.enabled !== "boolean") errors.push(`${prefix}.enabled must be boolean.`);
  if (!outcome(rule.outcome)) errors.push(`${prefix}.outcome is invalid.`);
  if (!cleanText(rule.explanation, 500)) errors.push(`${prefix}.explanation is required.`);
  if (!rule.match || typeof rule.match !== "object" || Array.isArray(rule.match)) { errors.push(`${prefix}.match must be an object.`); return; }
  if (rule.match.action !== undefined && !cleanText(rule.match.action, 200)) errors.push(`${prefix}.match.action is invalid.`);
  if (rule.match.risk !== undefined && !["unassessed", "low", "medium", "high"].includes(rule.match.risk)) errors.push(`${prefix}.match.risk is invalid.`);
  if (rule.match.reversible !== undefined && typeof rule.match.reversible !== "boolean") errors.push(`${prefix}.match.reversible must be boolean.`);
  if (rule.match.facts !== undefined && (!Array.isArray(rule.match.facts) || rule.match.facts.length > 20)) {
    errors.push(`${prefix}.match.facts must contain at most 20 conditions.`);
  } else {
    for (const [conditionIndex, condition] of (rule.match.facts ?? []).entries()) validateCondition(condition, `${prefix}.match.facts[${conditionIndex}]`, errors);
  }
}

function validateCondition(condition: PolicyFactCondition, prefix: string, errors: string[]): void {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) { errors.push(`${prefix} must be an object.`); return; }
  if (!cleanText(condition.key, 100) || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(condition.key)) errors.push(`${prefix}.key is invalid.`);
  if (!["equals", "not_equals", "gte", "lte", "present"].includes(condition.operator)) errors.push(`${prefix}.operator is invalid.`);
  if (condition.operator !== "present" && !["string", "number", "boolean"].includes(typeof condition.value)) errors.push(`${prefix}.value is required.`);
  if (["gte", "lte"].includes(condition.operator) && typeof condition.value !== "number") errors.push(`${prefix}.value must be numeric for ${condition.operator}.`);
}

function matches(rule: DelegationRule, input: PolicyInput): boolean {
  const match = rule.match;
  if (match.action !== undefined && match.action !== input.action) return false;
  if (match.risk !== undefined && match.risk !== input.risk) return false;
  if (match.reversible !== undefined && match.reversible !== input.reversible) return false;
  return (match.facts ?? []).every((condition) => factMatches(input.facts[condition.key], condition));
}

function factMatches(actual: unknown, condition: PolicyFactCondition): boolean {
  if (condition.operator === "present") return actual !== undefined;
  if (condition.operator === "equals") return actual === condition.value;
  if (condition.operator === "not_equals") return actual !== condition.value;
  if (typeof actual !== "number" || typeof condition.value !== "number") return false;
  return condition.operator === "gte" ? actual >= condition.value : actual <= condition.value;
}

function outcome(value: unknown): boolean {
  return ["automatic", "human_required", "deny", "defer", "escalate"].includes(String(value));
}

function cleanText(value: unknown, max: number): boolean {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= max;
}

function decision(policyId: string, version: number, outcomeValue: PolicyDecision["outcome"], explanation: string): PolicyDecision {
  return { policyId, policyVersion: `steering.delegation.v${version}`, outcome: outcomeValue, explanation };
}
