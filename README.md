# Acme Steering

Acme Steering is the optional local decision inbox and policy-guided human-steering layer for the Acme Software Factory. It coordinates when valid product actions may proceed automatically, when a person must decide, and how unresolved decisions are routed without replacing the products that own the underlying workflows.

**Status:** runnable standalone first pass. The durable inbox, explicit decisions, workflow notification and decision adapters, four narrow product-owned actions, a small delegation-policy evaluator, and shared Acme Identity client integration are implemented. Escalation routing, source-specific decision handling, and the optional advisor remain deferred.

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
├── Escalation           classified cases now; routing, reminders, and expiry later
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
- [`docs/decision-contract.md`](./docs/decision-contract.md) — versioned human-decision delivery while source products retain workflow ownership.
- [`docs/policy-model.md`](./docs/policy-model.md) — delegation policy, rejection, escalation, and product-rule separation.
- [`docs/decisions.md`](./docs/decisions.md) — settled and deliberately deferred choices.
- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — incremental standalone-first delivery sequence.

## Run locally

Requires Node.js 22.19 or newer.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:8323>. The default `ACME_AUTH_MODE=off` exposes an explicit local development administrator and requires no sibling products, credentials, model, or network after installation. State is stored in `data/steering.db` and retained across restarts.

To exercise shared local authentication instead:

```bash
ACME_AUTH_MODE=local ACME_IDENTITY_URL=http://127.0.0.1:8316 npm run dev
```

In `local` mode, Steering uses the same `acme-identity` consumer package and session-menu conventions as its siblings, and fails closed if Identity is unavailable. Human routes require `steering.read` or `steering.decide`; source adapters use product-bound permissions (`steering.notify.prelude`, `.helix`, `.issues`, or `.projects`) so one sibling credential cannot impersonate another. The current Identity administrator is admitted through its wildcard permission. A signed-in user without Steering access receives an explicit account-switch action that returns to the administrator-prefilled login form. This first pass does not yet implement case ownership or delegation, so other users remain read-blocked unless explicitly granted those permissions.

Prelude, Helix, Acme Issues, and Acme Projects can optionally publish durable workflow events. Configure `ACME_STEERING_URL=http://127.0.0.1:8323`; in local-auth mode also configure a scoped `ACME_STEERING_TOKEN`. See [Workflow notification contract](docs/workflow-notifications.md).

Steering sends every source-backed human disposition to the owning product's durable decision ledger; this does not prescribe or perform its next workflow transition. Approval may additionally invoke one narrow product-owned action. Steering uses separate destination credentials and distinguishes decision acknowledgement from authoritative application evidence. See the [Source decision contract](docs/decision-contract.md) and [Product-owned action contract](docs/action-contract.md). Risk remains explicitly unassessed in this mechanical slice; advisor and risk-policy work are deferred.

`npm start` remains the production-build entrypoint. The root `start-acme.sh` launcher uses `npm run dev`, as it does for the other suite services.

## Verify

```bash
npm run verify
```

This runs typechecking, policy/store/API tests, and the production build.

## Current implementation boundary

The shipped slice retains deterministic fixtures and adds optional source-pushed workflow adapters, an Activity journal, durable source decision ledgers, and product-owned mechanical action invocation. It demonstrates idempotent ingestion, revision-bound decision acknowledgement and application, authoritative receipts, instance matching, and reconciliation when a direct source action supersedes the inbox. Reminders or expiry, durable delivery retry, source-specific handling policies, ownership routing, risk assessment, policy editing, and the advisor remain deferred.
