# 03 — Libraries

The category and technology vocabularies an architecture draws from. Architectures `import:` libraries; the compiler resolves and inlines them.

## Why libraries

Architectures share a meta-model (categories like `database`, `ai-agent`, `messaging`) and a technology vocabulary (Microsoft Graph, Azure SQL, Copilot Studio). Putting these in shared libraries means:

- **Reuse.** Multiple architectures pull from the same authoritative definitions.
- **Retargeting.** Swap the `microsoft` library for an `aws` or `gcp` library and the same architecture model points at different technologies — categories and component IDs unchanged.
- **Discoverability.** A library's `index.yaml` plus its per-technology wiki pages are a navigable catalogue of what's available.

## Library structure

```
technology_library/<library-name>/
  index.yaml                # entries + imports
  resources/                # icons (optional, library-specific)
  <tech-id>.md              # per-technology wiki page (purpose + trade-offs)
  …
```

`index.yaml` shape — three top-level keys, all optional:

```yaml
imports: [<other-library>, …]   # cross-library dependencies
categories:
  <id>: { icon }
technologies:
  <id>:
    label:         <display name>
    icon:          <path>
    available-in:  [<location>, …]
    applicable-to: [<category>, …]
    wiki:          <filename>.md
```

A library may expose categories, technologies, both, or neither — and may import other libraries.

## Cross-library imports

Libraries can declare their own `imports:` clause. Imports resolve **transitively** — anything that imports `microsoft` automatically gets `default` because microsoft declares it as a dependency. The compiler walks the import graph with cycle protection.

Architecture-level convention: even when transitively reachable, every dependency is listed explicitly in the architecture's `imports:` clause. The clause stands as the architecture's full dependency manifest.

## Current libraries

### `default`

Twelve meta-model categories — the type-level archetypes of components: `ai-chat`, `ai-agent`, `orchestration-engine`, `semantic-index`, `foundation-model`, `mcp-server`, `legacy-application`, `database`, `data-store`, `messaging`, `service`, `api`, `platform-api`.

Carries category icons (currently coupled to `microsoft/` glyphs as a soft dependency — flagged as a known issue, to be replaced with vendor-neutral icons later).

### `microsoft` (imports `default`)

Twenty-four Microsoft cloud technologies — Microsoft 365 (Graph, Teams, SharePoint, Dynamics, Copilot), Power Platform (Studio, Agent, Automate, BI, Dataverse, Work IQ), Azure (AI Search, AI Foundry agent services, OpenAI, Event Hub, Service Bus, Blob, SQL, Fabric, OneLake).

Each technology has:

- An entry in `index.yaml` with `label`, `icon`, `available-in`, `applicable-to`, `wiki`.
- A `<tech-id>.md` wiki page in the library folder describing **purpose** and **trade-offs**.
- An icon SVG in `microsoft/resources/`.

## Inline overrides at the architecture level

The architecture file can declare its own `categories:` and `custom-technologies:` inline, alongside `imports:`. These **override** library entries on id collision and are used for architecture-specific entries that aren't reusable across architectures (custom services, project-specific glue). The asymmetry — libraries use `technologies:`, architectures use `custom-technologies:` — is deliberate: it makes a project-side block read as "ours, not from a library" without ambiguity.

Concrete inline entries in `ai_ea/ai_ea.arch.yaml`:

| ID | Reason for being inline |
|---|---|
| `custom-validator-svc` | Architecture-specific custom service. |
| `published-mcp-server` | Project-specific MCP wrapper around enterprise tools. |
| `legacy-mcp-server` | Project-specific MCP bridge for legacy apps. |
| `legacy-app` | Generic placeholder for legacy systems. |

## Resolution order

When the compiler resolves the registries:

1. Walk the import graph (depth-first, with cycle protection). Earlier-visited libraries win on collision **within imports**.
2. Apply the architecture's inline `categories:` and `custom-technologies:` last. **Inline always wins over imports.**

The resolved registries are inlined into `ai_ea/output/ai_ea.arch.compiled.yaml` with the `imports:` clause removed — see [04 — Compiler](04-validation-and-compiler.md).
