# Copilot Studio

## Purpose

Low-code authoring environment and runtime for conversational and procedural agents on the Power Platform. Citizen developers and IT-led teams use it to define topics, dialogues, generative responses, knowledge sources, and tool/connector calls; the same product hosts the published agent at runtime. It is the primary path for agents that need tight integration with Microsoft 365 / Dataverse / Power Automate without deploying custom code.

## Trade-offs

- **Speed of authoring vs ceiling on complexity.** Visual designer plus generative AI features make first-version agents fast to build; deeply branching logic, custom orchestration, or fine-grained tool-call control still pushes teams toward Azure-hosted code.
- **Built-in M365 / Power Platform integration.** First-class connectors to Dataverse, SharePoint, Teams, and the Microsoft Graph reduce plumbing — at the cost of weaker portability if the architecture later needs to leave the Microsoft estate.
- **Governance via Power Platform admin tooling.** DLP policies, environments, and ALM travel from the broader Power Platform; teams that haven't already invested in those controls inherit a learning curve.
- **Pricing model.** Per-message metering on generative actions can be surprising at scale; budget envelopes need to be set explicitly during scenario design.
