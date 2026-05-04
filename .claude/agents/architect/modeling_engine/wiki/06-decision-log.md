# 06 — Decision log

A chronological record of design decisions made during the modeling-engine work, with the alternatives considered and the rationale for what was chosen. All dates 2026-04-27 unless noted.

## Scope and context

The work began as a request to open a new `modeling_engine` research thread, was briefly scoped as "schema + templates + validator" for authoring discipline, then redirected to "actually let's work on the DSL" — the `product_strategy/research/dsl/` thread, which already had a schema sketch. The design decisions below shape what an architecture description language looks like and how its tooling resolves.

## Three relationship types (not two)

**Decision.** The model recognises three distinct relationship types: **Interaction** (runtime calls — scenario steps), **Enablement** (build-time / authoring — component property `enabled-by`), **Hosting** (runtime container — component property `hosted-by`).

**Considered.** Two-type framing (Interaction vs. Dependency/Enablement). Rejected because Enablement and Hosting model different couplings — Bicep enables an Azure Function but Azure Functions hosts it; Copilot Studio does both.

**Why it matters.** Each type may need distinct visual treatment (interaction = arrowed flow line; enablement / hosting may render as nesting or a dashed link). The principle is settled; specific rendering is deferred to the visualization side.

## Purpose-first component naming

**Decision.** Components are named for their architectural role; the implementing technology is captured separately as `implemented-by`. The architecture model expresses durable intent; technology choices are resolvable attributes that can change without invalidating the model.

**Considered.** Tech-first naming (the existing convention — `dataverse`, `copilot-studio`). Rejected because it conflates *what we need* with *what we chose*; renaming a technology forces a model edit.

## Reference targets and cardinality

**Decisions, all settled in one round:**

- `enabled-by` and `hosted-by` may reference either a component **or a location** (whole platforms can host or enable). `implemented-by` stays technology-only.
- All three properties (`implemented-by`, `enabled-by`, `hosted-by`) are **list-valued**. Single use is just a list of length one.
- Property placement: **inline on the component**, not a separate top-level relationships block.
- Spelling: **`implemented-by`** (passive past participle), not `implements-by`.

## Compound-block consistency via `available-in`

**Decision.** Each technology declares `available-in: [<location>...]`. The validator checks that a component's `in:` location is in its implementing technology's `available-in`. Falls out for free for compound building blocks: nested components inherit the block's location, so any location-mismatched implementation gets caught.

## Same-type components never collapse

**Decision.** Multiple components of the same type in one architecture is normal. They remain distinct entities with their own IDs. They differ by purpose, communication channel, or underlying technology.

**Considered and rejected.** An earlier read of a thread instruction collapsed the four chat surfaces into one `ai-chat` component with multi-valued `implemented-by`. Walked back: collapse loses meaningful structure.

**Concrete consequence.** The chat-surface block contains four `ai-chat` components, distinguished by technology in their IDs (`teams-chat`, `sharepoint-chat`, `m365-copilot-chat`, `dynamics-chat`).

## Location-scoped IDs

**Decision.** A component is identified by `(location, id)`, not by `id` alone. The same `id` may legitimately appear in multiple locations.

**Considered.** Location prefix in the ID (`pp-ai-agent`, `azure-ai-agent`); role qualifier (`user-agent` / `service-agent`); schema change scoping IDs by location.

**Why it landed here.** When Eugene said both PP and Azure agents should be ID `ai-agent`, and both databases ID `database`, that's only consistent with location-scoped IDs. Same-category components in the **same** location still need a disambiguator; same-category components in **different** locations don't.

**Reference syntax fallout.** Cross-location references use `<location>:<id>` form. Bare `<id>` references (used in `enabled-by`/`hosted-by`) resolve in the source component's own location.

## Technology applicable-to

**Decision.** Every technology declares `applicable-to: [<category>...]` — the categories it can plausibly fill. Non-exclusive list. The validator warns (or errors in strict mode) when a component's `category:` is not in its implementing technology's `applicable-to`.

**Considered.** Skipping it (YAGNI) — rejected because it mirrors `available-in` exactly and gives the validator real grip on bad component-technology pairings.

**Constraint.** Treated as non-exclusive (a single technology can fit multiple categories — e.g. `ai-foundry-agent-svc` is `[ai-agent, orchestration-engine]`). No "primary" category; no editorial debates about which is the canonical role.

