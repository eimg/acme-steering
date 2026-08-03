import type Database from "better-sqlite3";
import { evaluatePolicy } from "./policy.js";
import type {
  CaseDetail,
  CaseKind,
  CaseMessage,
  CaseStatus,
  CaseView,
  EvidenceLink,
  CaseChoice,
  PolicyFacts,
  Resolution,
  RiskLevel,
  SteeringActor,
  SteeringCase,
  WorkflowEventRecord,
  WorkflowNotification,
  SteeringActionReceipt,
  SteeringDecisionReceipt,
} from "./types.js";

type CaseRow = Record<string, unknown>;

export interface NewCase {
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
  createdAt?: string;
  initialStatus?: CaseStatus;
  initialResolution?: Resolution;
  initialRationale?: string;
  initialActor?: SteeringActor;
  applicationSummary?: string;
}

export class CaseNotFoundError extends Error {}
export class CaseConflictError extends Error {}
export class StaleCaseError extends Error {
  constructor(message: string, readonly detail: CaseDetail) {
    super(message);
  }
}

const steeringService: SteeringActor = {
  id: "service:acme-steering",
  issuer: "acme-steering",
  username: "steering-policy",
  displayName: "Acme Steering policy",
  roles: [],
  permissions: ["steering.automate"],
  kind: "service",
};

export class SteeringStore {
  constructor(private readonly db: Database.Database) {}

  countCases(): number {
    return Number((this.db.prepare("SELECT COUNT(*) AS count FROM steering_cases").get() as { count: number }).count);
  }

