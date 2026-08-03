# Implementation plan

**Status:** phase 1 first pass implemented; phase 1 completion items remain

The plan intentionally proves one local mechanism at a time. Do not begin with cross-suite automation or external channels.

## Phase 0 — inception documents

- Product positioning and boundaries.
- Steering-case semantics.
- Delegation-policy boundary and escalation.
- Inbox and advisor direction.
- Standalone completion gate.

Exit: the document set is internally consistent and relative links resolve.

## Phase 1 — standalone fixture-backed vertical slice

Implemented now:

- One local service and durable store.
- `Needs attention`, case detail, `Automated`, and `History`.
- Fixture cases for decision, clarification, revision, and escalation.
- Explicit structured resolution separate from discussion.
- Small versioned policy evaluator demonstrating automatic and human-required outcomes.
- Fixture application acknowledgement, stale handling, rejection suppression, and restart recovery.
- Standalone local operator; no sibling services, model, or network required.
- Optional Acme Identity HTTP adapter with fail-closed shared mode.
- One offline verification command covering typecheck, tests, build, and acceptance flow.

Still to complete before the phase exit:

- Scheduled expiry and explicit safe-timeout behavior.
- Fixture coverage for policy exceptions and richer action-attempt history.
- Case ownership, assignment, reminder, delegation, and escalation routing.

Exit: every journey in `PROJECT_SPEC.md` section 5 is demonstrated.

## Phase 2 — workflow notification adapters (implemented first slice)

- Prelude, Helix, Issues, and Projects publish best-effort durable lifecycle events when configured.
- Steering journals information events and synchronizes stable actionable cases.
- Duplicate delivery is idempotent and later source actions resolve or supersede stale cases.
- Administrator approval invokes the first allowlisted product actions and records authoritative receipts; asynchronous acceptance still waits for a source event.
- The Projects → Issues → Helix boundary remains unchanged.

Exit: Steering can be stopped and the original manual journey still works unchanged.

## Phase 3 — shared local identity and permissions

- Extend the replaceable Acme Identity adapter already established in phase 1.
- Extend the current read/decide gates to policy management, automation, ownership, and delegation.
- Reauthorize domain actions at the owning product.
- Add capability-based assignment, delegation, and escalation.
- Keep standalone mode as the default independent path.

Exit: Identity failure in shared mode fails closed without affecting standalone mode.

The mechanical edge credentials and product reauthorization are implemented. Ownership, delegation, and risk-based automation in this phase remain deferred.

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
- Durable outbox/retry delivery if best-effort source notification proves insufficient.
- Separate policy service if independent consumers or deployment needs emerge.
- Explicit export for a separate Decision Intelligence consumer.

These are not part of the first implementation commitment.
