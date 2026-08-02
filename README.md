# Acme Steering

Acme Steering is the optional local decision inbox and policy-guided human-steering layer for the Acme Software Factory. It coordinates when valid product actions may proceed automatically, when a person must decide, and how unresolved decisions are routed without replacing the products that own the underlying workflows.

**Status:** product inception. The architecture and first implementation path are documented; no runtime has been implemented yet.

**Reserved default port:** `8323`

## Architecture stance

Acme Steering participates in an executable reference architecture, not an all-inclusive platform or universal governance system. It favors local operation, explicit authority, product-owned state, and replaceable adapters so subject-matter experts can inspect the mechanism and adapt it to their organization.

The current manual workflows remain the baseline. When Steering is absent, people continue to act in Projects, Issues, Prelude, Helix, and other products exactly as they do today. When Steering is present, it may surface the same action in one inbox or perform it automatically when an explicit delegation policy allows.

## Product shape

```text
Acme Steering
├── Steering Inbox       human decisions, clarifications, and interventions
├── Delegation Policies  automatic, human-required, denied, deferred, escalated
├── Decision History     requests, discussion, resolutions, and application outcomes
├── Escalation           routing, reminders, delegation, expiry, and safe fallback
├── Optional Advisor     case-bound, read-only assistance for the human
└── Product Adapters     existing public reads and actions; no sibling database access
```

The primary UI is intentionally email-shaped: a finite `Needs attention` list, a case detail with evidence and explicit actions, an `Automated` view, and durable `History`. It is not a chat product, project tracker, activity feed, or replacement for Acme Observability.

## Ownership boundary

- Source products own domain state, hard safety rules, authorization enforcement, and whether an action is still valid.
- Steering owns delegation policy, the human interaction record, escalation, and its attempts to invoke product-owned actions.
- Acme Identity is an optional authentication and permission adapter; it does not own policies or steering cases.
- Acme Observability remains read-only. Steering may use its allowlisted operational projection for correlation but never grants it workflow authority.
- A future Decision Intelligence product may consume an explicit export. Learning, skill generation, fine-tuning, and reinforcement learning are outside Steering.

## Initial journeys

1. **Manual fallback:** Steering is absent; the current product UI remains sufficient.
2. **Human decision:** Steering discovers a valid pending action, policy requires a person, the inbox records the decision, and the owning product revalidates and applies it.
3. **Delegated automation:** policy authorizes a bounded action, Steering performs it under a service principal, and the action remains visibly attributed to policy rather than a human.
4. **Direct product action:** a human acts outside Steering; reconciliation closes the corresponding case without repeating the action.
5. **Rejection or revision:** an unchanged rejected proposal is not silently resubmitted; revision, deferment, cancellation, or escalation is explicit.
6. **Unavailable component:** an offline Steering service removes automation but does not break source products; an offline source cannot be reported as successfully changed.

## Documents

- [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) — accepted product scope and first completion gate.
- [`docs/vision.md`](./docs/vision.md) — automatic-with-human-steering direction and product experience.
- [`docs/architecture.md`](./docs/architecture.md) — ownership, optionality, adapters, Identity, Observability, and advisor boundaries.
- [`docs/steering-case.md`](./docs/steering-case.md) — durable request, conversation, resolution, and application semantics.
- [`docs/policy-model.md`](./docs/policy-model.md) — delegation policy, rejection, escalation, and product-rule separation.
- [`docs/decisions.md`](./docs/decisions.md) — settled and deliberately deferred choices.
- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — incremental standalone-first delivery sequence.

## Implementation status

There are no install, build, or start commands yet. The first implementation should establish a standalone fixture-backed vertical slice before connecting a real Acme product. Do not make sibling services, Acme Identity, Observability, a model provider, or network access required for that slice.
