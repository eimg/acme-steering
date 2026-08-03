import express, { type Express } from "express";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  authenticateRequests,
  createAuthAdapterFromEnv,
  hasActorPermission,
  principalFrom,
  requirePermission,
  sameOriginWrites,
  sessionRoutes,
  type SteeringAuthAdapter,
} from "./auth.js";
import { seedFixtures } from "./fixtures.js";
import {
  CaseConflictError,
  CaseNotFoundError,
  StaleCaseError,
  SteeringStore,
} from "./store.js";
import type { CaseView, Resolution, WorkflowNotification } from "./types.js";
import { webAssets, webIndex } from "./webAssets.js";
import { createActionDispatcher, type ActionDispatcher } from "./actions.js";
import {
  createDefaultConfigAgent,
  resolveConfigAgentMode,
  resolveConfigAgentModel,
  type ConfigAgent,
} from "./configAgent.js";
import {
  ConfigAgentService,
  ConfigAgentSessionConflictError,
  ConfigAgentSessionNotFoundError,
} from "./configAgentService.js";
import {
  PolicyConfigConflictError,
  PolicyConfigStore,
  PolicyConfigValidationError,
} from "./configStore.js";
import {
  caseAdvisorActor,
  createDefaultCaseAdvisor,
  resolveCaseAdvisorMode,
  resolveCaseAdvisorModel,
  type CaseAdvisor,
} from "./caseAdvisor.js";
import { previewPolicyChange } from "./policyPreview.js";

const views = new Set<CaseView>(["attention", "automated", "history"]);
const resolutions = new Set<Resolution>([
  "approve",
  "reject",
  "request_revision",
  "defer",
  "escalate",
  "cancel",
]);

export interface AppContext {
  db: Database.Database;
  authAdapter?: SteeringAuthAdapter;
  seed?: boolean;
  actionDispatcher?: ActionDispatcher;
  createConfigAgent?: () => ConfigAgent;
  createCaseAdvisor?: () => CaseAdvisor;
}

