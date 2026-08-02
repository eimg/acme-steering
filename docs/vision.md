# Vision

## Automatic with human steering

Acme currently uses deliberate manual checkpoints: accepting inception intent, moving exploratory work toward readiness, authorizing implementation, responding to failed review, merging, and other transitions. Some clicks represent genuine authority; others are mechanical transport around an already-made decision.

Acme Steering makes that distinction explicit. It automates mechanical or pre-delegated actions while retaining human control over intent, ambiguity, exceptions, irreversible effects, merge, and production.

```text
product proposes an existing action
  → Steering evaluates delegation policy
      ├─ automatic → invoke the product-owned action → record outcome
      ├─ human required → Steering Inbox → explicit resolution
      ├─ denied/deferred → explain and preserve the safe state
      └─ unresolved → escalate through a declared route
```

The policy layer initially lives with the inbox because policy evaluation, routing, decision presentation, and resolution history need the same context. It remains conceptually separate so a headless policy service can be extracted later if independent consumers or operational needs justify it.

## Progressive enhancement

Manual workflows are not transitional waste. They are the independently usable baseline and the clearest expression of each product's public action boundary.

When Steering is absent:

- a person uses Projects, Issues, Prelude, Helix, or another product directly;
- no source transaction waits for Steering;
- no additional automation occurs.

When Steering is present:

- it discovers or reconstructs actionable checkpoints through adapters;
- one inbox helps the human understand and resolve them;
- policy may perform explicitly delegated actions;
- direct human action in a source remains valid and reconciles into history.

## Human experience

The inbox should feel finite and calm: "these are the things waiting for judgment," not "here is everything the factory did."

An item explains:

1. what is proposed;
2. why a person is being asked;
3. what the system recommends and how certain it is;
4. what follows each available choice;
5. what evidence supports the request;
6. what happens if nobody responds.

Discussion supports clarification, but only an explicit resolution carries authority. The same case may be resolved directly in its source product; Steering records that fact rather than forcing all human work through one UI.

## Optional advisor

A Steering Advisor may help a human understand one case. It is not a general suite chatbot and not the authority making the decision.

It may:

- summarize the decision context;
- explain why policy paused;
- compare options and consequences;
- identify missing or conflicting evidence;
- use allowlisted Observability facts to explain cross-product state;
- draft a rationale for the human to review.

It may not approve, change policy, bypass authorization, inherit opaque execution-agent context, or present generated claims without source references. Steering remains useful when the advisor is absent.

## Later seams

- External notification adapters may announce local cases and deep-link back to the authoritative inbox.
- A separate headless policy service may emerge when there are real non-inbox consumers.
- A separate Decision Intelligence product may study exported outcomes and propose policies, precedent, or skills.

None of those future seams should become a first-pass dependency.
