import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createStandaloneAuthAdapter } from "../src/auth.js";
import { FakeCaseAdvisor } from "../src/caseAdvisor.js";
import { openDatabase } from "../src/db.js";
import { seedFixtures } from "../src/fixtures.js";
import { SteeringStore } from "../src/store.js";

describe("case-bound steering advisor", () => {
  it("explains policy and recommendations without selecting a decision", async () => {
    const db = openDatabase(":memory:");
    const store = new SteeringStore(db);
    seedFixtures(store);
    const item = store.getCase("case-start-implementation");
    const advisor = new FakeCaseAdvisor();
    assert.match((await advisor.complete("Why did policy pause?", item)).message, /does not decide/i);
    assert.match((await advisor.complete("What do you recommend?", item)).message, /cannot approve/i);
    db.close();
  });

  it("records the human question and generated advice without resolving the case", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({
      db,
      authAdapter: createStandaloneAuthAdapter(),
      createCaseAdvisor: () => new FakeCaseAdvisor(async (prompt, item) => {
        assert.equal(prompt, "Compare the available choices.");
        assert.equal(item.id, "case-start-implementation");
        return { message: "Approval spends implementation capacity; defer keeps the issue paused. You retain decision authority." };
      }),
    });
    const before = await request(app).get("/api/cases/case-start-implementation").expect(200);
    const response = await request(app)
      .post("/api/cases/case-start-implementation/advisor")
      .send({ prompt: "Compare the available choices." })
      .expect(201);
    assert.equal(response.body.status, "pending");
    assert.equal(response.body.resolution, undefined);
    assert.equal(response.body.messages.length, before.body.messages.length + 2);
    assert.equal(response.body.messages.at(-2).body, "Compare the available choices.");
    assert.equal(response.body.messages.at(-1).author.id, "service:acme-steering:advisor");
    assert.match(response.body.messages.at(-1).body, /decision authority/);
    db.close();
  });

  it("does not persist a partial exchange when the advisor fails", async () => {
    const db = openDatabase(":memory:");
    const app = await createApp({
      db,
      authAdapter: createStandaloneAuthAdapter(),
      createCaseAdvisor: () => new FakeCaseAdvisor(async () => { throw new Error("model unavailable"); }),
    });
    const before = await request(app).get("/api/cases/case-start-implementation").expect(200);
    await request(app).post("/api/cases/case-start-implementation/advisor")
      .send({ prompt: "Help me decide." }).expect(500);
    const after = await request(app).get("/api/cases/case-start-implementation").expect(200);
    assert.equal(after.body.messages.length, before.body.messages.length);
    assert.equal(after.body.status, "pending");
    db.close();
  });
});
