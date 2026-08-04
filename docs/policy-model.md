# Delegation policy model

## Boundary

There are two policy categories and they must not be conflated.

### Product invariants

Source products enforce what must always be true: domain validity, permission checks, authorization boundaries, merge ownership, evidence ACLs, and other hard constraints. Steering cannot override them.

### Steering delegation policy

Steering decides who or what may invoke an already-valid product action and whether the current proposal should be automatic, human-required, denied, deferred, or escalated.

Examples:

- automatically package an already accepted Prelude version;
- ask before starting implementation from a ready issue;
- automatically resubmit review after a changed commit, within a bounded attempt budget;
- escalate repeated security findings to a principal with a required capability;
- never automate merge in the current Acme workflow.

## Evaluation

A policy evaluation considers explicit facts such as:

- action and resource;
- initiating human or service principal;
- project and organizational scope;
- source revision and current lifecycle state;
- reversibility, cost, environment, security, and data sensitivity;
- evidence completeness and unresolved questions;
- previous attempts, failures, rejections, and exceptions;
- policy identity and version.

It produces exactly one classification:

- **automatic** — Steering is delegated to invoke the action;
- **human required** — create or retain a decision case;
- **deny** — a steering rule forbids this proposed action;
- **defer** — prerequisites or evidence are missing;
- **escalate** — the current route cannot produce an authorized resolution.

Every result includes a bounded explanation and any obligations, expiry, required capability, or safe fallback. Model output may help explain context but is never the policy evaluator.

## Precedence

The first implementation should favor a small, inspectable policy set rather than a universal language. The durable precedence is:

1. source-product hard invariants and authorization;
2. explicit deny or human-required safety policy;
3. narrowly scoped delegation;
4. safe default to manual handling.

Ambiguous, missing, conflicting, or invalid policy never becomes automatic authorization.

The current `acme.steering.policy.v1` configuration implements this boundary narrowly. Enabled rules are evaluated in visible order and the first complete match wins: accepted, low-risk, reversible Prelude package creation is automatic; incomplete evidence defers; a repeated security finding escalates; an explicit deny fact denies; everything else requires a human. It is a compact reference policy, not a universal language or a claim that the same delegation suits every organization.

Each activation creates an immutable integer version with actor, timestamp, and change summary. New cases use the active version; existing case evaluations remain historical snapshots. Concurrent or agent proposals based on an older version fail closed and must be reviewed again.

The host enables source-backed automation only where the full contract exists. The accepted, reversible Prelude export is the first such path: Steering derives a low-risk assessment, authorizes it under its service principal, delivers the durable decision, invokes Prelude's allowlisted action, and records the receipt. Every other source-backed automatic result is guarded back to `human_required`; changing JSON alone cannot unlock a missing execution boundary.

The initial deterministic risk classifier belongs to Steering. It derives a bounded assessment from the action key, reversibility, and structured facts, ignores sibling-provided risk labels as authority, and leaves unknown actions `unassessed`. This is inspectable reference logic rather than a universal organizational risk model.

## Rejection and revision

Keep these outcomes distinct:

- **policy denial** — Steering is not permitted to perform the proposed action;
- **human rejection** — an authorized person declined this revision;
- **needs revision** — reconsideration conditions were provided;
- **execution failure** — an authorized action did not succeed;
- **escalation** — the current authority path cannot resolve the case.

An unchanged human-rejected proposal is not automatically resubmitted. A successor must identify the material change or explicit authority that permits reconsideration.

## Escalation

Escalation is a routing outcome, not a synonym for rejection or technical failure. A declared ladder may:

1. notify the primary qualified owner;
2. remind within a bounded interval;
3. route to an authorized delegate;
4. route to a higher capability for risk, conflict, or exception;
5. apply the declared safe timeout behavior: remain paused, cancel, or roll back where the source supports it.

Silence never becomes high-impact approval. Repeated failure, repeated rejection, conflicting decisions, unavailable approvers, security findings, and material scope expansion remain separately visible.

## Automatic-action provenance

An automatic action records:

- the Steering service principal;
- policy identity and version;
- evaluated facts and explanation;
- source action and revision;
- attempts and final acknowledgement.

It appears in `Automated` and `History`; it never appears as though a named human clicked the action.

## Policy evolution

Policy changes remain deliberate human activations. Operators may edit the declarative JSON directly or ask the config authoring agent to explain and propose a complete replacement. Agent output passes through the same deterministic validator, stays inactive until the operator activates the exact proposal, and never becomes a policy evaluation by itself.

Before activation, either form can be previewed against current cases. Preview reports changed classifications, automatic cases, warnings, and unused rules without mutating the active version or historical case snapshots.

The config agent sees only the active policy and its conversation. It has no sibling access, case-resolution authority, workflow tools, or permission to activate. Steering does not learn or modify policy from outcomes. Acme Intel may propose policy-oriented findings, but activation remains explicit, versioned, reviewable, and reversible inside Steering.
