import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openDatabase } from "../src/db.js";
import { seedFixtures } from "../src/fixtures.js";
import { StaleCaseError, SteeringStore } from "../src/store.js";
import type { SteeringActor } from "../src/types.js";

const admin: SteeringActor = {
  id: "test:admin",
  issuer: "test",
  username: "admin",
  displayName: "Test administrator",
  roles: ["admin"],
  permissions: ["*"],
  kind: "development",
};

describe("steering store", () => {
  it("seeds attention, automated, and historical cases", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    seedFixtures(store);
    assert.deepEqual(store.summary(), { attention: 3, automated: 1, history: 1 });
    assert.equal(store.getCase("case-package-export").resolvedBy?.kind, "service");
    db.close();
  });

  it("keeps discussion separate from authorization and applies explicit approval", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    seedFixtures(store);
    const discussed = store.addMessage("case-start-implementation", "Capacity is available.", admin);
    assert.equal(discussed.status, "pending");
    assert.equal(discussed.messages.length, 2);

    const resolved = store.resolveCase({
      caseId: discussed.id,
      resolution: "approve",
      rationale: "Proceed within the accepted issue scope.",
      expectedRevision: discussed.sourceRevision,
      actor: admin,
    });
    assert.equal(resolved.status, "applied");
    assert.equal(resolved.resolvedBy?.id, admin.id);
    assert.match(resolved.applicationSummary ?? "", /human-authorized/);
    db.close();
  });

  it("marks a decision stale rather than applying against a changed revision", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    seedFixtures(store);
    assert.throws(() => store.resolveCase({
      caseId: "case-start-implementation",
      resolution: "approve",
      rationale: "",
      expectedRevision: "old-revision",
      actor: admin,
    }), StaleCaseError);
    assert.equal(store.getCase("case-start-implementation").status, "stale");
    db.close();
  });

  it("persists decisions and discussion across database restarts", () => {
    const path = join(mkdtempSync(join(tmpdir(), "acme-steering-")), "steering.db");
    let db = openDatabase(path);
    let store = new SteeringStore(db);
    seedFixtures(store);
    store.addMessage("case-clarify-target", "Use billing-api.", admin);
    store.resolveCase({
      caseId: "case-clarify-target",
      resolution: "request_revision",
      rationale: "Set billing-api as the explicit target.",
      expectedRevision: "bootstrap-v1",
      actor: admin,
    });
    db.close();

    db = openDatabase(path);
    store = new SteeringStore(db);
    const restored = store.getCase("case-clarify-target");
    assert.equal(restored.status, "revision_requested");
    assert.equal(restored.messages.at(-1)?.body, "Use billing-api.");
    db.close();
  });

  it("deduplicates workflow events and reconciles direct source actions", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    const opened = store.ingestNotification(notification("ready", "open", "1"));
    assert.equal(opened.duplicate, false);
    assert.equal(opened.case?.status, "pending");
    assert.equal(store.ingestNotification(notification("ready", "open", "1")).duplicate, true);

    const approved = store.resolveCase({
      caseId: "acme-projects:card:7:submit-issue",
      resolution: "approve",
      rationale: "Ready for implementation.",
      expectedRevision: "1",
      actor: admin,
    });
    assert.equal(approved.status, "awaiting_source");

    const resolved = store.ingestNotification(notification("submitted", "resolved", "2"));
    assert.equal(resolved.case?.status, "applied");
    assert.match(resolved.case?.messages.at(-1)?.body ?? "", /submitted/i);
    const delayed = store.ingestNotification(notification("late-ready", "open", "1.5"));
    assert.equal(delayed.case?.status, "applied");
    assert.match(delayed.case?.messages.at(-1)?.body ?? "", /state unchanged/);
    assert.equal(store.listWorkflowEvents().length, 3);
    db.close();
  });

  for (const [resolution, status] of [
    ["reject", "rejected"],
    ["defer", "deferred"],
    ["request_revision", "revision_requested"],
    ["escalate", "escalated"],
  ] as const) {
    it(`does not reopen an unchanged proposal after ${resolution}`, () => {
      const db = openDatabase(":memory:");
      const store = new SteeringStore(db);
      const opened = store.ingestNotification(notification("ready", "open", "1")).case!;
      store.resolveCase({ caseId: opened.id, resolution, rationale: "Human decision.", expectedRevision: "1", actor: admin });
      const repeated = notification("ready-again", "open", "1");
      repeated.id = `projects:7:ready-again:${resolution}:same-revision`;
      const result = store.ingestNotification(repeated);
      assert.equal(result.case?.status, status);
      assert.match(result.case?.messages.at(-1)?.body ?? "", new RegExp(`remains ${status}`));
      db.close();
    });
  }

  it("reopens a human-resolved case only when the source revision changes", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    const opened = store.ingestNotification(notification("ready", "open", "1")).case!;
    const decided = store.resolveCase({
      caseId: opened.id, resolution: "request_revision", rationale: "Clarify scope.", expectedRevision: "1",
      decisionId: "decision-1", actor: admin,
    });
    store.recordDecisionReceipt(decided.id, {
      schemaVersion: "acme.steering.decision-receipt.v1", decisionId: "decision-1", status: "recorded",
      sourceRevision: "1", summary: "Recorded.",
    });

    const revised = notification("revised", "open", "2");
    revised.id = "projects:7:revised:2";
    const result = store.ingestNotification(revised).case!;
    assert.equal(result.status, "pending");
    assert.equal(result.sourceRevision, "2");
    assert.equal(result.decisionId, undefined);
    assert.equal(result.decisionDeliveryStatus, undefined);
    db.close();
  });

  it("keeps an unknown action outcome in the attention inbox until a source event reconciles it", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    const opened = store.ingestNotification(notification("ready", "open", "1")).case!;
    const approved = store.resolveCase({
      caseId: opened.id, resolution: "approve", rationale: "Proceed.", expectedRevision: "1", actor: admin,
    });
    store.recordActionReceipt(opened.id, {
      schemaVersion: "acme.steering.action-receipt.v1",
      requestId: "request-1",
      status: "unavailable",
      sourceRevision: "1",
      summary: "The request timed out after dispatch.",
    });
    assert.equal(approved.status, "awaiting_source");
    assert.equal(store.getCase(opened.id).status, "outcome_unknown");
    assert.equal(store.listCases("attention").some((item) => item.id === opened.id), true);
    db.close();
  });
});

function notification(type: string, state: "open" | "resolved", revision: string) {
  return {
    schemaVersion: "acme.steering.notification.v1" as const,
    id: `projects:7:${type}:${revision}`,
    source: { product: "acme-projects" as const, resourceType: "card", resourceId: "7", revision },
    event: { type: `card.${type}`, occurredAt: new Date(Number(revision) * 1_000).toISOString(), summary: `Card ${type}` },
    steering: { caseKey: "card:7:submit-issue", state, action: "projects.submit_ready_card" },
  };
}
