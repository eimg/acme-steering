# Architecture

## Authority shape

```text
source product public state/actions
        ↕ product adapter
Steering case + delegation policy + escalation
        ↕
human inbox / optional advisor

Acme Identity ------ optional principal and permission resolution
Acme Observability - optional read-only correlation context
```

The source product remains authoritative for domain state and action validity. Steering is authoritative for what it asked, what policy concluded, what the human stated, how it routed the case, and what action it attempted. A successful source response—not an inbox click—is evidence that the domain action was applied.

## Components

### Steering Inbox

Provides the list/detail experience, case discussion, explicit resolution, automated history, and links to source products. It does not render a general event stream or replace source-product interfaces.

### Case service

Owns durable steering cases and their request, conversation, resolution, and application phases. It correlates all revisions and attempts without treating discussion messages as authorization.

### Delegation-policy evaluator

Runs inside Steering for the initial product. It is a distinct host-owned capability, not model judgment and not UI button logic. It evaluates versioned policy against explicit context and returns automatic, human-required, denied, deferred, or escalated.

It governs whether Steering may invoke a valid source action. It cannot weaken product-enforced invariants.

### Escalation router

Routes by permission and resource ownership rather than fixed role names. It records deadlines, reminders, authorized delegation, higher-authority routing, and the declared safe behavior when nobody responds.

### Product adapters

Adapters translate public source state into decision context and invoke existing public source actions. They own source-specific validation, credentials, trusted origins, idempotency keys where supported, and reconciliation after direct product action.

Adapters never import sibling source packages, read sibling databases, or attach a credential to an untrusted origin. Steering must not bypass established workflow ownership merely because two actions are technically reachable.

Polling and explicit refresh are sufficient initial discovery mechanisms. Source-pushed events, webhooks, or streaming should be added only after a demonstrated latency need and must retain reconciliation.

### Optional advisor

The advisor is bound to one case. Its initial context consists of the decision-grade case plus optional authorized Observability reads. It receives no standing write tools and no implicit access to all source products.

Advisor answers distinguish generated interpretation from linked source evidence, disclose missing or stale context, and never become the policy result or structured resolution.

### Local store

The first implementation should durably preserve:

- cases and source revision references;
- policy identity, version, input facts, result, and explanation;
- discussion and structured resolutions;
- actor and service-principal attribution;
- deadlines and escalation history;
- action attempts, acknowledgements, stale results, and failures.

This is audit-quality steering history, not a speculative intelligence or training schema.

## Authentication and authorization

Standalone mode must remain available with one explicit local operator. Shared mode may use Acme Identity over a replaceable HTTP adapter.

- Identity answers who is acting and which suite permissions they hold.
- Steering owns case routing and delegation policy.
- Source products reauthorize and revalidate actions when Steering invokes them.
- Permission strings, not current role names, define required authority.
- Identity unavailability in shared mode fails closed; it is not mistaken for an anonymous or standalone user.

Suggested permission vocabulary is deliberately provisional until implementation confirms route boundaries:

- `steering.read`
- `steering.decide`
- `steering.manage`
- `steering.automate`

Product-specific permissions remain owned by their products. Holding `steering.decide` alone does not grant `issues.trigger`, `prelude.export`, or another domain capability.

## Observability boundary

Observability may answer where work stopped and which source objects correlate. It does not normally contain enough domain evidence to decide what should happen.

Steering must not enlarge Observability into a collaboration, document, or evidence warehouse. The advisor may use Observability only when the acting principal has the required access, and it must state when operational context is insufficient for a recommendation.

Observability may later project allowlisted Steering facts such as pending, automated, rejected, escalated, applied, stale, and timing. It remains read-only and never resolves a case.

## Failure behavior

| Failure | Required behavior |
|---|---|
| Steering absent or stopped | Existing manual product workflows continue |
| Policy missing or invalid | Do not automate; preserve manual handling and expose the reason |
| Identity unavailable in shared mode | Fail closed for decision and action |
| Source unavailable | Retain the case or response; do not claim the action applied |
| Source state changed | Mark the proposal stale and reassess rather than applying blindly |
| Duplicate discovery or retry | Reconcile to one logical case/action and do not repeat an applied effect |
| Advisor unavailable | Inbox, policy, and explicit human resolution remain usable |
| Observability unavailable | Lose optional correlation only; do not block steering |
| Notification adapter unavailable | Retain the local inbox item and retry only within declared bounds |

## Extraction boundary

Policy remains embedded until evidence supports a separate service. Extraction becomes reasonable when multiple independently deployed non-inbox consumers need the same evaluation, policy availability must be isolated from the UI, policy administration becomes independently substantial, or organizations need to replace the inbox while retaining the evaluator.
