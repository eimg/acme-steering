import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createStandaloneAuthAdapter } from "../src/auth.js";
import { FakeConfigAgent } from "../src/configAgent.js";
import { draftOf, PolicyConfigConflictError, PolicyConfigStore } from "../src/configStore.js";
import { openDatabase } from "../src/db.js";
import { SteeringStore } from "../src/store.js";
import type { SteeringActor } from "../src/types.js";

const admin: SteeringActor = {
  id: "test:admin", issuer: "test", username: "admin", displayName: "Test administrator",
  roles: ["admin"], permissions: ["*"], kind: "development",
};

describe("steering policy configuration", () => {
  it("keeps explicit discussion-only prompts free of offline proposals", async () => {
    const agent = new FakeConfigAgent();
    const db = openDatabase(":memory:");
    const config = draftOf(new PolicyConfigStore(db).active());
    const turn = await agent.complete("Explain the current policy without proposing a change.", [], config);
    assert.equal(turn.proposedConfig, undefined);
    assert.match(turn.message, /active policy/i);
    db.close();
  });

  it("activates immutable versions and rejects stale writers", () => {
    const db = openDatabase(":memory:");
    const configs = new PolicyConfigStore(db);
    const first = configs.active();
    const draft = draftOf(first);
    draft.name = "Reviewed local policy";
    const second = configs.activate({ draft, expectedVersion: 1, actor: admin, changeSummary: "Clarified the policy name." });
    assert.equal(second.version, 2);
    assert.equal(configs.history().length, 2);
    assert.throws(() => configs.activate({ draft, expectedVersion: 1, actor: admin, changeSummary: "Stale write." }), PolicyConfigConflictError);
    db.close();
  });

  it("uses the active configuration for new case evaluations while retaining old case snapshots", () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    const first = store.createCase(caseInput("first"));
    assert.equal(first.policy.outcome, "human_required");
    const configs = new PolicyConfigStore(db);
    const draft = draftOf(configs.active());
    draft.rules.push({
      id: "test-action-auto", description: "Delegate the test action.", enabled: true,
      outcome: "automatic", match: { action: "test.action", risk: "low", reversible: true },
      explanation: "The test action is explicitly delegated.",
    });
    configs.activate({ draft, expectedVersion: 1, actor: admin, changeSummary: "Delegate a bounded test action." });
    const second = store.createCase(caseInput("second"));
    assert.equal(second.policy.outcome, "automatic");
    assert.equal(second.policy.policyVersion, "steering.delegation.v2");
    assert.equal(store.getCase("first").policy.policyVersion, "steering.delegation.v1");
    db.close();
  });

  it("keeps agent discussion non-authoritative until a human activates its exact proposal", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({
      db, seed: false, authAdapter: createStandaloneAuthAdapter(),
      createConfigAgent: () => new FakeConfigAgent(async (_prompt, _history, current) => ({
        message: "I propose renaming this configuration; no delegation semantics change.",
        proposedConfig: { ...current, name: "Agent-proposed policy" },
        proposalSummary: "Rename the policy for clarity.",
      })),
    });
    const discussed = await request(app).post("/api/config-agent/sessions").send({ prompt: "Propose a clearer name." }).expect(201);
    assert.equal(discussed.body.proposedConfig.name, "Agent-proposed policy");
    const before = await request(app).get("/api/policy-config").expect(200);
    assert.equal(before.body.active.version, 1);
    assert.notEqual(before.body.active.name, "Agent-proposed policy");
    const applied = await request(app).post(`/api/config-agent/sessions/${discussed.body.id}/activate`).expect(201);
    assert.equal(applied.body.active.version, 2);
    assert.equal(applied.body.active.name, "Agent-proposed policy");
    assert.equal(applied.body.session.status, "applied");
    await request(app).post(`/api/config-agent/sessions/${discussed.body.id}/messages`).send({ prompt: "Change it again." }).expect(409);
    db.close();
  });

  it("validates direct edits before activation", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({ db, seed: false, authAdapter: createStandaloneAuthAdapter() });
    await request(app).post("/api/policy-config/activate").send({
      expectedVersion: 1,
      changeSummary: "Unsafe malformed update.",
      config: { schemaVersion: "wrong", rules: [] },
    }).expect(400).expect(({ body }) => assert.ok(body.errors.length >= 1));
    db.close();
  });
});

function caseInput(id: string) {
  return {
    id, kind: "decision" as const, title: id, sourceProduct: "test", sourceRef: id,
    sourceRevision: "1", action: "test.action", reason: "Test", summary: "Test",
    proposedAction: "Run test action", recommendation: "Review", risk: "low" as const,
    reversible: true, evidence: [], choices: [], facts: {},
  };
}
