# Product-owned action contract

`acme.steering.action.v1` is the mechanical command envelope used after an administrator approves a source-backed case. Steering sends it only to the configured base URL for the case's product and instance. Credentials are server-held, edge-specific, and attached only to an explicitly trusted origin.

The request carries a stable request id, case and decision correlation, an allowlisted action key, resource identity, and the source revision the administrator inspected. It does not carry a generic URL, HTTP method, status mutation, owner, or risk decision.

Each workflow owner exposes `POST /api/steering/actions` and accepts only its implemented action keys:

- Prelude: `prelude.package_accepted_export`;
- Acme Projects: `projects.submit_ready_card`;
- Acme Issues: `issues.trigger_implementation`;
- Helix: `helix.recover_run` for paused or interrupted runs, including explicit confirmation of uncertain retries.

The product authenticates the caller with an action-specific Steering permission, reloads live state, checks the expected revision and domain invariants, applies the action through product-owned logic, and returns `acme.steering.action-receipt.v1`.

Receipt states are `applied`, `already_applied`, `accepted`, `stale`, `rejected`, or `unavailable`. Only `applied` and `already_applied` prove a completed domain effect. `accepted` keeps the case waiting for a later source event. A timeout or invalid response is unavailable/unknown rather than evidence of failure at the source.

The first transport supports one configured destination instance per product. Notifications carry `source.instanceId`; Steering refuses invocation when it does not match the configured instance, preventing a case from being sent to the wrong Helix or sibling process. A future registry may support several explicitly configured instances.

Risk assessment and resource ownership routing are not part of this contract. Source products report deterministic state and effects; source-backed cases are currently displayed as `unassessed` and remain administrator-decided until a later Steering risk policy exists.
