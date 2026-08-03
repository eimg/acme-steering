import type { SteeringActor } from "./types.js";
import { SteeringStore, type NewCase } from "./store.js";

const fixtureHuman: SteeringActor = {
  id: "fixture:admin",
  issuer: "acme-steering-fixture",
  username: "admin",
  displayName: "Fixture administrator",
  roles: ["admin"],
  permissions: ["*"],
  kind: "development",
};

export function seedFixtures(store: SteeringStore): void {
  if (store.countCases() > 0) return;
  for (const item of fixtureCases()) store.createCase(item);
  store.addMessage(
    "case-start-implementation",
    "The card has acceptance criteria and no unresolved questions. Confirm that implementation may start.",
    fixtureHuman,
  );
}

function fixtureCases(): NewCase[] {
  const now = Date.now();
  const time = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const decisionChoices = [
    { id: "approve" as const, label: "Approve", consequence: "Authorize the fixture action.", tone: "primary" as const },
    { id: "request_revision" as const, label: "Request changes", consequence: "Return conditions for a revised proposal." },
    { id: "reject" as const, label: "Reject", consequence: "Suppress this unchanged proposal.", tone: "danger" as const },
    { id: "defer" as const, label: "Defer", consequence: "Keep the action paused." },
  ];
  return [
    {
      id: "case-start-implementation",
      kind: "decision",
      title: "Start implementation",
      sourceProduct: "Acme Issues",
      sourceRef: "issue:42",
      sourceRevision: "issue-42-v3",
      action: "issues.start_implementation",
      reason: "A ready issue still requires implementation authority.",
      summary: "The Customer export timeout card is linked to a concrete issue with complete acceptance criteria.",
      proposedAction: "Add the configured trigger through Acme Issues and begin the existing Helix workflow.",
      recommendation: "Approve if the team is ready to spend implementation capacity.",
      risk: "medium",
      reversible: false,
      evidence: [
        { label: "Ready card", detail: "Acceptance criteria: 4 · Open questions: 0" },
        { label: "Linked issue", detail: "Issue 42 has no active implementation run" },
      ],
      choices: decisionChoices,
      facts: { evidenceComplete: true, attempts: 0 },
      createdAt: time(18),
    },
    {
      id: "case-package-export",
      kind: "decision",
      title: "Package accepted bootstrap export",
      sourceProduct: "Prelude",
      sourceRef: "export:billing-service:v2",
      sourceRevision: "export-v2",
      action: "prelude.package_accepted_export",
      reason: "An accepted inception version is ready for mechanical packaging.",
      summary: "The human already accepted version 2. Packaging does not change its intent or target.",
      proposedAction: "Create the immutable bootstrap package and expose it in the local catalog.",
      recommendation: "Automatic packaging is allowed by the narrow fixture policy.",
      risk: "low",
      reversible: true,
      evidence: [{ label: "Accepted export", detail: "Version 2 accepted by the project owner" }],
      choices: decisionChoices,
      facts: { accepted: true, evidenceComplete: true },
      createdAt: time(42),
    },
    {
      id: "case-clarify-target",
      kind: "clarification",
      title: "Choose the bootstrap target",
      sourceProduct: "Helix",
      sourceRef: "bootstrap:billing-service",
      sourceRevision: "bootstrap-v1",
      action: "helix.bootstrap_target.select",
      reason: "Two candidate workspaces exist and the export does not identify one.",
      summary: "The accepted export is valid, but applying it without a target could modify the wrong workspace.",
      proposedAction: "Select one target before materialization.",
      recommendation: "Provide the missing target rather than authorizing a guess.",
      risk: "high",
      reversible: false,
      evidence: [{ label: "Candidate targets", detail: "billing-api and billing-platform" }],
      choices: [
        { id: "request_revision", label: "Provide target", consequence: "Return the missing target as a revision." },
        { id: "defer", label: "Defer", consequence: "Wait without selecting a workspace." },
        { id: "cancel", label: "Cancel", consequence: "Withdraw this bootstrap proposal.", tone: "danger" },
      ],
      facts: { evidenceComplete: false },
      createdAt: time(75),
    },
    {
      id: "case-security-escalation",
      kind: "escalation",
      title: "Repeated security review finding",
      sourceProduct: "Helix PR control",
      sourceRef: "review:14",
      sourceRevision: "head-8f3c2a1",
      action: "helix.review.retry",
      reason: "The same authorization finding remains after two implementation attempts.",
      summary: "Automatic resubmission is no longer appropriate because the repeated finding may require scope or policy clarification.",
      proposedAction: "Route the case to an administrator before another review attempt.",
      recommendation: "Inspect the repeated finding and decide whether to revise or stop.",
      risk: "high",
      reversible: true,
      evidence: [{ label: "Review finding", detail: "Authorization check still occurs after evidence loading" }],
      choices: [
        { id: "request_revision", label: "Revise implementation", consequence: "Return explicit correction guidance." },
        { id: "reject", label: "Stop", consequence: "Reject another unchanged attempt.", tone: "danger" },
        { id: "defer", label: "Defer", consequence: "Keep the review paused." },
      ],
      facts: { securityFinding: true, attempts: 2 },
      createdAt: time(125),
      initialStatus: "escalated",
    },
    {
      id: "case-rejected-scope",
      kind: "revision",
      title: "Expand export scope",
      sourceProduct: "Acme Projects",
      sourceRef: "card:17",
      sourceRevision: "card-17-v4",
      action: "projects.scope.expand",
      reason: "The proposed implementation included an unrelated reporting feature.",
      summary: "The previous proposal was technically feasible but exceeded the accepted intent.",
      proposedAction: "Add reporting changes to the implementation issue.",
      recommendation: "Keep the rejection until a narrower successor is proposed.",
      risk: "medium",
      reversible: true,
      evidence: [{ label: "Human correction", detail: "Keep this change limited to export retry behavior" }],
      choices: decisionChoices,
      facts: { evidenceComplete: true },
      createdAt: time(240),
      initialStatus: "rejected",
      initialResolution: "reject",
      initialRationale: "The added reporting work is outside the accepted card scope.",
      initialActor: fixtureHuman,
      applicationSummary: "The unchanged proposal is suppressed from automatic resubmission.",
    },
  ];
}