  ingestNotification(notification: WorkflowNotification): { duplicate: boolean; event: WorkflowEventRecord; case?: CaseDetail } {
    const existing = this.db.prepare("SELECT notification_json, received_at, case_id FROM workflow_events WHERE id = ?")
      .get(notification.id) as { notification_json: string; received_at: string; case_id?: string } | undefined;
    if (existing) {
      return {
        duplicate: true,
        event: { ...parseJson<WorkflowNotification>(existing.notification_json, notification), receivedAt: existing.received_at, caseId: existing.case_id },
        case: existing.case_id ? this.getCase(existing.case_id) : undefined,
      };
    }

    const receivedAt = new Date().toISOString();
    const caseId = notification.steering ? `${notification.source.product}:${notification.steering.caseKey}` : undefined;
    let detail: CaseDetail | undefined;
    this.db.transaction(() => {
      if (notification.steering) detail = this.syncNotificationCase(caseId!, notification, receivedAt);
      this.db.prepare(`
        INSERT INTO workflow_events (
          id, source_product, source_resource_type, source_resource_id, source_revision,
          source_url, event_type, occurred_at, summary, detail, notification_json, case_id, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        notification.id, notification.source.product, notification.source.resourceType,
        notification.source.resourceId, notification.source.revision, notification.source.url ?? null,
        notification.event.type, notification.event.occurredAt, notification.event.summary,
        notification.event.detail ?? null, JSON.stringify(notification), caseId ?? null, receivedAt,
      );
    })();
    return { duplicate: false, event: { ...notification, receivedAt, caseId }, case: detail };
  }

  listWorkflowEvents(limit = 100): WorkflowEventRecord[] {
    const rows = this.db.prepare(`
      SELECT notification_json, received_at, case_id FROM workflow_events
      ORDER BY occurred_at DESC, received_at DESC, id DESC LIMIT ?
    `).all(Math.max(1, Math.min(limit, 250))) as Array<{ notification_json: string; received_at: string; case_id?: string }>;
    return rows.map((row) => ({
      ...parseJson<WorkflowNotification>(row.notification_json, {} as WorkflowNotification),
      receivedAt: row.received_at,
      caseId: row.case_id,
    }));
  }

  createCase(input: NewCase): CaseDetail {
    const policy = evaluatePolicy({
      action: input.action,
      risk: input.risk,
      reversible: input.reversible,
      facts: input.facts,
    });
    const now = input.createdAt ?? new Date().toISOString();
    const automatic = policy.outcome === "automatic";
    const status = input.initialStatus ?? (automatic ? "applied" : "pending");
    const resolution = input.initialResolution ?? (automatic ? "approve" : undefined);
    const actor = input.initialActor ?? (automatic ? steeringService : undefined);
    const resolvedAt = resolution ? now : undefined;
    const appliedAt = status === "applied" ? now : undefined;
    const applicationSummary = input.applicationSummary
      ?? (automatic ? "Fixture adapter acknowledged the delegated action." : undefined);

    this.db.prepare(`
      INSERT INTO steering_cases (
        id, kind, title, source_product, source_ref, source_revision, action,
        reason, summary, proposed_action, recommendation, risk, reversible,
        evidence_json, choices_json, facts_json, policy_id, policy_version,
        policy_outcome, policy_explanation, status, resolution, rationale,
        resolved_by_json, application_summary, created_at, updated_at,
        resolved_at, applied_at
      ) VALUES (
        @id, @kind, @title, @sourceProduct, @sourceRef, @sourceRevision, @action,
        @reason, @summary, @proposedAction, @recommendation, @risk, @reversible,
        @evidenceJson, @choicesJson, @factsJson, @policyId, @policyVersion,
        @policyOutcome, @policyExplanation, @status, @resolution, @rationale,
        @resolvedByJson, @applicationSummary, @createdAt, @updatedAt,
        @resolvedAt, @appliedAt
      )
    `).run({
      ...input,
      reversible: input.reversible ? 1 : 0,
      evidenceJson: JSON.stringify(input.evidence),
      choicesJson: JSON.stringify(input.choices),
      factsJson: JSON.stringify(input.facts),
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policyOutcome: policy.outcome,
      policyExplanation: policy.explanation,
      status,
      resolution: resolution ?? null,
      rationale: input.initialRationale ?? null,
      resolvedByJson: actor ? JSON.stringify(actor) : null,
      applicationSummary: applicationSummary ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: resolvedAt ?? null,
      appliedAt: appliedAt ?? null,
    });
    return this.getCase(input.id);
  }

  listCases(view: CaseView): SteeringCase[] {
    const where = view === "attention"
      ? "status IN ('pending', 'deferred', 'escalated', 'revision_requested', 'outcome_unknown')"
      : view === "automated"
        ? "policy_outcome = 'automatic' AND status = 'applied'"
        : "NOT (status IN ('pending', 'deferred', 'escalated', 'revision_requested', 'outcome_unknown')) AND NOT (policy_outcome = 'automatic' AND status = 'applied')";
    const rows = this.db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM case_messages m WHERE m.case_id = c.id) AS message_count
      FROM steering_cases c
      WHERE ${where}
      ORDER BY updated_at DESC, id ASC
    `).all() as CaseRow[];
    return rows.map(mapCase);
  }

  summary(): Record<CaseView, number> {
    return {
      attention: this.listCases("attention").length,
      automated: this.listCases("automated").length,
      history: this.listCases("history").length,
    };
  }

  getCase(id: string): CaseDetail {
    const row = this.db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM case_messages m WHERE m.case_id = c.id) AS message_count
      FROM steering_cases c WHERE c.id = ?
    `).get(id) as CaseRow | undefined;
    if (!row) throw new CaseNotFoundError(`Steering case not found: ${id}`);
    return { ...mapCase(row), messages: this.listMessages(id) };
  }

  addMessage(caseId: string, body: string, author: SteeringActor): CaseDetail {
    this.getCase(caseId);
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO case_messages (case_id, body, author_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(caseId, body, JSON.stringify(author), now);
      this.db.prepare("UPDATE steering_cases SET updated_at = ? WHERE id = ?").run(now, caseId);
    })();
    return this.getCase(caseId);
  }

  resolveCase({
    caseId,
    resolution,
    rationale,
    expectedRevision,
    actor,
    decisionId,
  }: {
    caseId: string;
    resolution: Resolution;
    rationale: string;
    expectedRevision: string;
    actor: SteeringActor;
    decisionId?: string;
  }): CaseDetail {
    const current = this.getCase(caseId);
    if (!["pending", "deferred", "escalated", "revision_requested"].includes(current.status)) {
      throw new CaseConflictError(`Case is already ${current.status}`);
    }
    if (current.sourceRevision !== expectedRevision) {
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE steering_cases
        SET status = 'stale', application_summary = ?, updated_at = ?, resolved_at = ?
        WHERE id = ?
      `).run("The source revision changed before this resolution could be applied.", now, now, caseId);
      throw new StaleCaseError("The steering case is stale", this.getCase(caseId));
    }
    if (current.policy.outcome === "deny" && resolution === "approve") {
      throw new CaseConflictError("A denied action cannot be approved through this case");
    }

