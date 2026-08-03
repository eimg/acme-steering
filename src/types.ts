export const DEFAULT_PORT = 8323;

export type CaseKind =
  | "decision"
  | "clarification"
  | "revision"
  | "exception"
  | "escalation"
  | "intervention";

export type PolicyOutcome =
  | "automatic"
  | "human_required"
  | "deny"
  | "defer"
  | "escalate";

export type CaseStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "revision_requested"
  | "deferred"
  | "escalated"
  | "stale"
  | "failed"
  | "withdrawn"
  | "awaiting_source"
  | "outcome_unknown";

export type Resolution =
  | "approve"
  | "reject"
  | "request_revision"
  | "defer"
  | "escalate"
  | "cancel";

export type RiskLevel = "unassessed" | "low" | "medium" | "high";

export interface EvidenceLink {
  label: string;
  detail: string;
  url?: string;
}

export interface CaseChoice {
  id: Resolution;
  label: string;
  consequence: string;
  tone?: "primary" | "danger" | "neutral";
}

export interface PolicyFacts {
  accepted?: boolean;
  evidenceComplete?: boolean;
  securityFinding?: boolean;
  attempts?: number;
  forceDeny?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface PolicyInput {
  action: string;
  risk: RiskLevel;
  reversible: boolean;
  facts: PolicyFacts;
}

export interface PolicyDecision {
  policyId: string;
  policyVersion: string;
  outcome: PolicyOutcome;
  explanation: string;
}

export interface SteeringActor {
  id: string;
  issuer: string;
  username: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
  kind: "human" | "service" | "development";
}

export interface SteeringCase {
  id: string;
  kind: CaseKind;
  title: string;
  sourceProduct: string;
  sourceRef: string;
  sourceRevision: string;
  action: string;
  reason: string;
  summary: string;
  proposedAction: string;
  recommendation: string;
  risk: RiskLevel;
  reversible: boolean;
  evidence: EvidenceLink[];
  choices: CaseChoice[];
  facts: PolicyFacts;
  policy: PolicyDecision;
  status: CaseStatus;
  resolution?: Resolution;
  rationale?: string;
  resolvedBy?: SteeringActor;
  applicationSummary?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  appliedAt?: string;
  messageCount: number;
}

export interface CaseMessage {
  id: number;
  caseId: string;
  body: string;
  author: SteeringActor;
  createdAt: string;
}

export interface CaseDetail extends SteeringCase {
  messages: CaseMessage[];
}

export type WorkflowProduct = "prelude" | "helix" | "acme-issues" | "acme-projects";

export interface WorkflowNotification {
  schemaVersion: "acme.steering.notification.v1";
  id: string;
  source: {
    product: WorkflowProduct;
    instanceId?: string;
    resourceType: string;
    resourceId: string;
    revision: string;
    url?: string;
  };
  event: {
    type: string;
    occurredAt: string;
    summary: string;
    detail?: string;
  };
  steering?: {
    caseKey: string;
    state: "open" | "resolved" | "withdrawn" | "superseded";
    kind?: CaseKind;
    title?: string;
    action?: string;
    reason?: string;
    proposedAction?: string;
    recommendation?: string;
    risk?: RiskLevel;
    reversible?: boolean;
    evidence?: EvidenceLink[];
    choices?: CaseChoice[];
    facts?: PolicyFacts;
  };
}

export interface WorkflowEventRecord extends WorkflowNotification {
  receivedAt: string;
  caseId?: string;
}

export interface SteeringActionRequest {
  schemaVersion: "acme.steering.action.v1";
  requestId: string;
  caseId: string;
  decisionId: string;
  actionKey: string;
  resource: { type: string; id: string; expectedRevision: string };
  input?: Record<string, unknown>;
}

export interface SteeringActionReceipt {
  schemaVersion: "acme.steering.action-receipt.v1";
  requestId: string;
  status: "applied" | "already_applied" | "accepted" | "stale" | "rejected" | "unavailable";
  sourceRevision: string;
  summary: string;
  eventId?: string;
  operationId?: string;
}

export type CaseView = "attention" | "automated" | "history";
