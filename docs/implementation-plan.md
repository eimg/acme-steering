# Implementation plan

**Status:** standalone and first integration slices implemented; later operational breadth remains

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
- Read-only policy preview against current cases.
- Steering-owned bounded risk assessment with unknown actions left unassessed.
- Immutable declarative policy versions with direct editing and config-agent proposals behind explicit human activation.
- Fixture application acknowledgement, stale handling, rejection suppression, and restart recovery.
- Standalone local operator; no sibling services, model, or network required.
- Optional Acme Identity HTTP adapter with fail-closed shared mode.
- One offline verification command covering typecheck, tests, build, and acceptance flow.
- Durable automatic authorization, delivery, invocation, reconciliation, and escalation attempts.
- Minimal permission-routed escalation with an explicit remain-paused fallback.

Still to complete before the phase exit:

- Scheduled expiry and explicit safe-timeout behavior.
- Scheduled escalation reminders and timeout processing.
- Case ownership, assignment, delegation, and higher-authority routing.

Exit: every journey in `PROJECT_SPEC.md` section 5 is demonstrated.

## Phase 2 — workflow notification adapters (implemented first slice)

- Prelude, Helix, Issues, and Projects publish best-effort durable lifecycle events when configured.
- Steering journals information events and synchronizes stable actionable cases.
- Duplicate delivery is idempotent and later source actions resolve or supersede stale cases.
- Administrator approval invokes the first allowlisted product actions and records authoritative receipts; asynchronous acceptance still waits for a source event.
- The accepted, reversible Prelude export is automatically authorized under the Steering service principal; other source actions remain human-authorized.
- Every completed source-backed disposition is delivered through `acme.steering.decision.v1` and durably acknowledged by the workflow owner without generic state mutation; automatic approval is service-attributed.
- The Projects → Issues → Helix boundary remains unchanged.

Exit: Steering can be stopped and the original manual journey still works unchanged.

## Phase 3 — shared local identity and permissions

- Extend the replaceable Acme Identity adapter already established in phase 1.
- Extend the current read/decide/manage gates to automation, ownership, and delegation.
- Reauthorize domain actions at the owning product.
- Add capability-based assignment, delegation, and escalation.
- Keep standalone mode as the default independent path.

Exit: Identity failure in shared mode fails closed without affecting standalone mode.

The mechanical edge credentials, product reauthorization, and one narrow risk-based automatic journey are implemented. Ownership and delegation remain deferred.

## Phase 4 — broader cross-product behavior (mechanical contracts implemented)

The first mechanical actions are implemented for:

- Prelude accepted export packaging and Helix catalog pickup;
- Helix ambiguity, continuation, or review-retry decisions;
- Issues implementation triggering and review/merge boundaries;
- Projects readiness or revision where public state supports it.

Each adapter preserves the source product's ownership and direct manual path.
Only Prelude export is automatic in the shipped policy; Projects submission,
Issues triggering, and Helix recovery remain human-authorized. Richer checkpoint
semantics, background retries, and organization-specific policy remain later work.

## Phase 5 — optional advisor (case-only slice implemented)

- Case-bound advisor experience in every case discussion. *(implemented)*
- Steering case and bounded durable discussion as primary context. *(implemented)*
- Offline fake and optional live model adapter. *(implemented)*
- Generated-answer attribution with no decision or action authority. *(implemented)*
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
