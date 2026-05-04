# AI Foundry Multi-Agent

## Purpose

Multi-agent orchestration on AI Foundry — coordinator + specialist agents arranged in planner-executor, supervisor-worker, or group-conversation patterns. Designed for problems where a single monolithic agent's prompt and toolbelt grow unmanageable, and where decomposing the work across role-specialised agents yields cleaner reasoning, better tool selection, and more controllable cost.

## Trade-offs

- **Decomposition by design.** Specialist agents (researcher, writer, validator, code-reviewer, …) keep individual prompts focused and tools scoped, which both improves quality and makes evaluation tractable.
- **Cost amplification.** Every agent-to-agent hop adds tokens and latency; naive multi-agent designs can be an order of magnitude more expensive than a well-tuned single agent for the same task. Careful patterning (cheap planner, expensive executor) is required to keep budgets honest.
- **Observability across agents is non-trivial.** Reasoning traces span multiple agents and threads; debugging requires unified tracing tooling that is still maturing on Foundry, and evaluation of an end-to-end run is harder than for a single agent.
- **Patterns are still emerging.** Best practices for failure handling, handback to user, deadlock avoidance, and shared memory across agents are evolving; architectures should expect to iterate on the agent topology more often than they would on a single-agent design.
