import type {
  SteeringActionReceipt,
  SteeringActionRequest,
  SteeringCase,
  SteeringDecisionNotice,
  SteeringDecisionReceipt,
  WorkflowProduct,
} from "./types.js";

export interface ActionDispatcher {
  invoke(item: SteeringCase, decisionId: string): Promise<SteeringActionReceipt>;
  notifyDecision(item: SteeringCase, decisionId: string): Promise<SteeringDecisionReceipt>;
}

interface Destination {
  baseUrl?: string;
  token?: string;
  trustedOrigins: Set<string>;
  instanceId: string;
}

const actionContracts: Record<WorkflowProduct, { actionKey: string; resourceType: string }> = {
  prelude: { actionKey: "prelude.package_accepted_export", resourceType: "inception" },
  helix: { actionKey: "helix.recover_run", resourceType: "run" },
  "acme-issues": { actionKey: "issues.trigger_implementation", resourceType: "issue" },
  "acme-projects": { actionKey: "projects.submit_ready_card", resourceType: "card" },
};

const receiptStatuses = new Set<SteeringActionReceipt["status"]>([
  "applied", "already_applied", "accepted", "stale", "rejected", "unavailable",
]);
const decisionReceiptStatuses = new Set<SteeringDecisionReceipt["status"]>([
  "recorded", "already_recorded", "stale", "rejected", "unavailable",
]);

