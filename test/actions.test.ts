import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { createActionDispatcher } from "../src/actions.js";
import type { SteeringCase } from "../src/types.js";

const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

it("dispatches an allowlisted action with a destination-bound service token", async () => {
  process.env.ACME_STEERING_PROJECTS_URL = "http://projects.test";
  process.env.ACME_STEERING_PROJECTS_TOKEN = "secret";
  process.env.ACME_STEERING_TRUSTED_PROJECTS_ORIGINS = "http://projects.test";
  const calls: Array<{ url: string; authorization?: string; body: Record<string, unknown> }> = [];
  const dispatcher = createActionDispatcher(async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { requestId: string };
    calls.push({ url: String(input), authorization: (init?.headers as Record<string, string>).authorization, body });
    return Response.json({
      schemaVersion: "acme.steering.action-receipt.v1", requestId: body.requestId,
      status: "applied", sourceRevision: "2", summary: "Applied",
    });
  });
  const receipt = await dispatcher.invoke(sourceCase(), "decision-1");
  assert.equal(receipt.status, "applied");
  assert.equal(calls[0].url, "http://projects.test/api/steering/actions");
  assert.equal(calls[0].authorization, "Bearer secret");
});

it("delivers the complete human decision on the separate decision endpoint", async () => {
  process.env.ACME_STEERING_PROJECTS_URL = "http://projects.test";
  process.env.ACME_STEERING_PROJECTS_TOKEN = "secret";
  process.env.ACME_STEERING_TRUSTED_PROJECTS_ORIGINS = "http://projects.test";
  let delivered: Record<string, unknown> | undefined;
  const dispatcher = createActionDispatcher(async (input, init) => {
    delivered = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      schemaVersion: "acme.steering.decision-receipt.v1", decisionId: delivered.decisionId,
      status: "recorded", sourceRevision: "1", summary: "Recorded",
    });
  });
  const item = {
    ...sourceCase(), resolution: "request_revision" as const, rationale: "Clarify the acceptance criteria.",
    resolvedBy: { id: "identity:admin", issuer: "acme-identity", username: "admin", displayName: "Administrator", roles: ["admin"], permissions: ["*"], kind: "human" as const },
    resolvedAt: "2026-08-03T00:01:00Z",
  };
  const receipt = await dispatcher.notifyDecision(item, "decision-1");
  assert.equal(receipt.status, "recorded");
  assert.equal((delivered?.resource as { expectedRevision: string }).expectedRevision, "1");
  assert.equal(delivered?.resolution, "request_revision");
  assert.equal(delivered?.rationale, "Clarify the acceptance criteria.");
});

it("refuses a mismatched instance or untrusted credential destination", async () => {
  process.env.ACME_STEERING_PROJECTS_URL = "http://projects.test";
  process.env.ACME_STEERING_PROJECTS_TOKEN = "secret";
  process.env.ACME_STEERING_TRUSTED_PROJECTS_ORIGINS = "http://elsewhere.test";
  let called = false;
  const dispatcher = createActionDispatcher(async () => { called = true; return Response.json({}); });
  assert.equal((await dispatcher.invoke(sourceCase(), "decision-1")).status, "unavailable");
  assert.equal(called, false);
});

it("fails closed for a non-allowlisted action or malformed source receipt", async () => {
  process.env.ACME_STEERING_PROJECTS_URL = "http://projects.test";
  let calls = 0;
  const dispatcher = createActionDispatcher(async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { requestId: string };
    return Response.json({ schemaVersion: "acme.steering.action-receipt.v1", requestId: body.requestId, status: "applied" });
  });
  const wrongAction = { ...sourceCase(), action: "projects.delete_card" };
  assert.equal((await dispatcher.invoke(wrongAction, "decision-1")).status, "unavailable");
  assert.equal(calls, 0);
  assert.equal((await dispatcher.invoke(sourceCase(), "decision-2")).status, "unavailable");
  assert.equal(calls, 1);
});

it("fails closed for a malformed decision receipt", async () => {
  process.env.ACME_STEERING_PROJECTS_URL = "http://projects.test";
  const dispatcher = createActionDispatcher(async () => Response.json({
    schemaVersion: "acme.steering.decision-receipt.v1", decisionId: "wrong", status: "recorded",
    sourceRevision: "1", summary: "Recorded",
  }));
  const item = {
    ...sourceCase(), resolution: "reject" as const, rationale: "Outside scope.",
    resolvedBy: { id: "identity:admin", issuer: "acme-identity", username: "admin", displayName: "Administrator", roles: ["admin"], permissions: ["*"], kind: "human" as const },
    resolvedAt: "2026-08-03T00:01:00Z",
  };
  assert.equal((await dispatcher.notifyDecision(item, "decision-1")).status, "unavailable");
});

function sourceCase(): SteeringCase {
  return {
    id: "acme-projects:card:1:submit", kind: "decision", title: "Submit", sourceProduct: "acme-projects",
    sourceRef: "card:1", sourceRevision: "1", action: "projects.submit_ready_card", reason: "Ready",
    summary: "Ready", proposedAction: "Submit", recommendation: "Submit", risk: "unassessed", reversible: true,
    evidence: [], choices: [], facts: { sourceNotification: true, sourceInstance: "default" },
    policy: { policyId: "safe-manual-default", policyVersion: "v1", outcome: "human_required", explanation: "Manual" },
    status: "awaiting_source", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z", messageCount: 0,
  };
}
