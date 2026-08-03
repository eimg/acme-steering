# Acme Steering inception specification

**Status:** accepted product baseline; incremental implementation in progress

**Product:** `acme-steering`

**Reserved default port:** `8323`

## 1. Objective

Build an optional, local-first steering coordinator for the Acme Software Factory. It provides one durable inbox for human decisions and an embedded delegation-policy layer that may perform existing product actions automatically when policy explicitly permits.

Steering does not replace current manual workflows. It progressively enhances them while source products remain independently runnable and authoritative for their own state.

## 2. Primary user questions

The product should answer:

1. What currently needs human attention or authority?
2. Why was this action not performed automatically?
3. What is proposed, what are the alternatives, and what happens after each choice?
4. Which evidence supports the request or recommendation?
5. Who may decide, when does the request expire, and where will it escalate?
6. Did the source product accept and successfully apply the decision?
7. Which actions were automated, under which policy, and as which principal?

## 3. Accepted product scope

### 3.1 Steering Inbox

- Email-style list and detail experience rather than channels or a chronological chat feed.
- Primary views: `Needs attention`, `Automated`, and `History`.
- Case-bound discussion for questions and added constraints.
- Explicit structured resolutions; conversational language alone never authorizes an action.
- Clear links to authoritative source objects and evidence.
- Honest display of pending, applied, stale, rejected, expired, withdrawn, and failed outcomes.

### 3.2 Delegation policy

- Policy is hosted inside Steering initially as a distinct conceptual module.
- It decides whether a proposed valid action is automatically authorized, requires a human, is denied, is deferred, or must escalate.
- It evaluates explicit context, risk, reversibility, prior attempts, evidence, and policy version.
- It does not replace product-owned hard constraints or authorization.
- Automatic action is attributable to a service principal and policy version.

### 3.3 Human steering

Support:

- approval or selection of an alternative;
- rejection;
- request for revision;
- clarification and added constraints;
- deferment;
- bounded policy-exception requests;
- escalation;
- human-initiated pause, cancellation, or redirection where the owning product exposes that action.

### 3.4 Escalation

- Capability-based routing rather than fixed role names.
- Primary owner, reminder, authorized delegate, higher authority, and declared safe timeout behavior.
- Silence never becomes approval for a high-impact action.
- Repeated failure, repeated rejection, conflicting decisions, unavailable authority, security findings, and material scope expansion remain distinguishable reasons.

### 3.5 Product integration

- Adapters use stable public HTTP contracts and existing product-owned actions.
- Steering does not read sibling SQLite databases or import sibling source code.
- Direct action in a source product remains supported and reconciles without duplication.
- Steering follows established boundaries, including Projects → Issues → Helix and Prelude export → Helix bootstrap.
- If existing public contracts are insufficient, add the smallest optional source-owned contract only after a real acceptance journey proves the gap.

### 3.6 Optional advisor

- Case-bound assistance may summarize context, explain policy, compare options, identify missing evidence, and draft rationale.
- Initial evidence boundary is the steering case plus optional authorized Acme Observability access.
- It does not receive unrestricted suite-wide access, approve actions, change policy, or treat generated text as evidence.
- The product remains usable without a model, credentials, or network.

## 4. Ownership and independence

- Source products own workflows, domain truth, hard safety rules, authorization enforcement, and action application.
- Steering owns its case, discussion, resolution, policy evaluation, routing, and action-attempt history.
- The source revalidates current state before applying a Steering resolution.
- Steering absence or failure does not break source products.
- Source failure does not permit Steering to claim an action succeeded.
- Acme Identity is one optional principal and permission adapter.
- Acme Observability remains an optional read-only projection and never becomes workflow authority.

## 5. Standalone first implementation

The first runnable slice should prove the mechanism with deterministic local fixtures:

