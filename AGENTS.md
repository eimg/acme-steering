# Acme Steering agent guide

Acme Steering is the optional local decision inbox and delegation-policy coordinator for the Acme Software Factory. The repository contains a runnable local implementation plus workflow-notification and decision adapters for the four workflow-owning siblings.

Treat this as an executable reference architecture, not a universal governance platform. Keep the first implementation focused, independently runnable, and useful without sibling services, credentials, a model provider, or network access.

## Read first

1. [`README.md`](./README.md) for positioning, boundaries, and document routing.
2. [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) before choosing first-pass scope.
3. [`docs/decisions.md`](./docs/decisions.md) before reopening a settled direction.
4. [`docs/architecture.md`](./docs/architecture.md) before choosing integrations, persistence, authentication, or runtime boundaries.
5. [`docs/steering-case.md`](./docs/steering-case.md) before changing inbox or decision lifecycle behavior.
6. [`docs/policy-model.md`](./docs/policy-model.md) before changing automation, rejection, or escalation semantics.
7. [`docs/implementation-plan.md`](./docs/implementation-plan.md) for sequencing.

## Invariants

- Existing manual product workflows remain valid when Steering is absent.
- Products own domain state, hard invariants, permission enforcement, and final action validation.
- Steering policy governs delegation: automatic, human-required, denied, deferred, or escalated.
- Steering follows existing product boundaries. It must not create a Projects → Helix shortcut or make Prelude trigger Helix directly.
- Automatic actions use an attributable service principal and record the policy version; they never masquerade as human decisions.
- Discussion never implies authorization. Resolution is explicit and structured.
- Every source-backed resolution is delivered through `acme.steering.decision.v1`; the source records it but owns what happens next. Only an explicit product action contract may request a transition.
- An unchanged human-rejected, deferred, revision-requested, or escalated proposal is not automatically reopened.
- Stale decisions are not applied after relevant source state changes.
- Acme Identity is optional and replaceable. Gates use permission strings, never fixed role names.
- Observability stays read-only and optional. Never read a sibling database or expand Observability into a decision-content warehouse.
- The implemented advisor is case-bound, read-only, evidence-linked, and non-authoritative. Its first slice sees only the case and durable discussion; direct sibling and Observability access remain deferred. The inbox works without a model provider.
- The implemented config author sees only the active Steering policy and its own conversation. It may explain and propose a complete replacement config, but only a separate `steering.manage` activation may create a new active version.
- Keep direct declarative editing available. Agent authoring is an optional interface over the same validated, versioned configuration, not a second policy source.
- Decision Intelligence, policy self-modification, skill generation, fine-tuning, and reinforcement learning are out of scope.

## Repository state

- Reserved default port: `8323`.
- Runtime: Node.js, TypeScript, Express, React/Vite, and SQLite via `better-sqlite3`.
- `ACME_AUTH_MODE=off` is the standalone default and resolves an explicit local development administrator.
- `ACME_AUTH_MODE=local` uses the shared `acme-identity` consumer package over HTTP and fails closed when Identity is unavailable.
- Current human route gates are `steering.read`, `steering.decide`, and `steering.manage`; `steering.automate` is the attributable service-principal seam.
- `steering.manage` now gates direct policy activation and config-agent discussion/activation. `steering.automate` remains the service-principal seam.
- The root gitlink and portable GitHub remote already exist.
- The suite launcher starts Steering last through `npm run dev`; standalone development uses the same command.
- Fixture cases still use deterministic acknowledgements. Source-backed cases enter through `acme.steering.notification.v1`; all resolutions return through `acme.steering.decision.v1`, while approval may invoke only an allowlisted `acme.steering.action.v1` command. A decision receipt is not application evidence.
- Steering derives bounded reference risk from the action contract and structured facts; never trust sibling-provided risk labels as authority. Unknown actions remain `unassessed`, and ownership routing remains a distinct later layer.
- Current human access is administrator-only. Do not infer or invent workflow ownership; preserve the source product/resource seam for a later explicit ownership model.
- Notification delivery is optional, post-transaction, bounded, idempotent, and non-blocking. Source products remain useful when Steering is absent.
- `POST /api/notifications/check` validates a source's product-bound notification permission without ingesting a fake event. Prelude, Helix, Issues, and Projects expose this through their Connections screens; credentials remain server-side.
- An unavailable decision delivery may be retried explicitly with the same decision ID. Do not invent blind action retries or represent a retry attempt as an applied workflow effect.
- Policy rules are deterministic, ordered, and first-match-wins. Existing case evaluations remain historical snapshots when a later config version is activated.
- Advisor questions and generated answers are discussion messages only. They must never set a resolution, invoke an action, or be presented as source evidence.

## Validation

For all implementation changes:

```bash
npm run verify
```

For documentation-only work, at minimum:

```bash
git diff --check
```

Also verify every relative Markdown link resolves. HTTP tests open temporary loopback listeners; a restricted execution environment may need local binding permission before treating `listen EPERM` as a regression.
