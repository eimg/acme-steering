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

The current `steering.delegation.v1` fixture evaluator implements this boundary narrowly: accepted, low-risk, reversible Prelude package creation is automatic; incomplete evidence defers; a repeated security finding escalates; an explicit fixture deny denies; everything else requires a human. It is working policy behavior for the reference slice, not a general configuration language or a claim that the same delegation suits every organization.

That evaluator applies only to deterministic fixtures. Source-backed mechanical actions are currently `unassessed` and administrator-decided. Workflow owners provide deterministic state and effects but do not assign the organizational risk level; a later Steering policy layer will derive risk from structured impact facts.

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

Policy changes are deliberate human-authored configuration changes in the current scope. Steering does not learn or modify policy from outcomes. A future Decision Intelligence product may propose changes, but activation remains explicit, versioned, reviewable, and reversible.
