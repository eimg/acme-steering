import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createAcmeIdentityAuthAdapter, createStandaloneAuthAdapter } from "../src/auth.js";
import { openDatabase } from "../src/db.js";
import type { ActionDispatcher } from "../src/actions.js";

describe("steering HTTP API", () => {
  it("provides a testable admin operator in auth-off mode", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter() });
    const session = await request(app).get("/api/auth/session").expect(200);
    assert.equal(session.body.authMode, "off");
    assert.equal(session.body.capabilities.decide, true);
    await request(app).get("/api/cases?view=attention").expect(200).expect(({ body }) => {
      assert.equal(body.items.length, 3);
    });
    db.close();
  });

  it("requires Identity permissions in local mode without hardcoding a role", async () => {
    const adapter = createAcmeIdentityAuthAdapter({
      fetchFn: async () => identityResponse({ permissions: ["projects.write"] }),
    });
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: adapter });
    const session = await request(app).get("/api/auth/session").expect(200);
    assert.equal(session.body.capabilities.read, false);
    await request(app).get("/api/cases").expect(403);
    db.close();
  });

  it("allows the current Identity admin wildcard and proxies session cookies", async () => {
    const calls: Array<{ path: string; method: string }> = [];
    const adapter = createAcmeIdentityAuthAdapter({
      fetchFn: async (input, init) => {
        const url = new URL(String(input));
        calls.push({ path: url.pathname, method: init?.method ?? "GET" });
        if (url.pathname === "/api/session" && init?.method === "POST") {
          return new Response(JSON.stringify({ signedIn: true }), {
            status: 200,
            headers: { "content-type": "application/json", "set-cookie": "acme_session=test; Path=/; HttpOnly" },
          });
        }
        if (url.pathname === "/api/session" && init?.method === "DELETE") {
          return new Response(JSON.stringify({ signedOut: true }), {
            status: 200,
            headers: { "content-type": "application/json", "set-cookie": "acme_session=; Path=/; Max-Age=0" },
          });
        }
        return identityResponse({ permissions: ["*"] });
      },
    });
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: adapter });
    const session = await request(app).get("/api/auth/session").expect(200);
    assert.equal(session.body.capabilities.decide, true);
    const signIn = await request(app).post("/api/auth/session").send({ username: "admin", password: "test" }).expect(200);
    assert.match(signIn.headers["set-cookie"][0], /acme_session=test/);
    const signOut = await request(app).delete("/api/auth/session").expect(200);
    assert.match(signOut.headers["set-cookie"][0], /Max-Age=0/);
    assert.deepEqual(calls, [
      { path: "/api/principal", method: "GET" },
      { path: "/api/session", method: "POST" },
      { path: "/api/session", method: "DELETE" },
    ]);
    db.close();
  });

  it("fails closed when Identity is unavailable while health stays reachable", async () => {
    const adapter = createAcmeIdentityAuthAdapter({
      fetchFn: async () => { throw new Error("offline"); },
      timeoutMs: 10,
    });
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: adapter });
    await request(app).get("/health").expect(200);
    await request(app).get("/api/cases").expect(503);
    db.close();
  });

  it("validates decisions, blocks cross-origin writes, and exposes stale conflicts", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter() });
    await request(app)
      .post("/api/cases/case-start-implementation/resolve")
      .set("origin", "https://malicious.example")
      .send({ resolution: "approve", sourceRevision: "issue-42-v3" })
      .expect(403);
    await request(app)
      .post("/api/cases/case-start-implementation/resolve")
      .send({ resolution: "reject", sourceRevision: "issue-42-v3" })
      .expect(400);
    const stale = await request(app)
      .post("/api/cases/case-start-implementation/resolve")
      .send({ resolution: "approve", sourceRevision: "issue-42-v2" })
      .expect(409);
    assert.equal(stale.body.case.status, "stale");
    db.close();
  });

  it("accepts versioned workflow notifications and exposes the activity journal", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter(), seed: false });
    const payload = {
      schemaVersion: "acme.steering.notification.v1",
      id: "prelude:1:accepted:1",
      source: { product: "prelude", resourceType: "inception", resourceId: "1", revision: "1" },
      event: { type: "inception.accepted", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Inception accepted" },
      steering: { caseKey: "inception:1:export", state: "open", action: "prelude.package_accepted_export" },
    };
    await request(app).post("/api/notifications").send(payload).expect(202);
    await request(app).post("/api/notifications").send(payload).expect(200).expect(({ body }) => assert.equal(body.duplicate, true));
    await request(app).get("/api/events").expect(200).expect(({ body }) => assert.equal(body.items.length, 1));
    db.close();
  });

  it("binds each notification credential to its declared source product", async () => {
    const adapter = createAcmeIdentityAuthAdapter({
      fetchFn: async () => identityResponse({ permissions: ["steering.notify.prelude"] }),
    });
    const db = openDatabase(":memory:");
    const app = await createApp({ db, authAdapter: adapter, seed: false });
    await request(app).post("/api/notifications/check").send({ product: "prelude" }).expect(200);
    await request(app).post("/api/notifications/check").send({ product: "acme-issues" }).expect(403);
    const payload = {
      schemaVersion: "acme.steering.notification.v1",
      id: "prelude:1:accepted:1",
      source: { product: "prelude", resourceType: "inception", resourceId: "1", revision: "1" },
      event: { type: "inception.accepted", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Inception accepted" },
      steering: { caseKey: "inception:1:export", state: "open", action: "prelude.package_accepted_export" },
    };
    await request(app).post("/api/notifications").send(payload).expect(202);
    await request(app).post("/api/notifications").send({
      ...payload,
      id: "issues:1:eligible:1",
      source: { product: "acme-issues", resourceType: "issue", resourceId: "1", revision: "1" },
      steering: { ...payload.steering, caseKey: "issue:1:trigger", action: "issues.trigger_implementation" },
    }).expect(403);
    db.close();
  });

  it("applies an admin-approved source action only from its authoritative receipt", async () => {
    const db = openDatabase(":memory:");
    const dispatcher: ActionDispatcher = {
      async notifyDecision(item, decisionId) {
        return {
          schemaVersion: "acme.steering.decision-receipt.v1",
          decisionId,
          status: "recorded",
          sourceRevision: item.sourceRevision,
          summary: "The source recorded the human decision.",
        };
      },
      async invoke(item, decisionId) {
        return {
          schemaVersion: "acme.steering.action-receipt.v1",
          requestId: `${item.id}:${item.sourceRevision}:${decisionId}`,
          status: "applied",
          sourceRevision: "2",
          summary: "The source product applied the action.",
        };
      },
    };
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter(), seed: false, actionDispatcher: dispatcher });
    await request(app).post("/api/notifications").send({
      schemaVersion: "acme.steering.notification.v1",
      id: "projects:card:4:ready:1",
      source: { product: "acme-projects", resourceType: "card", resourceId: "4", revision: "1" },
      event: { type: "card.ready", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Card ready" },
      steering: { caseKey: "card:4:submit", state: "open", action: "projects.submit_ready_card" },
    }).expect(202);
    const resolved = await request(app).post("/api/cases/acme-projects%3Acard%3A4%3Asubmit/resolve")
      .send({ resolution: "approve", sourceRevision: "1" }).expect(200);
    assert.equal(resolved.body.status, "applied");
    assert.equal(resolved.body.sourceRevision, "2");
    assert.equal(resolved.body.decisionDeliveryStatus, "recorded");
    assert.match(resolved.body.decisionDeliverySummary, /recorded the human decision/i);
    assert.match(resolved.body.applicationSummary, /source product applied/);
    db.close();
  });

  it("delivers non-approval decisions without invoking a source workflow action", async () => {
    const db = openDatabase(":memory:");
    const calls: string[] = [];
    const dispatcher: ActionDispatcher = {
      async notifyDecision(item, decisionId) {
        calls.push(`notice:${item.resolution}`);
        return {
          schemaVersion: "acme.steering.decision-receipt.v1", decisionId, status: "recorded",
          sourceRevision: item.sourceRevision, summary: "The source recorded the requested revision.",
        };
      },
      async invoke() {
        calls.push("action");
        throw new Error("Non-approval resolutions must not invoke a workflow action.");
      },
    };
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter(), seed: false, actionDispatcher: dispatcher });
    await request(app).post("/api/notifications").send({
      schemaVersion: "acme.steering.notification.v1", id: "projects:card:5:ready:1",
      source: { product: "acme-projects", resourceType: "card", resourceId: "5", revision: "1" },
      event: { type: "card.ready", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Card ready" },
      steering: { caseKey: "card:5:submit", state: "open", action: "projects.submit_ready_card" },
    }).expect(202);
    const resolved = await request(app).post("/api/cases/acme-projects%3Acard%3A5%3Asubmit/resolve")
      .send({ resolution: "request_revision", rationale: "Clarify scope.", sourceRevision: "1" }).expect(200);
    assert.deepEqual(calls, ["notice:request_revision"]);
    assert.equal(resolved.body.status, "revision_requested");
    assert.equal(resolved.body.decisionDeliveryStatus, "recorded");
    db.close();
  });

  it("retries unavailable decision delivery with the original decision identity", async () => {
    const db = openDatabase(":memory:");
    const deliveredIds: string[] = [];
    let attempts = 0;
    const dispatcher: ActionDispatcher = {
      async notifyDecision(item, decisionId) {
        deliveredIds.push(decisionId);
        attempts += 1;
        return {
          schemaVersion: "acme.steering.decision-receipt.v1", decisionId,
          status: attempts === 1 ? "unavailable" : "recorded", sourceRevision: item.sourceRevision,
          summary: attempts === 1 ? "The source was offline." : "The source recorded the decision.",
        };
      },
      async invoke() { throw new Error("A non-approval retry must not invoke an action."); },
    };
    const app = await createApp({ db, authAdapter: createStandaloneAuthAdapter(), seed: false, actionDispatcher: dispatcher });
    await request(app).post("/api/notifications").send({
      schemaVersion: "acme.steering.notification.v1", id: "issues:6:eligible:1",
      source: { product: "acme-issues", resourceType: "issue", resourceId: "6", revision: "1" },
      event: { type: "issue.trigger_eligible", occurredAt: "2026-08-03T00:00:00.000Z", summary: "Issue eligible" },
      steering: { caseKey: "issue:6:trigger", state: "open", action: "issues.trigger_implementation" },
    }).expect(202);
    const first = await request(app).post("/api/cases/acme-issues%3Aissue%3A6%3Atrigger/resolve")
      .send({ resolution: "defer", sourceRevision: "1" }).expect(200);
    assert.equal(first.body.decisionDeliveryStatus, "unavailable");
    const retried = await request(app).post("/api/cases/acme-issues%3Aissue%3A6%3Atrigger/redeliver-decision").expect(200);
    assert.equal(retried.body.decisionDeliveryStatus, "recorded");
    assert.equal(deliveredIds.length, 2);
    assert.equal(deliveredIds[0], deliveredIds[1]);
    await request(app).post("/api/cases/acme-issues%3Aissue%3A6%3Atrigger/redeliver-decision").expect(409);
    db.close();
  });
});

function identityResponse({ permissions }: { permissions: string[] }): Response {
  return new Response(JSON.stringify({
    sub: "identity:admin",
    iss: "acme-identity",
    username: "admin",
    displayName: "Administrator",
    roles: ["anything"],
    permissions,
    kind: "human",
  }), { status: 200, headers: { "content-type": "application/json" } });
}
