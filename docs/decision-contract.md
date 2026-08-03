# Source decision contract

`acme.steering.decision.v1` communicates a completed Steering disposition back to the workflow owner. It is deliberately separate from `acme.steering.action.v1`: a decision is durable steering input; an action request asks the product to perform one explicitly exposed transition.

Steering sends every source-backed human resolution to `POST /api/steering/decisions`, including approve, reject, request revision, defer, escalate, and cancel. The notice contains a stable decision id, case and action correlation, the human resolution and rationale, actor identity, decision time, resource identity, and the source revision the human inspected. It contains no generic state mutation or instruction for what the source must do next.

Each workflow owner authenticates the caller with its dedicated `<product>.steering.receive` permission, validates the product-specific action and resource type, reloads current state, and durably records the notice. It returns `acme.steering.decision-receipt.v1` with one of:

- `recorded` — the decision was stored against the expected source revision;
- `already_recorded` — the same decision id and payload were already stored;
- `stale` — the decision was stored, but the workflow has moved beyond the inspected revision;
- `rejected` — the envelope conflicts with the product contract or reuses an id with different content;
- `unavailable` — Steering could not obtain an authoritative source receipt.

Recording a decision does not change the workflow revision or choose a domain transition. The product may expose the ledger through `GET /api/steering/decisions` for its UI, adapters, or future deterministic handling. What reject, revision, defer, or escalation means operationally remains product-owned and may differ by workflow.

Approval is the one current disposition that may also produce a mechanical action request. Steering records the decision first, then invokes the narrow action contract with the same `decisionId`. The product still reloads state and applies its ordinary domain rules. A decision receipt proves only that the source saw the human direction; an action receipt or later workflow event proves that a domain effect occurred.

Decision delivery is idempotent, but the first pass is synchronous and has no background delivery queue. An unavailable receipt remains visible in the Steering case rather than being presented as delivered; an administrator may retry it explicitly using the same decision id. Automated retry and broader source-specific handling policies are later increments; a product's manual workflow remains available throughout.
