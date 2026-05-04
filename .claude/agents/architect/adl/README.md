# Architecture Definition Language

This is the formal specification of every meta-model the toolchain understands. Each meta-model is a separate vocabulary — a closed set of concepts, enums, and primitives — that defines what a model authored in that meta-model looks like.

Today there are two meta-models:

| Meta-model | Source | Purpose |
|---|---|---|
| [enterprise-architecture/](meta-models/enterprise-architecture/) | `.arch.yaml` | Describes an enterprise architecture — locations, actors, blocks, components, scenarios, connectors. |
| [bpmn/](meta-models/bpmn/) | `.bpmn.yaml` | BPMN flavour. Describes a business process — pools, lanes, tasks, events, gateways, sequence/message flows. |

A project (see [wiki/01-project-descriptor.md](../wiki/01-project-descriptor.md)) may contain models from one or more meta-models; each model's descriptor entry declares which meta-model it conforms to. The toolchain orchestrator dispatches to the right compiler / visual library based on that.

## Layout

```
adl/
├── README.md                         # this file
├── spec-schema.yaml                  # shared meta-meta-schema — record kinds + type-spec grammar
├── primitives/                       # shared primitives every meta-model can use
│   ├── identifier.yaml               # kebab-case id grammar
│   ├── slug.yaml                     # derived id (toolchain-generated)
│   ├── label.yaml                    # display name (string or list-of-string)
│   ├── edges.yaml                    # 4-sided spacing record
│   └── color.yaml                    # CSS-flavoured colour string
└── meta-models/
    ├── enterprise-architecture/
    │   ├── meta-model.yaml           # descriptor — name, version, extension, root-concept
    │   ├── SPEC.md                   # how to read this meta-model's spec
    │   ├── enums/                    # closed sets (connector-type, location-type, …)
    │   ├── concepts/                 # first-class entities (model, component, scenario, …)
    │   └── wiki/                     # prose docs (semi-formal, history, design rationale)
    │       ├── index.md
    │       ├── concepts/
    │       └── primitives/
    └── bpmn/
        ├── meta-model.yaml
        ├── SPEC.md
        ├── enums/
        ├── concepts/
        └── wiki/
```

## Why split the spec from prose

`spec-schema.yaml` and the records under each meta-model's `enums/`, `concepts/` are the **normative** definition — machine-readable, validated for cross-reference consistency, and the source of truth for any tooling that wants to enforce the shape (validators, IDE schemas, doc generators).

The prose under each meta-model's `wiki/` is the human narrative — semi-formal explanations, design rationale, history. When prose and spec disagree, the spec wins; the prose is the bug.

## Record kinds

Five record kinds defined in [spec-schema.yaml](spec-schema.yaml):

| Kind | Where it lives | What it carries |
|---|---|---|
| `spec-schema` | this directory | The format definition every other record follows. |
| `meta-model` | `meta-models/<name>/meta-model.yaml` | Descriptor: slug, version, source extension, root-concept. |
| `primitive` | `primitives/<slug>.yaml` (shared) or per-meta-model | Base data type with regex/shape constraints. |
| `enum` | `meta-models/<name>/enums/<slug>.yaml` | Closed set of named values. |
| `concept` | `meta-models/<name>/concepts/<slug>.yaml` | First-class entity with properties, relationships, invariants, authoring forms. |

## Adding a meta-model

Three things create a new meta-model:

1. **Decide what's distinct.** A meta-model exists only if its concepts have meaningfully different semantics from existing meta-models. BPMN qualifies (gateways, message flows, pool boundaries — none of which exist in the enterprise-architecture meta-model). A "lightweight architecture diagram" wouldn't — that's a stylistic preference, not a meta-model.
2. **Author the spec.** Create `meta-models/<slug>/`, add `meta-model.yaml`, then enums + concepts. Reuse `adl/primitives/` for generic types; only define meta-model-specific primitives (e.g. a `condition-expression` for BPMN gateway branches) inside the meta-model's own folder.
3. **Wire the toolchain.** A new compiler that reads the new source extension; a new visual library if rendering rules differ; updates to the orchestrator's per-model dispatch. The ADL itself doesn't run the toolchain — but the meta-model record names the extension, the root-concept, and points at the relevant compiler so the orchestrator knows where to send the file.

## Status

The enterprise-architecture meta-model is fully wired (model_compiler, visual engine, viewer). The BPMN meta-model is currently **spec-only** — its records define the vocabulary, but no BPMN compiler or visual library exists yet. Adding those is a roadmap item separate from the spec.