1. Display fixture cases in `Needs attention`.
2. Allow discussion and explicit resolution.
3. Evaluate a small set of versioned delegation policies.
4. Demonstrate one automatically authorized case and one human-required case.
5. Record application success, rejection, revision, stale state, and safe timeout behavior.
6. Show `Automated` and `History` without any sibling product running.
7. Restart and retain the complete case and decision history.

The first real adapter should be selected only after verifying the owning product's current public API. A strong candidate is the existing Acme Projects → Acme Issues implementation-start checkpoint because it demonstrates manual fallback, human authorization, policy automation, and reconciliation without changing the Projects → Issues → Helix boundary.

### Implemented in the current slice

- A durable SQLite case and discussion store with restart recovery.
- `Needs attention`, `Activity`, `Automated`, and `History` in a responsive email-shaped UI.
- Explicit structured decisions kept separate from case discussion.
- A versioned, deterministic policy evaluator with automatic, human-required, denied, deferred, and escalated classifications.
- Immutable declarative policy versions, direct expert editing, and a config-only authoring agent whose proposals require explicit human activation.
- Read-only policy preview against current cases before activation.
- Steering-owned bounded risk classification; unknown actions remain explicitly unassessed.
- A case-bound advisor in every durable discussion, with offline/live adapters and no resolution or workflow authority.
- Fixture application acknowledgement, rejection suppression, stale-revision protection, and human/service-principal provenance.
- Standalone `off` authentication and replaceable Acme Identity `local` authentication with fail-closed behavior.
- One verification command covering typechecking, policy, persistence, HTTP/auth behavior, and production build.
- Optional `acme.steering.notification.v1` ingestion from Prelude, Helix, Issues, and Projects with an idempotent Activity journal and source-event reconciliation.
- Source-backed approval waits for source confirmation rather than claiming a domain effect.
- Every source-backed human disposition is durably returned to the workflow owner; receipt records steering input but leaves the next domain transition product-owned.
- The accepted, reversible Prelude export demonstrates service-principal automation with durable authorization, delivery, invocation, and reconciliation history.
- Minimal capability-routed escalation records a required permission, optional deadline, and remain-paused fallback.

### Still required to complete the original gate

- Scheduled expiry and declared safe-timeout behavior.
- Scheduled escalation reminders and timeout processing.
- Case ownership, capability-based assignment, delegation, and higher-authority escalation routing.
- Additional product actions beyond the first allowlisted Prelude export, Projects submission, Issues trigger, and Helix recovery commands.
- Broader risk classification, ownership routing, and advisor enrichment from authorized external context remain separate later increments.

## 6. Non-functional expectations

- Local-first and independently runnable.
- One local service and one durable local store for the first slice.
- No required cloud service, external notification channel, or paid API.
- Deterministic offline verification.
- Explicit diagnostics for policy version, case state, source reachability, action attempts, and stale decisions.
- Responsive desktop UI with a functional narrow viewport.
- Safe failure: ambiguity and unavailable dependencies preserve the manual or paused path.

## 7. Explicit non-goals

- Replacing source-product workflows or domain rules.
- Requiring every product to push events to Steering.
- Direct Projects → Helix triggering.
- Prelude-triggered Helix execution.
- Automatic human merge or production deployment.
- General project management, chat, email, incident management, or observability feeds.
- A universal policy language or enterprise governance platform.
- Decision Intelligence, automatic lesson extraction, Primer episode projection, skill generation, fine-tuning, or reinforcement learning.
- Mandatory direct advisor access to every product.
- Slack, Teams, Telegram, email, or other external channels in the first pass.

## 8. First completion gate

The standalone completion gate is complete only when:

- all standalone journeys in section 5 work without sibling services or network access;
- manual resolution, automatic policy resolution, rejection, stale handling, and restart recovery are verified;
- no conversational response can accidentally authorize an action;
- automatic actions display service-principal and policy provenance;
- docs match shipped behavior and limitations;
- one documented verification command passes offline.