## Library system

**Decisions, settled together:**

- Architectures `import:` libraries from `technology_library/<name>/index.yaml`.
- A library's `index.yaml` may carry top-level `categories:`, `technologies:`, and its own `imports:` clause.
- Imports resolve **transitively** (libraries can import other libraries). Convention: the architecture's `imports:` is its full dependency manifest — every dependency listed explicitly even when transitively reachable.
- Inline `categories:` / `custom-technologies:` at the architecture level **override** library entries on id collision; used for architecture-specific entries. (Library `technologies:` keeps its name; project-side uses `custom-technologies:` to read as project-local.)
- Per-technology wiki pages live as `<tech-id>.md` in the library folder (purpose + trade-offs). Each library may include a `resources/` folder with its own icons.

**Current libraries:**

- `default/` — twelve meta-model categories (`ai-chat`, `ai-agent`, `database`, …).
- `microsoft/` (imports `default`) — twenty-four Microsoft cloud technologies.

## Path conventions

**Decision.** Inside a library's `index.yaml`, paths starting with `resources/` are **library-relative**. Anywhere else (architecture file, cross-library refs), paths are **project-root-relative** (`technology_library/<lib>/resources/<file>` or `ai_ea/resources/<file>`). The architecture file's paths read consistently regardless of where the source file lives.

## File locations

**Final layout settled by end of thread:**

- `ai_ea/ai_ea.arch.yaml` — architecture source (started in `product_strategy/research/dsl/`, briefly moved to `output/` as a "build artifact", then to project root, finally to `ai_ea/` alongside the markdown model).
- `ai_ea/output/ai_ea.arch.compiled.yaml` — compiled artifact (compiler output).
- `modeling_engine/Compiler/model_compiler.py` — the compiler.
- `modeling_engine/wiki/` — this wiki.

## Naming migration anchors

**Decision.** Every tech-named component renamed to a purpose-first ID with `implemented-by` carrying the technology. Full table in [05 — Naming migration](05-naming-migration.md). Highlights:

- Both `microsoft-agent` (PP) and `ai-foundry-agent` (Azure) → ID `ai-agent`, distinct by location.
- Both `dataverse` (PP) and Azure `sql` → ID `database`, distinct by location.
- Four chat surfaces stay distinct, technology-disambiguated: `teams-chat`, `sharepoint-chat`, `m365-copilot-chat`, `dynamics-chat`.
- `work-iq` keeps its name, gets new category `api` (added to `default` alongside `platform-api`).
- `validator` keeps its name with category `service`.

## Compiler

**Decision.** A standalone Python tool (`modeling_engine/Compiler/model_compiler.py`) reads the architecture source, resolves library imports transitively, inlines the resolved registries, validates the model, and writes `ai_ea/output/ai_ea.arch.compiled.yaml` for downstream consumption by the visualization engine.

Validator scope captured in [04 — Validation & compiler](04-validation-and-compiler.md). The compiled output is a single self-contained YAML — no library resolution required at render time.

## What remains open

- **Visual rendering of relationship types.** Principle confirmed (interaction / enablement / hosting render distinctly); precise rendering deferred.
- **Location parent inheritance.** A technology `available-in: [m365]` is currently *not* considered available in a child location (`power-platform`). Strict matching only.
- **Category icons coupled to Microsoft.** Several `default/` category icons reference Microsoft library icons — flagged as a soft coupling to be replaced with vendor-neutral glyphs.
- **`data-store` refinement.** Whether to split `data-store` into `object-store`, `document-store`, `data-lake`, `analytics-platform`, or leave as a coarse bucket.
- **`enabled-by` / `hosted-by` cycles, scenario coverage, orphan detection.** Reasonable next additions to the validator.

## Connector taxonomy refactor — six types, two properties

**Decision (later in the same design pass).** The earlier "three relationship types" framing (Interaction / Enablement / Hosting, with the latter two as component properties) was too narrow. Replaced by:

- **Two component properties:** `category`, `implemented-by`. Properties answer "what is this thing?".
- **Six connector types:** `calls`, `event`, `consumes`, `available-through`, `enabled-by`, `hosted-by`. Connectors answer "what does this thing do, who depends on it, and what is it built on?".

`enabled-by` and `hosted-by` moved from being component properties to being connector types — every relationship between two model elements (component, location, block, actor) is now a connector.