    const now = new Date().toISOString();
    const applicationFailure = current.facts.applicationFailure === true;
    const awaitsSource = current.facts.sourceNotification === true && resolution === "approve";
    const status: CaseStatus = resolution === "approve"
      ? applicationFailure ? "failed" : awaitsSource ? "awaiting_source" : "applied"
      : resolution === "reject" ? "rejected"
        : resolution === "request_revision" ? "revision_requested"
          : resolution === "defer" ? "deferred"
            : resolution === "escalate" ? "escalated"
              : "withdrawn";
    const applicationSummary = resolution === "approve"
      ? applicationFailure
        ? "The fixture adapter refused the action to demonstrate an application failure."
        : awaitsSource
          ? "Approval is recorded. The source product remains authoritative; a newer source event must confirm or supersede the transition."
          : "The fixture adapter acknowledged the human-authorized action."
      : resolution === "request_revision"
        ? "The proposal remains open for a materially revised successor."
        : resolution === "defer"
          ? "The case remains paused until its prerequisites change."
          : resolution === "escalate"
            ? "The case remains paused for a higher-authority decision."
            : resolution === "reject"
              ? "The unchanged proposal is suppressed from automatic resubmission."
              : "The proposed action was withdrawn.";

    this.db.prepare(`
      UPDATE steering_cases
      SET status = ?, resolution = ?, rationale = ?, resolved_by_json = ?,
          decision_id = ?, application_summary = ?, updated_at = ?, resolved_at = ?, applied_at = ?
      WHERE id = ?
    `).run(
      status,
      resolution,
      rationale,
      JSON.stringify(actor),
      decisionId ?? null,
      applicationSummary,
      now,
      now,
      status === "applied" ? now : null,
      caseId,
    );
    return this.getCase(caseId);
  }

  recordDecisionReceipt(caseId: string, receipt: SteeringDecisionReceipt): CaseDetail {
    const current = this.getCase(caseId);
    if (current.decisionId && current.decisionId !== receipt.decisionId) {
      throw new CaseConflictError("Decision receipt does not match the current decision");
    }
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE steering_cases
        SET decision_delivery_status=?, decision_delivery_summary=?, decision_delivered_at=?, updated_at=?
        WHERE id=?
      `).run(receipt.status, receipt.summary, now, now, caseId);
      this.insertSystemMessage(caseId, `Source decision delivery: ${receipt.summary}`, now);
    })();
    return this.getCase(caseId);
  }

  recordActionReceipt(caseId: string, receipt: SteeringActionReceipt): CaseDetail {
    const current = this.getCase(caseId);
    if (current.status !== "awaiting_source") return current;
    const now = new Date().toISOString();
    const status: CaseStatus = receipt.status === "applied" || receipt.status === "already_applied"
      ? "applied"
      : receipt.status === "stale" ? "stale"
        : receipt.status === "accepted" ? "awaiting_source"
          : receipt.status === "unavailable" ? "outcome_unknown" : "failed";
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE steering_cases SET status=?, source_revision=?, application_summary=?, updated_at=?,
          applied_at=?, resolved_at=COALESCE(resolved_at, ?) WHERE id=?
      `).run(
        status, receipt.sourceRevision || current.sourceRevision, receipt.summary, now,
        status === "applied" ? now : null, now, caseId,
      );
      this.insertSystemMessage(caseId, `Source action receipt: ${receipt.summary}`, now);
    })();
    return this.getCase(caseId);
  }

  private listMessages(caseId: string): CaseMessage[] {
    const rows = this.db.prepare(`
      SELECT id, case_id, body, author_json, created_at
      FROM case_messages WHERE case_id = ? ORDER BY created_at ASC, id ASC
    `).all(caseId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      caseId: String(row.case_id),
      body: String(row.body),
      author: parseJson<SteeringActor>(row.author_json, steeringService),
      createdAt: String(row.created_at),
    }));
  }

  private syncNotificationCase(caseId: string, notification: WorkflowNotification, now: string): CaseDetail {
    const steering = notification.steering!;
    const currentRow = this.db.prepare("SELECT id, source_revision, status FROM steering_cases WHERE id = ?").get(caseId) as
      { id: string; source_revision: string; status: CaseStatus } | undefined;
    const sourceRef = `${notification.source.resourceType}:${notification.source.resourceId}`;
    const systemNote = `${notification.event.summary}${notification.event.detail ? ` — ${notification.event.detail}` : ""}`;
    const latest = this.db.prepare("SELECT occurred_at FROM workflow_events WHERE case_id = ? ORDER BY occurred_at DESC LIMIT 1")
      .get(caseId) as { occurred_at: string } | undefined;
    if (currentRow && latest && Date.parse(notification.event.occurredAt) < Date.parse(latest.occurred_at)) {
      this.insertSystemMessage(caseId, `${systemNote} (older source event recorded; case state unchanged)`, now);
      return this.getCase(caseId);
    }
    const settledHumanStatuses: CaseStatus[] = ["rejected", "deferred", "revision_requested", "escalated", "withdrawn"];
    if (currentRow && settledHumanStatuses.includes(currentRow.status)
      && currentRow.source_revision === notification.source.revision && steering.state === "open") {
      this.insertSystemMessage(caseId, `${systemNote} (the unchanged proposal remains ${currentRow.status})`, now);
      return this.getCase(caseId);
    }

    if (!currentRow && steering.state !== "open") {
      return this.createCase({
        id: caseId, kind: steering.kind ?? "decision", title: steering.title ?? notification.event.summary,
        sourceProduct: notification.source.product, sourceRef, sourceRevision: notification.source.revision,
        action: steering.action ?? notification.event.type, reason: steering.reason ?? notification.event.summary,
        summary: notification.event.detail ?? notification.event.summary,
        proposedAction: steering.proposedAction ?? "No action remains available.",
        recommendation: steering.recommendation ?? "Review the source event for context.",
        risk: "unassessed", reversible: steering.reversible ?? true,
        evidence: steering.evidence ?? sourceEvidence(notification), choices: [], facts: steering.facts ?? {},
        createdAt: notification.event.occurredAt, initialStatus: "withdrawn",
        applicationSummary: systemNote,
      });
    }

    if (!currentRow) {
      const created = this.createCase({
        id: caseId, kind: steering.kind ?? "decision", title: steering.title ?? notification.event.summary,
        sourceProduct: notification.source.product, sourceRef, sourceRevision: notification.source.revision,
        action: steering.action ?? notification.event.type, reason: steering.reason ?? notification.event.summary,
        summary: notification.event.detail ?? notification.event.summary,
        proposedAction: steering.proposedAction ?? "Choose how this workflow should proceed.",
        recommendation: steering.recommendation ?? "Inspect the source context before deciding.",
        risk: "unassessed", reversible: steering.reversible ?? false,
        evidence: steering.evidence ?? sourceEvidence(notification), choices: steering.choices ?? defaultChoices(),
        facts: { ...steering.facts, sourceNotification: true, sourceInstance: notification.source.instanceId ?? "default" }, createdAt: notification.event.occurredAt, initialStatus: "pending",
      });
      this.insertSystemMessage(caseId, systemNote, now);
      return this.getCase(created.id);
    }

    if (steering.state === "open") {
      const policy = evaluatePolicy({
        action: steering.action ?? notification.event.type,
        risk: "unassessed",
        reversible: steering.reversible ?? false,
        facts: steering.facts ?? {},
      });
      this.db.prepare(`
        UPDATE steering_cases SET kind=?, title=?, source_ref=?, source_revision=?, action=?, reason=?, summary=?,
          proposed_action=?, recommendation=?, risk=?, reversible=?, evidence_json=?, choices_json=?, facts_json=?,
          policy_id=?, policy_version=?, policy_outcome=?, policy_explanation=?, status='pending', resolution=NULL,
          rationale=NULL, resolved_by_json=NULL, application_summary=NULL, decision_id=NULL,
          decision_delivery_status=NULL, decision_delivery_summary=NULL, decision_delivered_at=NULL,
          updated_at=?, resolved_at=NULL, applied_at=NULL
        WHERE id=?
      `).run(
        steering.kind ?? "decision", steering.title ?? notification.event.summary, sourceRef, notification.source.revision,
        steering.action ?? notification.event.type, steering.reason ?? notification.event.summary,
        notification.event.detail ?? notification.event.summary,
        steering.proposedAction ?? "Choose how this workflow should proceed.",
        steering.recommendation ?? "Inspect the source context before deciding.", "unassessed",
        steering.reversible === true ? 1 : 0, JSON.stringify(steering.evidence ?? sourceEvidence(notification)),
        JSON.stringify(steering.choices ?? defaultChoices()), JSON.stringify({ ...steering.facts, sourceNotification: true, sourceInstance: notification.source.instanceId ?? "default" }),
        policy.policyId, policy.policyVersion, policy.outcome, policy.explanation, now, caseId,
      );
    } else {
      const status: CaseStatus = steering.state === "resolved" ? "applied" : steering.state === "superseded" ? "stale" : "withdrawn";
      this.db.prepare(`UPDATE steering_cases SET source_revision=?, status=?, application_summary=?, updated_at=?, resolved_at=? WHERE id=?`)
        .run(notification.source.revision, status, systemNote, now, now, caseId);
    }
    this.insertSystemMessage(caseId, systemNote, now);
    return this.getCase(caseId);
  }

  private insertSystemMessage(caseId: string, body: string, createdAt: string): void {
    this.db.prepare("INSERT INTO case_messages (case_id, body, author_json, created_at) VALUES (?, ?, ?, ?)")
      .run(caseId, body, JSON.stringify(steeringService), createdAt);
  }
}