export function createActionDispatcher(fetchFn: typeof fetch = fetch): ActionDispatcher {
  return {
    async invoke(item, decisionId) {
      if (!isWorkflowProduct(item.sourceProduct)) {
        return unavailable(item, decisionId, `Source product ${item.sourceProduct} has no configured action contract.`);
      }
      const contract = actionContracts[item.sourceProduct];
      const split = item.sourceRef.indexOf(":");
      if (split < 1) return unavailable(item, decisionId, "The source resource reference is invalid.");
      const resourceType = item.sourceRef.slice(0, split);
      if (item.action !== contract.actionKey || resourceType !== contract.resourceType) {
        return unavailable(item, decisionId, "The proposed action does not match the source product's allowlisted contract.");
      }
      const destination = destinationFor(item.sourceProduct);
      const sourceInstance = typeof item.facts.sourceInstance === "string" ? item.facts.sourceInstance : "default";
      if (sourceInstance !== destination.instanceId) {
        return unavailable(item, decisionId, `Source instance ${sourceInstance} is not the configured ${destination.instanceId} destination.`);
      }
      if (!destination.baseUrl) return unavailable(item, decisionId, "No action destination is configured for this source product.");
      let endpoint: URL;
      try {
        endpoint = new URL("/api/steering/actions", destination.baseUrl);
      } catch {
        return unavailable(item, decisionId, "The configured action destination URL is invalid.");
      }
      const token = destination.token?.trim();
      if (token && !destination.trustedOrigins.has(endpoint.origin)) {
        return unavailable(item, decisionId, "The action destination origin is not trusted for its configured credential.");
      }
      const requestId = `${item.id}:${item.sourceRevision}:${decisionId}`;
      const request: SteeringActionRequest = {
        schemaVersion: "acme.steering.action.v1",
        requestId,
        caseId: item.id,
        decisionId,
        actionKey: item.action,
        resource: {
          type: resourceType,
          id: item.sourceRef.slice(split + 1),
          expectedRevision: item.sourceRevision,
        },
      };
      try {
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(5_000),
        });
        const body = await response.json().catch(() => undefined) as Partial<SteeringActionReceipt> | undefined;
        if (!validReceipt(body, requestId)) {
          return unavailable(item, decisionId, `The source returned an invalid action receipt (${response.status}).`);
        }
        return body;
      } catch (error) {
        return unavailable(item, decisionId, `Action outcome is unknown: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    async notifyDecision(item, decisionId) {
      const prepared = prepare(item, decisionId, "/api/steering/decisions");
      if ("receipt" in prepared) return decisionUnavailable(item, decisionId, prepared.receipt.summary);
      if (!item.resolution || !item.resolvedBy || !item.resolvedAt) {
        return decisionUnavailable(item, decisionId, "The Steering decision is incomplete and cannot be delivered.");
      }
      const notice: SteeringDecisionNotice = {
        schemaVersion: "acme.steering.decision.v1",
        decisionId,
        caseId: item.id,
        actionKey: item.action,
        resolution: item.resolution,
        rationale: item.rationale ?? "",
        decidedAt: item.resolvedAt,
        actor: {
          id: item.resolvedBy.id,
          issuer: item.resolvedBy.issuer,
          username: item.resolvedBy.username,
          displayName: item.resolvedBy.displayName,
          kind: item.resolvedBy.kind,
        },
        resource: prepared.resource,
      };
      try {
        const response = await fetchFn(prepared.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...(prepared.token ? { authorization: `Bearer ${prepared.token}` } : {}) },
          body: JSON.stringify(notice),
          signal: AbortSignal.timeout(5_000),
        });
        const body = await response.json().catch(() => undefined) as Partial<SteeringDecisionReceipt> | undefined;
        if (!validDecisionReceipt(body, decisionId)) {
          return decisionUnavailable(item, decisionId, `The source returned an invalid decision receipt (${response.status}).`);
        }
        return body;
      } catch (error) {
        return decisionUnavailable(item, decisionId, `Decision delivery outcome is unknown: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

function prepare(item: SteeringCase, decisionId: string, path: string): {
  endpoint: URL; token?: string; resource: { type: string; id: string; expectedRevision: string };
} | { receipt: SteeringActionReceipt } {
  if (!isWorkflowProduct(item.sourceProduct)) return { receipt: unavailable(item, decisionId, `Source product ${item.sourceProduct} has no configured action contract.`) };
  const contract = actionContracts[item.sourceProduct];
  const split = item.sourceRef.indexOf(":");
  if (split < 1) return { receipt: unavailable(item, decisionId, "The source resource reference is invalid.") };
  const resourceType = item.sourceRef.slice(0, split);
  if (item.action !== contract.actionKey || resourceType !== contract.resourceType) {
    return { receipt: unavailable(item, decisionId, "The proposed action does not match the source product's allowlisted contract.") };
  }
  const destination = destinationFor(item.sourceProduct);
  const sourceInstance = typeof item.facts.sourceInstance === "string" ? item.facts.sourceInstance : "default";
  if (sourceInstance !== destination.instanceId) return { receipt: unavailable(item, decisionId, `Source instance ${sourceInstance} is not the configured ${destination.instanceId} destination.`) };
  if (!destination.baseUrl) return { receipt: unavailable(item, decisionId, "No destination is configured for this source product.") };
  let endpoint: URL;
  try { endpoint = new URL(path, destination.baseUrl); } catch { return { receipt: unavailable(item, decisionId, "The configured source destination URL is invalid.") }; }
  const token = destination.token?.trim();
  if (token && !destination.trustedOrigins.has(endpoint.origin)) return { receipt: unavailable(item, decisionId, "The source destination origin is not trusted for its configured credential.") };
  return { endpoint, token, resource: { type: resourceType, id: item.sourceRef.slice(split + 1), expectedRevision: item.sourceRevision } };
}

function isWorkflowProduct(value: string): value is WorkflowProduct {
  return value === "prelude" || value === "helix" || value === "acme-issues" || value === "acme-projects";
}

function validReceipt(value: Partial<SteeringActionReceipt> | undefined, requestId: string): value is SteeringActionReceipt {
  return value?.schemaVersion === "acme.steering.action-receipt.v1"
    && value.requestId === requestId
    && receiptStatuses.has(value.status as SteeringActionReceipt["status"])
    && typeof value.sourceRevision === "string"
    && value.sourceRevision.trim().length > 0
    && typeof value.summary === "string"
    && value.summary.trim().length > 0
    && (value.eventId === undefined || typeof value.eventId === "string")
    && (value.operationId === undefined || typeof value.operationId === "string");
}

function validDecisionReceipt(value: Partial<SteeringDecisionReceipt> | undefined, decisionId: string): value is SteeringDecisionReceipt {
  return value?.schemaVersion === "acme.steering.decision-receipt.v1"
    && value.decisionId === decisionId
    && decisionReceiptStatuses.has(value.status as SteeringDecisionReceipt["status"])
    && typeof value.sourceRevision === "string" && value.sourceRevision.trim().length > 0
    && typeof value.summary === "string" && value.summary.trim().length > 0;
}

function destinationFor(product: WorkflowProduct): Destination {
  const prefix = product === "prelude" ? "PRELUDE"
    : product === "helix" ? "HELIX"
      : product === "acme-issues" ? "ISSUES" : "PROJECTS";
  return {
    baseUrl: process.env[`ACME_STEERING_${prefix}_URL`],
    token: process.env[`ACME_STEERING_${prefix}_TOKEN`],
    trustedOrigins: new Set((process.env[`ACME_STEERING_TRUSTED_${prefix}_ORIGINS`] ?? "")
      .split(",").map((item) => item.trim()).filter(Boolean)),
    instanceId: process.env[`ACME_STEERING_${prefix}_INSTANCE_ID`] ?? "default",
  };
}

function unavailable(item: SteeringCase, decisionId: string, summary: string): SteeringActionReceipt {
  return {
    schemaVersion: "acme.steering.action-receipt.v1",
    requestId: `${item.id}:${item.sourceRevision}:${decisionId}`,
    status: "unavailable",
    sourceRevision: item.sourceRevision,
    summary,
  };
}

function decisionUnavailable(item: SteeringCase, decisionId: string, summary: string): SteeringDecisionReceipt {
  return { schemaVersion: "acme.steering.decision-receipt.v1", decisionId, status: "unavailable", sourceRevision: item.sourceRevision, summary };
}
