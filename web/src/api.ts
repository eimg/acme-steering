export type CaseView = "attention" | "automated" | "history";
export type InboxView = CaseView | "activity";
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
  fixtureMode: boolean;
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
  resolve: (id: string, resolution: Resolution, rationale: string, sourceRevision: string) =>
    json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution, rationale, sourceRevision }),
    }),
  redeliverDecision: (id: string) => json<SteeringCase>(`/api/cases/${encodeURIComponent(id)}/redeliver-decision`, {
    method: "POST",
  }),
};
