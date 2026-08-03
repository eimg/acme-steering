# Workflow notification contract

The first adapter contract is `acme.steering.notification.v1`. Prelude, Helix, Acme Issues, and Acme Projects may publish durable lifecycle transitions to `POST /api/notifications`. Identity, Primer, Observability, and Todo do not publish workflow events in this slice.

Prelude's Connections screen validates its delivery credential without creating an event by calling `POST /api/notifications/check` with its product name. Other sources may use the same public probe in future configuration surfaces. The endpoint applies the same product-specific notification permission used for ingestion and returns no secret material.

An adapter is optional and disabled when `ACME_STEERING_URL` is empty. It sends only after the source mutation succeeds, uses a two-second timeout, and never makes source workflow success depend on Steering availability. In local-auth mode it uses a product-bound `steering.notify.<product>` service token from `ACME_STEERING_TOKEN`; that token is attached only when the destination origin is listed in `ACME_TRUSTED_STEERING_ORIGINS`. Steering checks that the credential's product permission matches the payload's declared source.

Each notification contains:

- a stable event id for idempotent ingestion;
- the source product, resource identity, source revision, and optional public URL;
- a durable event type, occurrence time, human-readable summary, and optional detail;
- optional Steering case data: a stable case key, current state, decision context, risk, reversibility, and policy facts.

Steering appends every accepted event to its Activity journal. An `open` case event creates or refreshes a case at the newest source revision. An unchanged notification does not erase a human rejection, deferment, revision request, escalation, or cancellation; a newer source revision reopens the case with prior decision-delivery metadata cleared. `resolved`, `withdrawn`, and `superseded` events close the corresponding case and append a system-authored remark. Duplicate event ids are acknowledged without repeating either effect.

The source remains authoritative. Every source-backed resolution is returned through [`acme.steering.decision.v1`](decision-contract.md). Approval may additionally enter `awaiting_source`; it is not reported as applied until an action receipt or later source event confirms the transition. A human may still act in the sibling UI, and that sibling's next event reconciles the inbox. This preserves the existing manual workflow and prevents stale Steering buttons from becoming a second source of truth.

Approved actionable checkpoints now use the narrow product-owned command and receipt contract in [action-contract.md](action-contract.md). The owning product reauthorizes, revalidates the source revision, and returns the authoritative receipt; later events still reconcile direct or asynchronous actions. Merge remains in Acme Issues, and Projects still hands work only to Issues.

Ownership is deliberately deferred. Steering is admin-operated in this first pass; notifications carry stable resource seams so a future ownership model can route by workflow owner without changing the event envelope.