**Why each type:**

- `calls` — sync runtime invocation. Was previously the implicit type of every scenario step (Invocation/Interaction).
- `event` — async runtime emission. UML's async-message convention; carved off from `calls` as a distinct kind because the visual rendering and semantics differ.
- `consumes` — A reads/uses data or services from B. Distinct from `calls` (no specific method invocation; can be data flow, subscription, lookup).
- `available-through` — A is exposed via B (gateway, MCP server, inference endpoint). The "access path" relationship.
- `enabled-by` — build/authoring relationship. Previously a component property.
- `hosted-by` — runtime container relationship. Previously a component property.

**UML influence.** UML's vocabulary informed the type set — sync/async distinction (sequence diagrams), `«deploy»` and `«manifest»` stereotypes (deployment diagrams) for hosted-by/enabled-by, the dependency dashed-arrow convention for the structural types. Skipped: interface lollipops/sockets, generalization, composition diamonds, multiplicity (all overkill at our level).

**Authoring surfaces.** Scenario steps carry runtime-flow types (`calls`, `event`, `consumes`); the source `connectors:` block (renamed from `extra-connectors`) carries all six types as standalone typed edges. Pair-form `[a, b]` is shorthand for `type: calls`; object form `{ from, to, type }` is required for non-default types.

**Step kind syntax.** Bracket annotation: `A →[event] B`, `A →[consumes] B`. Default (no bracket) is `calls`. Lightweight, preserves the existing scannable step list.

**Compiled output.** The compiler emits a unified typed `connectors:` block — one ordered list with every entry carrying `type:` and `source:`, derived from scenario steps and the source `connectors:` list. The visualization engine consumes one uniform list and dispatches on type. Inline `enabled-by` / `hosted-by` on components is now a validation error — the compiler rejects them with a hint to express as a connector entry.

**What this changes in the schema.**

- Component definitions shrink to `{ label, category, implemented-by }`.
- Source `extra-connectors:` is renamed to `connectors:`. Pair-form entries still legal as `type: calls` shorthand.
- The compiled output gains a `connectors:` block; component-property `enabled-by` / `hosted-by` are gone from the compiled view too (they live as typed connectors there).

## Globally unique component IDs (reversal of "Location-scoped IDs")

**Decision (later in the same design pass).** Component IDs are now globally unique. The earlier `(location, id)` tuple identity is retired; component identity is `id` alone.

**What's reversed.** The "Location-scoped IDs" decision above said the same `id` could legitimately appear in multiple locations as different components — `power-platform:ai-agent` distinct from `azure:ai-agent`. That is no longer the case.

**Why.** The markup layer (visualization side) needs unique handles for path expressions and binding calc. Flat global ids are the cleanest substrate for that. Resolves a long-standing asymmetry where blocks, actors, and locations were globally unique but components weren't.

**Authoring change.** The `components:` block is still grouped by location for organisation, but the location is purely a containment attribute on the component, not part of its identity. References everywhere are bare ids — no `<location>:<id>` qualified form anywhere.

**Naming-migration fallout (AI EA).** The four duplicate-id pairs from the earlier rule were renamed:

| Was (location-scoped) | Now (globally unique) |
|---|---|
| `power-platform:ai-agent` | `business-agent` (front-line user-facing PP agent) |
| `azure:ai-agent` | `service-agent` (backend Azure service agent for B2B / autonomous flows) |
| `power-platform:database` | `app-database` (Dataverse — backs PP apps) |
| `ai-data-sources:database` (block) | `transactional-database` (Azure SQL — OLTP) |

All scenario steps and connector entries that referenced the qualified form were stripped to bare ids and updated to the new disambiguated names. Compiler now rejects any `<location>:<id>` reference with an explicit error message.

**Consequences for the wiki.** The earlier "Location-scoped IDs" entry stays in this log as historical record. The meta-model and schema pages have been rewritten to describe the global-id rule.

## Component `id` is an always-visible property

**Decision (later in the same design pass).** Every component carries `id` as a first-class property, visible in both the source and the compiled output. The earlier dict-keyed-by-id form (where the YAML key implicitly served as the id) is still supported as a legacy form, but the primary authoring style is list-of-objects with explicit `id:`.

