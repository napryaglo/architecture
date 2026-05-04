# 01 — Meta-model

The conceptual core of the architecture description language. Five decisions shape how an architecture is structured.

## Two component properties + an explicit id

A component carries three required fields:

- `id` — globally unique identifier. Always present and visible on every component (a property, not just a YAML key). Authors can supply it explicitly; the compiler autogenerates it from `label` + `category` if the entry omits it.
- `label` — display name on the diagram. Single string or list (for a multi-line label).
- `category` — the type-level archetype this component instantiates (e.g. `ai-agent`, `database`, `messaging`).

Plus one resolution-side property:

- `implemented-by` — list of technologies that realise this component (e.g. `[copilot-agent]`).

Everything else about a component's relationship to other components or platforms is expressed as a **connector** (next section). Properties answer "what is this thing?"; connectors answer "what does this thing do, who depends on it, and what is it built on?".

## Six connector types

Connectors are typed edges between components, locations, blocks, or actors. Six types are recognised — three describe runtime behaviour, three describe structural facts.

| Type | What it expresses |
|---|---|
| `calls` | Synchronous runtime invocation. A calls B and waits for response. |
| `event` | Asynchronous runtime emission. A emits an event B reacts to. |
| `consumes` | A reads or uses data/services from B as part of its operation. |
| `available-through` | A is exposed/accessed via B (gateway, MCP server, inference endpoint). |
| `enabled-by` | B is the platform/tool used to author, build, or configure A. |
| `hosted-by` | B is the runtime container that operates A in production. |

Each type may render distinctly on a diagram. The renderer dispatches on `type:` from the unified compiled `connectors:` block.

## Authoring surfaces for connectors

| Surface | Carries which connector types |
|---|---|
| **Scenario sequences** (flow-time edges, grouped by entry point) | `calls` (default), `event`, `consumes` |
| **Source `connectors:` block** (typed standalone edges) | All six types |

Step grammar: `<src> → <dst>` defaults to `calls`. Bracket-annotate for non-default kinds: `<src> →[event] <dst>`, `<src> →[consumes] <dst>`.

A scenario carries one or more **sequences**. Each sequence has a `Title`, an `Entry Point` (the actor or component that initiates it), and an ordered `steps:` list. Multiple sequences let one scenario describe several entry points that produce the same outcome.

Standalone connectors accept three entry shapes — object, pair, or natural-language string. Full reference: [02 — Schema](02-schema.md).

## Same-type components never collapse

Multiple components of the same type in one architecture is the **normal case**, not the exception. They differ by purpose, communication channel, or underlying technology. Each is a distinct entity with its own ID.

The `category:` field carries the type-level role (shared across instances); the ID carries the disambiguator drawn from purpose, communication channel, or underlying technology. Concrete example: the architecture has four `ai-chat` components, distinguished by technology — `teams-chat`, `sharepoint-chat`, `m365-copilot-chat`, `dynamics-chat`. They do not collapse into one component with multiple implementations.

## Globally unique IDs

A component is identified by its **`id` alone**, which is unique across the entire architecture. Actors, blocks, locations, and components share one global namespace.

References everywhere are bare ids. There is no `<location>:<id>` qualified form — the location is a containment attribute on the component, not part of its identity.

```yaml
scenarios:
  conversational:
    label: Conversational
    sequences:
      - sequence:
          Title: User-Initiated Conversation with AI Agent
          Entry Point: business-user
          steps:
            - business-user      → chat-surface
            - chat-surface       → business-agent
            - business-agent     → agent-orchestrator
            - agent-orchestrator → knowledge-index
```

The `components:` block is grouped by location for organisation. Inside each location, components are written as a list of objects — each with an explicit `id:`:

```yaml
components:
  power-platform:
    - id: business-agent
      label: [AI, Agent]
      category: ai-agent
      implemented-by: [copilot-agent]
    - id: agent-orchestrator
      label: [Agent, Orchestrator]
      category: orchestration-engine
      implemented-by: [copilot-studio]
  azure:
    - id: service-agent          # globally unique, distinct from business-agent
      label: [AI, Agent]
      category: ai-agent
      implemented-by: [ai-foundry-agent-svc]
```

The location grouping is purely organisational; the compiler treats it as the component's `in:` attribute and validates that the implementing technology is `available-in` that location. Two components with the same `id` anywhere in the architecture is a duplicate-id error.