function sourceEvidence(notification: WorkflowNotification): EvidenceLink[] {
  return [{ label: "Source event", detail: `${notification.event.type} at ${notification.event.occurredAt}`, url: notification.source.url }];
}

function defaultChoices(): CaseChoice[] {
  return [
    { id: "approve", label: "Approve", consequence: "Record approval for the source workflow.", tone: "primary" },
    { id: "reject", label: "Reject", consequence: "Reject the proposed transition.", tone: "danger" },
    { id: "defer", label: "Decide later", consequence: "Keep the case waiting for a later decision." },
  ];
}

function mapCase(row: CaseRow): SteeringCase {
  return {
    id: String(row.id),
    kind: row.kind as CaseKind,
    title: String(row.title),
    sourceProduct: String(row.source_product),
    sourceRef: String(row.source_ref),
    sourceRevision: String(row.source_revision),
    action: String(row.action),
    reason: String(row.reason),
    summary: String(row.summary),
    proposedAction: String(row.proposed_action),
    recommendation: String(row.recommendation),
    risk: row.risk as RiskLevel,
    reversible: Boolean(row.reversible),
    evidence: parseJson<EvidenceLink[]>(row.evidence_json, []),
    choices: parseJson<CaseChoice[]>(row.choices_json, []),
    facts: parseJson<PolicyFacts>(row.facts_json, {}),
    policy: {
      policyId: String(row.policy_id),
      policyVersion: String(row.policy_version),
      outcome: row.policy_outcome as SteeringCase["policy"]["outcome"],
      explanation: String(row.policy_explanation),
    },
    status: row.status as CaseStatus,
    resolution: nullable(row.resolution) as Resolution | undefined,
    rationale: nullable(row.rationale),
    resolvedBy: row.resolved_by_json
      ? parseJson<SteeringActor>(row.resolved_by_json, steeringService)
      : undefined,
    decisionId: nullable(row.decision_id),
    decisionDeliveryStatus: nullable(row.decision_delivery_status) as SteeringCase["decisionDeliveryStatus"],
    decisionDeliverySummary: nullable(row.decision_delivery_summary),
    decisionDeliveredAt: nullable(row.decision_delivered_at),
    applicationSummary: nullable(row.application_summary),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: nullable(row.resolved_at),
    appliedAt: nullable(row.applied_at),
    messageCount: Number(row.message_count ?? 0),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function nullable(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
