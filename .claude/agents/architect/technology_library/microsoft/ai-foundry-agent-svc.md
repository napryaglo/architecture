# AI Foundry Agent Service

## Purpose

Azure-hosted managed runtime for pro-code AI agents. Hosts agent definitions (instructions, tools, knowledge), orchestrates multi-step reasoning over OpenAI and other supported models, and exposes a stable API surface for embedding agents into custom applications. The pro-code counterpart to Copilot Studio — the path of choice when an agent's logic exceeds the ceiling of declarative authoring or when integration must live on Azure rather than Power Platform.

## Trade-offs

- **Pro-code freedom over orchestration.** Custom planning, tool routing, intermediate evaluations, and bespoke memory strategies are all available; nothing about the runtime forces a specific conversational pattern, unlike Copilot Studio's topic graph.
- **More plumbing than declarative authoring.** Knowledge wiring, tool registration, deployment, and observability are engineering tasks; an MVP takes longer than the equivalent Copilot Studio bot, and the team needs an Azure delivery capability.
- **Tools via OpenAPI and MCP.** Function calling is expressed as OpenAPI specs or MCP servers, which keeps the tool surface portable across runtimes and clear in code review — at the cost of tooling and conventions still settling.
- **Service surface is evolving.** Agent runtime APIs, evaluation tooling, and trace/observability primitives are changing release-to-release; architectures that depend on specific Foundry features should expect periodic refactors as the platform stabilises.
