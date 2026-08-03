# Steering case model

## Purpose

A steering case is the durable record connecting a proposed product action, policy evaluation, optional human interaction, explicit human- or service-attributed resolution, and the source product's eventual application outcome.

It is not an email, chat thread, generic task, or copy of the source workflow.

## Case kinds

- **Decision** — choose whether or how a proposed action proceeds.
- **Clarification** — supply information required before policy or execution can continue.
- **Revision** — return conditions that must be addressed before reconsideration.
- **Exception** — request a bounded departure from a steering policy; it cannot override a source invariant.
- **Escalation** — route a matter the current authority cannot resolve.
- **Intervention** — human-initiated pause, cancel, reprioritize, constrain, or redirect through an action the source product exposes.

Informational activity without an expected response belongs in Observability, not the active steering queue.

## Four-part record

### 1. Request

The request identifies:

- source product, resource, action, and source revision;
- why attention is required;
- choices and their expected consequences;
- relevant facts, unresolved questions, risk, reversibility, and evidence links;
- applicable policy and its explanation;
- eligible decision capability, deadline, and escalation behavior.

### 2. Conversation

The case may contain human questions, system or advisor answers, corrections, constraints, and evidence references. Conversation improves understanding but never implies authorization.

### 3. Resolution

An explicit resolution is one of:

- approve or select an alternative;
- reject;
- request revision;
- defer until a declared condition or time;
- escalate;
- cancel or withdraw when allowed.

It records the actor, rationale, scope, conditions, and the source revision to which it applies. Policy may require rationale for high-impact decisions.

### 4. Source acknowledgement and application

For a source-backed case, Steering first sends the explicit disposition to the source's durable decision ledger. The acknowledgement proves the workflow owner recorded the human- or service-attributed input; it does not prove any domain state changed and does not prescribe the product's next transition.

The source product revalidates authorization and current state, then reports whether the resolution was:

- applied successfully;
- stale because relevant source state changed;
- refused by a hard domain or permission rule;
- unsuccessful because execution failed;
- accepted for asynchronous completion, which remains `awaiting_source`;
- unavailable or timed out with an unknown outcome, which must not be reported as a source failure and remains in the Attention inbox until a later source event reconciles it;
- superseded by direct action or a newer case.

Only successful application proves the domain effect occurred.

## Lifecycle principles

- One logical proposal should not produce multiple active cases through polling or retries.
- A source revision change may make an existing resolution stale.
- A materially revised proposal creates a linked successor rather than rewriting history.
- An unchanged rejected, deferred, revision-requested, or escalated proposal retains that human disposition. A newer source revision may reopen the case for reconsideration.
- A human action performed directly in the source product resolves or supersedes the case as an external action; Steering must not repeat it.
- Withdrawal and expiry retain the full audit record.
- Discussion, policy evaluation, resolution, and application timestamps remain distinct.

## Presentation

The active inbox row should show title, source, reason attention is needed, urgency, age, and assignment. The detail should answer in order:

1. What is proposed?
2. Why am I being asked?
3. What does the system recommend, if anything?
4. What follows each choice?
5. What evidence supports this?
6. What happens if nobody responds?

The smallest useful navigation is `Needs attention`, `Automated`, and `History`. Channels, direct messages, reactions, arbitrary composition, folders, and customizable workflow builders are deferred.
