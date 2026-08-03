export type CaseView = "attention" | "automated" | "history";
export type InboxView = CaseView | "activity" | "config";
export type Resolution = "approve" | "reject" | "request_revision" | "defer" | "escalate" | "cancel";

export interface Principal {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
  kind: string;
}

export interface Session {
  authMode: "off" | "local";
  provider: string;
  accountUrl?: string;
  principal: Principal;
  capabilities: {
    read: boolean;
    decide: boolean;
    manage: boolean;
    automate: boolean;
  };
}

export interface Config {
  product: string;
  authMode: "off" | "local";
  provider: string;
  advisorEnabled: boolean;
  advisorMode: "openrouter" | "fake";
  advisorModel?: string;
  configAgentMode: "openrouter" | "fake";
  configAgentModel?: string;
  fixtureMode: boolean;
}

export type PolicyOutcome = "automatic" | "human_required" | "deny" | "defer" | "escalate";
export interface PolicyDraft {
  schemaVersion: "acme.steering.policy.v1";
  name: string;
  defaultOutcome: PolicyOutcome;
  defaultExplanation: string;
  rules: Array<{
    id: string;
    description: string;
    enabled: boolean;
    outcome: PolicyOutcome;
    match: {
      action?: string;
      risk?: "unassessed" | "low" | "medium" | "high";
      reversible?: boolean;
      facts?: Array<{ key: string; operator: "equals" | "not_equals" | "gte" | "lte" | "present"; value?: string | number | boolean }>;
    };
    explanation: string;
  }>;
}
export interface PolicyConfig extends PolicyDraft {
  version: number;
  createdAt: string;
  createdBy: Principal;
  changeSummary: string;
}
export interface PolicyPreview {
  valid: true;
  evaluatedCases: number;
  changedCases: number;
  automaticCases: number;
  cases: Array<{
    caseId: string;
    title: string;
    currentOutcome: PolicyOutcome;
    proposedOutcome: PolicyOutcome;
    proposedRuleId: string;
    changed: boolean;
  }>;
  unusedRuleIds: string[];
  warnings: string[];
}
export interface ConfigAgentSession {
  id: string;
  status: "active" | "error" | "applied";
  messages: Array<{ role: "user" | "assistant"; content: string; createdAt: string }>;
  proposedConfig?: PolicyDraft;
  proposalSummary?: string;
  basedOnVersion: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Choice {
  id: Resolution;
  label: string;
  consequence: string;
  tone?: "primary" | "danger" | "neutral";
}

export interface CaseMessage {
  id: number;
  body: string;
  author: Principal;
  createdAt: string;
}

export interface SteeringCase {
  id: string;
  kind: string;
  title: string;
  sourceProduct: string;
  sourceRef: string;
  sourceRevision: string;
  action: string;
  reason: string;
  summary: string;
  proposedAction: string;
  recommendation: string;
  risk: "unassessed" | "low" | "medium" | "high";
  riskAssessment?: {
    level: "unassessed" | "low" | "medium" | "high";
    classifierId: string;
    classifierVersion: string;
    explanation: string;
    factors: string[];
  };
  reversible: boolean;
  evidence: Array<{ label: string; detail: string; url?: string }>;
  choices: Choice[];
  policy: {
    policyId: string;
    policyVersion: string;
    outcome: "automatic" | "human_required" | "deny" | "defer" | "escalate";
    explanation: string;
  };
  status: string;
  resolution?: Resolution;
  rationale?: string;
  resolvedBy?: Principal;
  decisionId?: string;
  decisionDeliveryStatus?: "recorded" | "already_recorded" | "stale" | "rejected" | "unavailable";
  decisionDeliverySummary?: string;
  decisionDeliveredAt?: string;
  applicationSummary?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  appliedAt?: string;
  messageCount: number;
  messages?: CaseMessage[];
  attempts?: Array<{
    id: number;
    kind: string;
    status: string;
    summary: string;
    actor: Principal;
    policyId?: string;
    policyVersion?: string;
    createdAt: string;
  }>;
  escalations?: Array<{
    id: number;
    requiredPermission: string;
    reason: string;
    deadlineAt?: string;
    fallback: "remain_paused";
    status: "open" | "closed";
    createdBy: Principal;
    createdAt: string;
    closedAt?: string;
  }>;
}

export interface WorkflowEvent {
  id: string;
  source: { product: string; resourceType: string; resourceId: string; revision: string; url?: string };
  event: { type: string; occurredAt: string; summary: string; detail?: string };
  steering?: { state: string; caseKey: string };
  receivedAt: string;
  caseId?: string;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ApiError(response.status, body.error ?? response.statusText, body);
  return body;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message);
  }
}

export const api = {
  config: () => json<Config>("/api/config"),
  session: () => json<Session>("/api/auth/session"),
  signIn: (username: string, password: string) => json<unknown>("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  }),
  signOut: () => json<unknown>("/api/auth/session", { method: "DELETE" }),
  summary: () => json<Record<CaseView, number>>("/api/summary"),
  cases: (view: CaseView) => json<{ items: SteeringCase[] }>(`/api/cases?view=${view}`),
  events: () => json<{ items: WorkflowEvent[] }>("/api/events"),
  case: (id: string) => json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}`),
  message: (id: string, body: string) => json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }),
  askAdvisor: (id: string, prompt: string) => json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/advisor`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  }),
  resolve: (id: string, resolution: Resolution, rationale: string, sourceRevision: string) =>
    json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution, rationale, sourceRevision }),
    }),
  redeliverDecision: (id: string) => json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/redeliver-decision`, {
    method: "POST",
  }),
  policyConfig: () => json<{ active: PolicyConfig; history: PolicyConfig[] }>("/api/policy-config"),
  previewPolicy: (config: PolicyDraft) => json<PolicyPreview>("/api/policy-config/preview", {
    method: "POST",
    body: JSON.stringify({ config }),
  }),
  activatePolicy: (config: PolicyDraft, expectedVersion: number, changeSummary: string) =>
    json<PolicyConfig>("/api/policy-config/activate", {
      method: "POST",
      body: JSON.stringify({ config, expectedVersion, changeSummary }),
    }),
  startConfigAgent: (prompt: string) => json<ConfigAgentSession>("/api/config-agent/sessions", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  }),
  messageConfigAgent: (id: string, prompt: string) => json<ConfigAgentSession>(`/api/config-agent/sessions/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  }),
  activateAgentProposal: (id: string) => json<{ active: PolicyConfig; session: ConfigAgentSession }>(`/api/config-agent/sessions/${encodeURIComponent(id)}/activate`, {
    method: "POST",
  }),
};
