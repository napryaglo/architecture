# Microsoft Autonomous Agent

## Purpose

Microsoft's category of long-running, goal-directed agents — agents that act on a stated objective over time, possibly across many sessions and without a user actively prompting each step. Distinct from a Copilot Agent (turn-driven, conversation-bounded): an autonomous agent is given a goal, a set of tools, and trust boundaries, then runs until the goal is met, blocked, or revoked. Authored on Copilot Studio and on AI Foundry depending on the integration target.

## Trade-offs

- **Goal-directed, not topic-directed.** Autonomous agents can decompose objectives, schedule their own work, and resume across user sessions — a pattern Copilot-Agent topics cannot express cleanly. Right tool for proactive monitoring, multi-step research, or watch-and-act scenarios.
- **Trust and audit demands are higher.** A goal-directed agent acting between sessions raises questions about consent, action approval, and audit that turn-based agents avoid. Production use requires explicit DLP, action-approval, and traceability design before rollout.
- **Consumption-based pricing with variable cost per goal.** Per-message metering doesn't fit; cost is shaped by how many tool calls and reasoning steps the agent takes to reach (or abandon) a goal. Budget envelopes and cost circuit-breakers are necessary, not optional.
- **Governance and tooling still maturing.** Multi-agent collaboration, action approvals, long-term memory, and observability across long-running agent runs are evolving rapidly across both Copilot Studio and AI Foundry; architectural choices made today are likely to be revisited.