**Why.** Reading any single component entry in isolation should make the id obvious without needing to know the YAML-key context. Consumers of the compiled output get the id as a field whether they index by key or iterate.

**Concrete migration.** The AI EA architecture file was converted from dict form to list form. Each component (standalone and block-internal) now has an explicit `id:` field. The compiler also injects `id:` into each component dict in the compiled output, so `ai_ea/output/ai_ea.arch.compiled.yaml` shows the id explicitly even when the entry is also indexed by key.

## Autogen formula: slugify(label) + slugify(category)

**Decision.** When a list-form component omits `id:`, the compiler generates one by slugifying the label and the category, then merging the parts in order with duplicates removed.

Examples:

| Label | Category | Autogenerated id |
|---|---|---|
| `[AI, Agent]` | `ai-agent` | `ai-agent` |
| `[Microsoft, Teams]` | `ai-chat` | `microsoft-teams-ai-chat` |
| `Database` | `database` | `database` |
| `[Workflow, Engine]` | `service` | `workflow-engine-service` |
| `[Knowledge, Index]` | `semantic-index` | `knowledge-index-semantic` |

**Why both inputs.** Label-only autogen would collide too often (e.g. multiple components labelled `Database` in different categories). Combining label + category with dedup-merge keeps the id readable and likelier to be unique without requiring the user to manually invent a disambiguator.

**Collisions still possible.** Two components with identical label *and* identical category produce the same autogen id and the compiler errors. The user provides an explicit `id:` in that case (the AI EA model does this for `business-agent` / `service-agent` and `app-database` / `transactional-database` — same label and same category, distinct disambiguator IDs picked by hand).

## Natural-language connector form

**Decision.** The source `connectors:` block accepts a third entry shape — a plain string with a verb phrase that maps to a connector type. Subject and object are whitespace-delimited tokens; direction is always `from = subject, to = object` regardless of voice (active or passive).

**Verb table:** see [02 — Schema](02-schema.md#natural-language-verb-table). Covers all six connector types with synonyms for `calls` (`invokes`) and `event` (`emits to` / `publishes to` / `sends event to`).

**Why.** Some connector statements read more naturally as prose than as structured YAML — `legacy-application is available through legacy-tool-bridge` carries the same information as `{ from: legacy-application, to: legacy-tool-bridge, type: available-through }` but is faster to scan. The three forms (object, pair, natural) are equivalent at the model level; pick whichever reads cleanest per entry.

**Compiled output.** Natural-language entries resolve to the same shape as object-form entries, with the original string preserved as `natural:` on the connector for traceability.

## Scenarios become multi-sequence (2026-05-03)

**Decision.** A scenario is no longer a single flat step list. It carries one or more **sequences**, each with its own `Title`, `Entry Point`, and `steps:` list. The earlier per-scenario `actors:` field is dropped — each sequence's `Entry Point` plays that role, and a scenario can now legitimately have several different entry points without forking into separate scenarios.

**Considered.** Splitting every alternate entry point into its own scenario id (`conversational`, `conversational-from-agent`, …). Rejected because the *outcome* is what defines a scenario; alternate entry paths to the same outcome are variations of one scenario, not separate scenarios. Inflating the scenario list dilutes the meaning of "scenario".

**Why.** Real architectures have outcomes reachable from multiple entry points — autonomous-agent execution can start from a Work-IQ trigger or from a platform-API call from an external system. Both end at the same desired state. Modelling this as one scenario with two sequences keeps the outcome coherent while letting each entry point be authored as its own ordered flow.

**Compiled output.** Each scenario-step connector now carries `scenario`, `sequence` (slug derived from the sequence Title), and `step` (index within its sequence, resets per sequence). The `(scenario, sequence, step)` tuple uniquely identifies the connector for downstream filtering.

**Authoring shape.** Each sequence list entry uses a `sequence:` wrapper key (`- sequence: { Title, Entry Point, steps }`). The wrapper is optional — bare `- { Title, Entry Point, steps }` is also accepted. Capitalised keys with a space (`Title`, `Entry Point`) are the primary form; lower-snake-case alternates (`title`, `entry-point`) are accepted by the compiler.

**Downstream impact.** The architecture-viewer keeps scenario-level filter pills (one per scenario, lighting up all its sequences). Per-sequence filtering becomes a small follow-up — the `sequence` attribute is threaded through the SVG so a future viewer change can group by it without re-emitting.
