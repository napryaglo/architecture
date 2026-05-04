# Power Automate

## Purpose

Low-code workflow engine on the Power Platform. Trigger-action flows, scheduled jobs, approvals, and integration adapters expressed visually with hundreds of pre-built connectors to M365, Dynamics, Azure, and third-party SaaS. Sits where small custom services and integration glue would otherwise be written, and is the default automation primitive in Microsoft-centric estates that cannot or should not staff a custom-code team.

## Trade-offs

- **Time-to-first-flow is hours, not weeks.** For common integration patterns (approval routing, list-to-list sync, file triggers, notification fan-out) the connector library and visual designer collapse what would otherwise be a small service into a working flow in an afternoon.
- **Per-action metering shapes architecture.** API call counts, premium connectors, and AI Builder actions are all billed; high-volume flows quickly outgrow the included quota and become cheaper as Logic Apps or Azure Functions.
- **Observability and reliability ceilings.** Run history is fine for ad-hoc debugging; production-grade tracing, retries with custom policies, and idempotency for long-running orchestrations push teams toward Logic Apps Standard or Durable Functions.
- **Long-running orchestration limits.** Default flows have execution-time and run-history caps unsuitable for multi-hour or human-in-the-loop processes; Power Automate Process Mining and Approvals help, but truly long-lived workflows belong in workflow engines designed for them.
