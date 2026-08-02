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
| Authentication | Standalone local operator or optional Acme Identity adapter |
| Authorization | Permission strings and source reauthorization; no fixed role names |
| Observability | Optional read-only correlation context, never workflow authority |
| Advisor | Optional, case-bound, read-only, evidence-linked, non-authoritative |
| Initial advisor access | Steering case plus optional authorized Observability reads |
| External channels | Deferred; future notification adapters around the local inbox |
| Decision Intelligence | Separate optional future product, not part of Steering |
| Default port | `8323` reserved |
| Launcher | Do not add until a runnable service and health behavior exist |

## Deliberately deferred

- Exact implementation stack and package structure, although a single local TypeScript/HTTP/UI/SQLite shape is the leading suite-consistent option.
- Exact policy configuration syntax and editing UI.
- Final permission vocabulary after routes and actions exist.
- Which source adapter ships first, pending public-contract verification.
- External email, Slack, Teams, Telegram, desktop, or mobile notification adapters.
- Direct advisor adapters to source products.
- Whether policy later merits an independent headless service.
- Hosted deployment, multi-organization tenancy, and enterprise policy administration.
- Decision Intelligence exports beyond preserving ordinary audit-quality steering records.
