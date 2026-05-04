# M365 Copilot

## Purpose

Microsoft's first-party AI assistant embedded across the M365 client surfaces — Word, Excel, PowerPoint, Outlook, Teams, and the standalone Copilot chat. Grounded by default in the user's Microsoft Graph data (mail, calendar, files, chats) and tenant content surfaced through Microsoft 365 Copilot Connectors. For most M365-centric organisations it is the path-of-least-resistance AI surface: no engineering required to put generative assistance in front of every licensed user.

## Trade-offs

- **Out-of-the-box value with zero engineering.** A licensed tenant gets immediate productivity assistance grounded in the user's own data; the time-to-first-value is hours rather than the months a custom orchestration takes.
- **Limited customisation; behaviour follows Microsoft's roadmap.** Prompt behaviour, model selection, and grounding rules are Microsoft-controlled. Bespoke knowledge, proprietary tools, or deep workflow integration require Copilot Studio agents, declarative agents, or extensions — not modifications to Copilot itself.
- **Per-user license cost is meaningful.** At list price the licence is one of the highest line items per seat in the M365 catalogue; rollout strategies usually segment users by realised value rather than blanket-assigning across the tenant.
- **Data grounding depends on tenant hygiene.** Quality of Copilot answers tracks the quality of the underlying SharePoint/OneDrive/Teams content and its permissioning; messy permissions amplify into Copilot surfacing content users shouldn't see, while sparse content produces thin answers.