export async function createApp(context: AppContext): Promise<Express> {
  const app = express();
  const store = new SteeringStore(context.db);
  const auth = context.authAdapter ?? createAuthAdapterFromEnv();
  const actionDispatcher = context.actionDispatcher ?? createActionDispatcher();
  const policyConfigs = new PolicyConfigStore(context.db);
  const configAgent = new ConfigAgentService(context.db, context.createConfigAgent ?? createDefaultConfigAgent);
  const createCaseAdvisor = context.createCaseAdvisor ?? createDefaultCaseAdvisor;
  if (context.seed !== false) seedFixtures(store);

  app.use(express.json({ limit: "64kb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    next();
  });
  app.use("/api", sameOriginWrites());

  app.get("/health", (_req, res) => res.json({ ok: true, product: "acme-steering" }));
  app.get("/api/health", (_req, res) => res.json({
    ok: true,
    product: "acme-steering",
    schemaVersion: 1,
    authMode: auth.mode,
  }));
  app.get("/api/config", (_req, res) => res.json({
    product: "Acme Steering",
    authMode: auth.mode,
    provider: auth.provider,
    advisorEnabled: true,
    advisorMode: resolveCaseAdvisorMode(),
    advisorModel: resolveCaseAdvisorMode() === "openrouter" ? resolveCaseAdvisorModel() : undefined,
    configAgentMode: resolveConfigAgentMode(),
    configAgentModel: resolveConfigAgentMode() === "openrouter" ? resolveConfigAgentModel() : undefined,
    fixtureMode: true,
  }));
  sessionRoutes(app, auth);

  const authenticate = authenticateRequests(auth);
  app.get(
    "/api/policy-config",
    authenticate,
    requirePermission("steering.read"),
    (_req, res) => res.json({ active: policyConfigs.active(), history: policyConfigs.history() }),
  );
  app.post(
    "/api/policy-config/preview",
    authenticate,
    requirePermission("steering.manage"),
    (req, res) => {
      try { res.json(previewPolicyChange(req.body?.config, policyConfigs, store)); }
      catch (error) { sendConfigError(res, error); }
    },
  );
  app.post(
    "/api/policy-config/activate",
    authenticate,
    requirePermission("steering.manage"),
    (req, res) => {
      try {
        res.status(201).json(policyConfigs.activate({
          draft: req.body?.config,
          expectedVersion: Number(req.body?.expectedVersion),
          actor: principalFrom(res)!,
          changeSummary: text(req.body?.changeSummary) ?? "",
        }));
      } catch (error) {
        sendConfigError(res, error);
      }
    },
  );
  app.post(
    "/api/config-agent/sessions",
    authenticate,
    requirePermission("steering.manage"),
    async (req, res) => {
      const prompt = text(req.body?.prompt);
      if (!prompt) return res.status(400).json({ error: "prompt is required" });
      if (prompt.length > 4_000) return res.status(400).json({ error: "prompt must be 4000 characters or fewer" });
      res.status(201).json(await configAgent.start(prompt));
    },
  );
  app.get(
    "/api/config-agent/sessions/:id",
    authenticate,
    requirePermission("steering.manage"),
    (req, res) => {
      try { res.json(configAgent.get(String(req.params.id))); }
      catch (error) { sendConfigError(res, error); }
    },
  );
  app.post(
    "/api/config-agent/sessions/:id/messages",
    authenticate,
    requirePermission("steering.manage"),
    async (req, res) => {
      const prompt = text(req.body?.prompt);
      if (!prompt) return res.status(400).json({ error: "prompt is required" });
      if (prompt.length > 4_000) return res.status(400).json({ error: "prompt must be 4000 characters or fewer" });
      try { res.json(await configAgent.turn(String(req.params.id), prompt)); }
      catch (error) { sendConfigError(res, error); }
    },
  );
  app.post(
    "/api/config-agent/sessions/:id/activate",
    authenticate,
    requirePermission("steering.manage"),
    (req, res) => {
      try {
        const session = configAgent.get(String(req.params.id));
        if (!session.proposedConfig) throw new ConfigAgentSessionConflictError("This session has no proposed configuration");
        const active = policyConfigs.activate({
          draft: session.proposedConfig,
          expectedVersion: session.basedOnVersion,
          actor: principalFrom(res)!,
          changeSummary: session.proposalSummary ?? "Agent-assisted policy update.",
        });
        configAgent.markApplied(session.id);
        res.status(201).json({ active, session: configAgent.get(session.id) });
      } catch (error) {
        sendConfigError(res, error);
      }
    },
  );
  app.get(
    "/api/events",
    authenticate,
    requirePermission("steering.read"),
    (req, res) => res.json({ items: store.listWorkflowEvents(Number(req.query.limit ?? 100)) }),
  );
  app.post(
    "/api/notifications/check",
    authenticate,
    (req, res) => {
      const product = String(req.body?.product ?? "");
      if (!isNotificationProduct(product)) {
        return res.status(400).json({ error: "product must identify a supported workflow source" });
      }
      const permission = notificationPermission(product);
      if (!hasActorPermission(principalFrom(res)!, permission)) {
        return res.status(403).json({ error: `Missing permission: ${permission}` });
      }
      return res.json({ ok: true, product, permission });
    },
  );
  app.post(
    "/api/notifications",
    authenticate,
    async (req, res) => {
      const notification = parseNotification(req.body);
      if (!notification) return res.status(400).json({ error: "Invalid acme.steering.notification.v1 payload" });
      const permission = notificationPermission(notification.source.product);
      if (!hasActorPermission(principalFrom(res)!, permission)) {
        return res.status(403).json({ error: `Missing permission: ${permission}` });
      }
      const result = store.ingestNotification(notification);
      let automated = false;
      if (!result.duplicate && result.case?.policy.outcome === "automatic" && result.case.status === "pending") {
        const decisionId = randomUUID();
        let current = store.authorizeAutomatic(result.case.id, decisionId);
        const decisionReceipt = await actionDispatcher.notifyDecision(current, decisionId);
        current = store.recordDecisionReceipt(current.id, decisionReceipt);
        if (decisionReceipt.status === "recorded" || decisionReceipt.status === "already_recorded") {
          current = store.recordActionReceipt(current.id, await actionDispatcher.invoke(current, decisionId));
        } else {
          current = store.recordActionReceipt(current.id, {
            schemaVersion: "acme.steering.action-receipt.v1",
            requestId: `${current.id}:${current.sourceRevision}:${decisionId}`,
            status: "rejected",
            sourceRevision: current.sourceRevision,
            summary: "Automatic action was not invoked because the source did not record its delegation decision.",
          });
        }
        result.case = current;
        automated = true;
      }
      res.status(result.duplicate ? 200 : 202).json({ ok: true, automated, ...result });
    },
  );
  app.get(
    "/api/summary",
    authenticate,
    requirePermission("steering.read"),
    (_req, res) => res.json(store.summary()),
  );
  app.get(
    "/api/cases",
    authenticate,
    requirePermission("steering.read"),
    (req, res) => {
      const view = String(req.query.view ?? "attention") as CaseView;
      if (!views.has(view)) return res.status(400).json({ error: "Invalid case view" });
      res.json({ view, items: store.listCases(view) });
    },
  );
  app.get(
    "/api/cases/:id",
    authenticate,
    requirePermission("steering.read"),
    (req, res) => {
      try {
        res.json(store.getCase(String(req.params.id)));
      } catch (error) {
        sendStoreError(res, error);
      }
    },
  );
  app.post(
    "/api/cases/:id/messages",
    authenticate,
    requirePermission("steering.decide"),
    (req, res) => {
      const body = text(req.body?.body);
      if (!body) return res.status(400).json({ error: "body is required" });
      if (body.length > 2_000) return res.status(400).json({ error: "body must be 2000 characters or fewer" });
      try {
        res.status(201).json(store.addMessage(String(req.params.id), body, principalFrom(res)!));
      } catch (error) {
        sendStoreError(res, error);
      }
    },
  );
  app.post(
    "/api/cases/:id/advisor",
    authenticate,
    requirePermission("steering.decide"),
    async (req, res) => {
      const prompt = text(req.body?.prompt);
      if (!prompt) return res.status(400).json({ error: "prompt is required" });
      if (prompt.length > 2_000) return res.status(400).json({ error: "prompt must be 2000 characters or fewer" });
      try {
        const caseId = String(req.params.id);
        const before = store.getCase(caseId);
        const turn = await createCaseAdvisor().complete(prompt, before);
        const latest = store.getCase(caseId);
        if (latest.sourceRevision !== before.sourceRevision || latest.status !== before.status) {
          return res.status(409).json({ error: "The case changed while the advisor was responding; review the latest case and ask again." });
        }
        res.status(201).json(store.addMessages(caseId, [
          { body: prompt, author: principalFrom(res)! },
          { body: turn.message, author: caseAdvisorActor },
        ]));
      } catch (error) {
        sendStoreError(res, error);
      }
    },
  );
  app.post(
    "/api/cases/:id/resolve",
    authenticate,
    requirePermission("steering.decide"),
    async (req, res) => {
      const resolution = String(req.body?.resolution ?? "") as Resolution;
      const expectedRevision = text(req.body?.sourceRevision);
      const rationale = text(req.body?.rationale) ?? "";
      if (!resolutions.has(resolution)) return res.status(400).json({ error: "Invalid resolution" });
      if (!expectedRevision) return res.status(400).json({ error: "sourceRevision is required" });
      if (["reject", "request_revision", "escalate"].includes(resolution) && !rationale) {
        return res.status(400).json({ error: "rationale is required for this resolution" });
      }
      if (rationale.length > 2_000) return res.status(400).json({ error: "rationale must be 2000 characters or fewer" });
      try {
        const decisionId = randomUUID();
        let resolved = store.resolveCase({
          caseId: String(req.params.id),
          resolution,
          rationale,
          expectedRevision,
          actor: principalFrom(res)!,
          decisionId,
        });
        if (resolved.facts.sourceNotification === true) {
          resolved = store.recordDecisionReceipt(resolved.id, await actionDispatcher.notifyDecision(resolved, decisionId));
        }
        if (resolved.status === "awaiting_source" && resolution === "approve") {
          resolved = store.recordActionReceipt(resolved.id, await actionDispatcher.invoke(resolved, decisionId));
        }
        res.json(resolved);
      } catch (error) {
        sendStoreError(res, error);
      }
    },
  );
  app.post(
    "/api/cases/:id/redeliver-decision",
    authenticate,
    requirePermission("steering.decide"),
    async (req, res) => {
      try {
        const item = store.getCase(String(req.params.id));
        if (item.facts.sourceNotification !== true || !item.decisionId || !item.resolution) {
          return res.status(409).json({ error: "This case has no source-backed decision to deliver" });
        }
        if (item.decisionDeliveryStatus !== "unavailable") {
          return res.status(409).json({ error: `Decision delivery is ${item.decisionDeliveryStatus ?? "not pending"}; only unavailable delivery can be retried` });
        }
        const receipt = await actionDispatcher.notifyDecision(item, item.decisionId);
        res.json(store.recordDecisionReceipt(item.id, receipt));
      } catch (error) {
        sendStoreError(res, error);
      }
    },
  );

  app.use(webAssets());
  app.get("/{*path}", webIndex());
  return app;
}

function sendConfigError(res: express.Response, error: unknown): void {
  if (error instanceof PolicyConfigValidationError) {
    res.status(400).json({ error: error.message, errors: error.errors });
  } else if (error instanceof PolicyConfigConflictError || error instanceof ConfigAgentSessionConflictError) {
    res.status(409).json({ error: error.message });
  } else if (error instanceof ConfigAgentSessionNotFoundError) {
    res.status(404).json({ error: error.message });
  } else {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected config error" });
  }
}

function sendStoreError(res: express.Response, error: unknown): void {
  if (error instanceof CaseNotFoundError) {
    res.status(404).json({ error: error.message });
  } else if (error instanceof StaleCaseError) {
    res.status(409).json({ error: error.message, case: error.detail });
  } else if (error instanceof CaseConflictError) {
    res.status(409).json({ error: error.message });
  } else {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unexpected error" });
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseNotification(value: unknown): WorkflowNotification | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<WorkflowNotification>;
  if (item.schemaVersion !== "acme.steering.notification.v1" || !text(item.id)) return undefined;
  if (!item.source || !["prelude", "helix", "acme-issues", "acme-projects"].includes(String(item.source.product))) return undefined;
  if (!text(item.source.resourceType) || !text(item.source.resourceId) || !text(item.source.revision)) return undefined;
  if (item.source.instanceId !== undefined && !text(item.source.instanceId)) return undefined;
  if (item.source.url !== undefined && !safeHttpUrl(item.source.url)) return undefined;
  if (!item.event || !text(item.event.type) || !text(item.event.occurredAt) || !text(item.event.summary)) return undefined;
  if (Number.isNaN(Date.parse(item.event.occurredAt))) return undefined;
  if (item.steering) {
    if (!text(item.steering.caseKey) || item.steering.caseKey.length > 200
      || !["open", "resolved", "withdrawn", "superseded"].includes(item.steering.state)) return undefined;
    const contract = notificationContract(item.source.product);
    if (!contract || item.source.resourceType !== contract.resourceType || item.steering.action !== contract.actionKey) return undefined;
    if (item.steering.reversible !== undefined && typeof item.steering.reversible !== "boolean") return undefined;
    if (item.steering.risk !== undefined && !["unassessed", "low", "medium", "high"].includes(item.steering.risk)) return undefined;
    if (item.steering.facts !== undefined && !plainScalarRecord(item.steering.facts)) return undefined;
    if (item.steering.choices !== undefined && (!Array.isArray(item.steering.choices)
      || item.steering.choices.some((choice) => !choice || typeof choice !== "object"
        || !["approve", "reject", "request_revision", "defer", "escalate", "cancel"].includes(String(choice.id))
        || !text(choice.label) || !text(choice.consequence)))) return undefined;
    if (item.steering.evidence !== undefined && (!Array.isArray(item.steering.evidence)
      || item.steering.evidence.some((evidence) => !evidence || typeof evidence !== "object"
        || !text(evidence.label) || !text(evidence.detail)
        || (evidence.url !== undefined && !safeHttpUrl(evidence.url))))) return undefined;
  }
  return item as WorkflowNotification;
}

function notificationPermission(product: WorkflowNotification["source"]["product"]): string {
  return product === "prelude" ? "steering.notify.prelude"
    : product === "helix" ? "steering.notify.helix"
      : product === "acme-issues" ? "steering.notify.issues" : "steering.notify.projects";
}

function isNotificationProduct(value: string): value is WorkflowNotification["source"]["product"] {
  return ["prelude", "helix", "acme-issues", "acme-projects"].includes(value);
}

function notificationContract(product: WorkflowNotification["source"]["product"]): { actionKey: string; resourceType: string } {
  return product === "prelude" ? { actionKey: "prelude.package_accepted_export", resourceType: "inception" }
    : product === "helix" ? { actionKey: "helix.recover_run", resourceType: "run" }
      : product === "acme-issues" ? { actionKey: "issues.trigger_implementation", resourceType: "issue" }
        : { actionKey: "projects.submit_ready_card", resourceType: "card" };
}

function plainScalarRecord(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((item) => item === undefined
      || typeof item === "string" || typeof item === "number" || typeof item === "boolean");
}

function safeHttpUrl(value: unknown): boolean {
  if (!text(value)) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
