# Copilot Agent

## Purpose

Single-purpose agent authored and hosted on Copilot Studio: topics, generative answers, knowledge sources, and tool/connector invocations expressed declaratively, then surfaced through Microsoft 365 Copilot, Teams, the web, or custom channels. Distinct from autonomous-agent runtimes — a Copilot Agent is invoked in a user-driven session, exists for the duration of a conversation, and follows an authored conversational design rather than acting goal-directed across long horizons.

## Trade-offs

- **Fast authoring path with M365 reach.** Same authoring experience as Copilot Studio bots; publishing into the M365 Copilot agent gallery puts the agent in front of every licensed Copilot user in the tenant without bespoke distribution.
- **Bounded reasoning surface.** Tool selection, branching, and multi-step reasoning are lighter than what a pro-code agent on AI Foundry can express; complex orchestrations or long-running plans are not the right fit.
- **Per-message metering.** Generative-answer and tool-call actions are billed by message; high-volume scenarios — automated triage, batch answering — need a budget envelope and may be cheaper as Foundry-hosted agents.
- **ALM travels with Power Platform.** Solutions, environments, and DLP policies are the deployment unit; teams without Power Platform ALM in place inherit that maturity curve as part of agent delivery.
