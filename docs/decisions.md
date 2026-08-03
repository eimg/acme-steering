# Settled decisions

These decisions form the accepted inception baseline. Future implementation may refine details through evidence but should not silently reverse the boundaries.

| Decision | Accepted direction |
|---|---|
| Product name | Acme Steering; Inbox is its primary human surface |
| Product purpose | Optional local coordination of human steering and delegated automation |
| Existing workflows | Preserve them as the baseline and fallback |
| Authority | Source products remain authoritative for domain state and action validity |
| Policy location | Embedded in Steering initially, conceptually separable |
| Policy scope | Delegation and routing, never replacement of product invariants |
| Primary UX | Email-style list/detail, not Slack/Telegram-style channels |
| Primary views | Needs attention, Automated, History |
| Discussion | Case-bound; conversation never implies authorization |
| Automatic actions | Explicit policy plus attributable service principal |
| Human rejection | Suppresses unchanged automatic resubmission |
| Direct product actions | Continue to work and reconcile into Steering history |
| Integration | Public product adapters; no sibling imports or database reads |
| Projects boundary | Preserve Projects → Issues → Helix; no direct Projects → Helix action |
| Prelude boundary | Preserve accepted export → Helix pickup; Prelude does not trigger Helix |
| Authentication | Standalone local operator or shared `acme-identity` consumer adapter; Identity service remains optional in `off` mode |
| Authorization | Permission strings and source reauthorization; no fixed role names. First pass is administrator-only in practice through wildcard permission |
| Runtime | TypeScript, Express, React/Vite, and SQLite in one independently runnable service |
| First policy form | Small deterministic evaluator in code; no general policy language or policy editor |
| Observability | Optional read-only correlation context, never workflow authority |
| Advisor | Optional, case-bound, read-only, evidence-linked, non-authoritative |
| Initial advisor access | Steering case plus optional authorized Observability reads |
| External channels | Deferred; future notification adapters around the local inbox |
| Decision Intelligence | Separate optional future product, not part of Steering |
| Default port | `8323` reserved |
| Launcher | Start Steering last through the root launcher's common `npm run dev` contract |

## Deliberately deferred

- Exact policy configuration syntax and editing UI.
- Ownership semantics beyond the current administrator-only human mode. Source publishing uses product-bound `steering.notify.<product>` permissions; policy management and automation permissions remain future seams.
- Additional action keys beyond the four mechanical reference journeys; risk assessment remains unimplemented and source-backed cases are explicitly unassessed.
- External email, Slack, Teams, Telegram, desktop, or mobile notification adapters.
- Direct advisor adapters to source products.
- Whether policy later merits an independent headless service.
- Hosted deployment, multi-organization tenancy, and enterprise policy administration.
- Decision Intelligence exports beyond preserving ordinary audit-quality steering records.
