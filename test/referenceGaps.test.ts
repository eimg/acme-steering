import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createStandaloneAuthAdapter } from "../src/auth.js";
import { draftOf } from "../src/configStore.js";
import { openDatabase } from "../src/db.js";
import { seedFixtures } from "../src/fixtures.js";
import { assessNotificationRisk } from "../src/risk.js";
import { SteeringStore } from "../src/store.js";
import type { ActionDispatcher } from "../src/actions.js";
import type { SteeringActor, WorkflowNotification } from "../src/types.js";

const admin: SteeringActor = {
  id: "test:admin", issuer: "test", username: "admin", displayName: "Test administrator",
  roles: ["admin"], permissions: ["*"], kind: "development",
};

describe("reference architecture completion slices", () => {
  it("assigns risk in Steering rather than trusting a source label", () => {
    const payload = preludeAcceptedNotification();
    assert.ok(payload.steering);
    payload.steering.risk = "high";
    const assessment = assessNotificationRisk(payload);
    assert.equal(assessment.level, "low");
    assert.equal(assessment.classifierId, "steering.reference-impact");
  });

  it("previews policy changes against current cases without activating them", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter() });
    const current = await request(app).get("/api/policy-config").expect(200);
    const draft = draftOf(current.body.active);
    draft.defaultOutcome = "defer";
    draft.defaultExplanation = "Preview a deferred default.";
    const preview = await request(app).post("/api/policy-config/preview").send({ config: draft }).expect(200);
    assert.equal(preview.body.evaluatedCases, 5);
    assert.ok(preview.body.changedCases >= 1);
    const unchanged = await request(app).get("/api/policy-config").expect(200);
    assert.equal(unchanged.body.active.version, current.body.active.version);
    db.close();
  });

  it("runs the accepted Prelude export loop under the Steering service principal", async () => {
    const db = openDatabase(":memory:");
    const calls: string[] = [];
    const dispatcher: ActionDispatcher = {
      async notifyDecision(item, decisionId) {
        calls.push(`decision:${item.resolvedBy?.kind}:${item.policy.policyId}`);
        return { schemaVersion: "acme.steering.decision-receipt.v1", decisionId, status: "recorded", sourceRevision: item.sourceRevision, summary: "Prelude recorded automatic delegation." };
      },
      async invoke(item, decisionId) {
        calls.push(`action:${item.action}`);
        return { schemaVersion: "acme.steering.action-receipt.v1", requestId: `${item.id}:${item.sourceRevision}:${decisionId}`, status: "applied", sourceRevision: "2", summary: "Prelude exported the accepted package." };
      },
    };
    const app = await createApp({ db, seed: false, authAdapter: createStandaloneAuthAdapter(), actionDispatcher: dispatcher });
    const response = await request(app).post("/api/notifications").send(preludeAcceptedNotification()).expect(202);
    assert.equal(response.body.automated, true);
    assert.equal(response.body.case.status, "applied");
    assert.equal(response.body.case.risk, "low");
    assert.equal(response.body.case.resolvedBy.kind, "service");
    assert.deepEqual(calls, ["decision:service:accepted-export-packaging", "action:prelude.package_accepted_export"]);
    const detail = await request(app).get(`/api/cases/${encodeURIComponent(response.body.case.id)}`).expect(200);
    assert.deepEqual(detail.body.attempts.map((item: { kind: string }) => item.kind), [
      "automatic_authorization", "decision_delivery", "action_invocation",
    ]);
    db.close();
  });

  it("opens a capability-routed escalation with remain-paused fallback and closes it on resolution", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    seedFixtures(store);
    const item = store.getCase("case-clarify-target");
    const escalated = store.resolveCase({
      caseId: item.id, resolution: "escalate", rationale: "A qualified owner must select the target.",
      expectedRevision: item.sourceRevision, actor: admin,
    });
    assert.equal(escalated.status, "escalated");
    assert.equal(escalated.escalations[0]?.requiredPermission, "steering.decide");
    assert.equal(escalated.escalations[0]?.fallback, "remain_paused");
    assert.equal(escalated.attempts.at(-1)?.kind, "escalation");
    const resolved = store.resolveCase({
      caseId: item.id, resolution: "approve", rationale: "Qualified owner selected the target.",
      expectedRevision: item.sourceRevision, actor: admin,
    });
    assert.equal(resolved.escalations[0]?.status, "closed");
    db.close();
  });

  it("does not let a workflow notification choose its Steering escalation authority", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    const notification = preludeAcceptedNotification();
    notification.id = "prelude:inception:2:review:1";
    notification.source.resourceId = "2";
    notification.steering!.caseKey = "inception:2:review";
    notification.steering!.action = "prelude.review_exception";
    notification.steering!.facts = { escalationPermission: "source.chosen.permission" };
    const item = store.ingestNotification(notification).case!;
    const escalated = store.resolveCase({
      caseId: item.id, resolution: "escalate", rationale: "Route through Steering authority.",
      expectedRevision: item.sourceRevision, actor: admin,
    });
    assert.equal(escalated.escalations[0]?.requiredPermission, "steering.decide");
    db.close();
  });
});

function preludeAcceptedNotification(): WorkflowNotification {
  return {
    schemaVersion: "acme.steering.notification.v1" as const,
    id: "prelude:inception:1:accepted:1",
    source: { product: "prelude" as const, resourceType: "inception", resourceId: "1", revision: "1" },
    event: { type: "inception.accepted", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Inception accepted" },
    steering: {
      caseKey: "inception:1:export", state: "open" as const, action: "prelude.package_accepted_export",
      reversible: true, facts: { accepted: true }, risk: "low" as const,
    },
  };
}
