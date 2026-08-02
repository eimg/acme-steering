# Implementation plan

**Status:** inception complete; implementation not started

The plan intentionally proves one local mechanism at a time. Do not begin with cross-suite automation or external channels.

## Phase 0 — inception documents

- Product positioning and boundaries.
- Steering-case semantics.
- Delegation-policy boundary and escalation.
- Inbox and advisor direction.
- Standalone completion gate.

Exit: the document set is internally consistent and relative links resolve.

## Phase 1 — standalone fixture-backed vertical slice

- One local service and durable store.
- `Needs attention`, case detail, `Automated`, and `History`.
- Fixture cases for decision, clarification, revision, exception, and escalation.
- Explicit structured resolution separate from discussion.
- Small versioned policy evaluator demonstrating automatic and human-required outcomes.
- Application acknowledgement, stale handling, rejection suppression, expiry, and restart recovery.
- Standalone local operator; no Identity, sibling services, model, or network required.
- One offline verification command covering typecheck, tests, build, and acceptance flow.

Exit: every journey in `PROJECT_SPEC.md` section 5 is demonstrated.

## Phase 2 — first real product adapter

- Inspect candidate source public APIs and authorization behavior.
- Select the smallest journey that demonstrates discovery, manual fallback, human decision, policy automation, direct-action reconciliation, and idempotency.
- Prefer the Projects/Issues implementation-start checkpoint if the public contract is sufficient.
- Add only the smallest optional source contract for a proven gap.
- Preserve the Projects → Issues → Helix boundary.

Exit: Steering can be stopped and the original manual journey still works unchanged.

## Phase 3 — shared local identity and permissions

- Add the replaceable Acme Identity adapter.
- Gate reading, deciding, managing policy, and automation with stable permission strings.
- Reauthorize domain actions at the owning product.
- Add capability-based assignment, delegation, and escalation.
- Keep standalone mode as the default independent path.

Exit: Identity failure in shared mode fails closed without affecting standalone mode.

## Phase 4 — cross-product coverage

Add adapters incrementally for proven checkpoints such as:

- Prelude accepted export packaging and Helix catalog pickup;
- Helix ambiguity, continuation, or review-retry decisions;
- Issues implementation triggering and review/merge boundaries;
- Projects readiness or revision where public state supports it.

Each adapter must preserve the source product's ownership and direct manual path.

## Phase 5 — optional advisor

- Case-bound advisor experience.
- Steering case as primary context.
- Optional authorized Observability adapter for correlation.
- Evidence links, freshness, uncertainty, and explicit insufficient-context behavior.
- No standing write tools or automatic authorization.
- Inbox remains fully usable without model credentials or network.

## Phase 6 — later seams, only with evidence

- Local operating-system notifications.
- Replaceable external channel adapters.
- Source-owned event streams plus reconciliation if polling latency is inadequate.
- Separate policy service if independent consumers or deployment needs emerge.
- Explicit export for a separate Decision Intelligence consumer.

These are not part of the first implementation commitment.
