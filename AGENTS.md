# Acme Steering agent guide

Acme Steering is the optional local decision inbox and delegation-policy coordinator for the Acme Software Factory. Implementation has not started; the repository currently contains the accepted inception documents.

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
- An unchanged human-rejected proposal is not automatically retried.
- Stale decisions are not applied after relevant source state changes.
- Acme Identity is optional and replaceable. Gates use permission strings, never fixed role names.
- Observability stays read-only and optional. Never read a sibling database or expand Observability into a decision-content warehouse.
- The optional advisor is case-bound, read-only, evidence-linked, and non-authoritative. The inbox works without it.
- Decision Intelligence, policy self-modification, skill generation, fine-tuning, and reinforcement learning are out of scope.

## Repository state

- Reserved default port: `8323`.
- No runtime or stack has been created yet.
- Do not add a root gitlink until this child repository has an intentional commit and a portable remote.
- Do not add Steering to the suite launcher until it has a documented runnable command and health behavior.

## Validation

For documentation-only work:

```bash
git diff --check
```

Also verify every relative Markdown link resolves. Once implementation exists, replace this minimal gate with one documented `verify` command covering typecheck, tests, build, and the standalone acceptance journey.
