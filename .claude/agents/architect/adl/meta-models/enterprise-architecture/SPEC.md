# ADL spec — formal model

This directory is the formal, machine-readable definition of the Architecture Definition Language. Every concept, primitive, and enumeration in the language has exactly one record here. Records are YAML, follow a fixed schema (see [spec-schema.yaml](spec-schema.yaml)), and reference each other by stable slug.

The prose wiki under [adl/meta-models/enterprise-architecture/wiki/concepts/](../concepts/) and [adl/meta-models/enterprise-architecture/wiki/primitives/](../primitives/) remains the human-readable narrative — semi-formal explanations, history, design rationale. The spec under here is the *normative* definition: when prose and spec disagree, the spec wins, and the prose is the bug.

## Layout

```
spec/
├── README.md                  # this file
├── spec-schema.yaml           # meta-meta-schema — the format these records follow
├── enums/                     # closed sets of named values
│   ├── actor-type.yaml
│   ├── location-type.yaml
│   ├── connector-type.yaml
│   ├── connector-source.yaml
│   ├── component-category.yaml
│   ├── view-operator.yaml
│   └── layout-strategy.yaml
├── primitives/                # base data types used by concepts
│   ├── identifier.yaml
│   ├── slug.yaml
│   ├── label.yaml
│   ├── edges.yaml
│   └── color.yaml
└── concepts/                  # the ADL concepts themselves
    ├── project.yaml
    ├── model.yaml
    ├── location.yaml
    ├── actor.yaml
    ├── block.yaml
    ├── component.yaml
    ├── component-category.yaml
    ├── technology.yaml
    ├── library.yaml
    ├── connector.yaml
    ├── scenario.yaml
    ├── sequence.yaml
    ├── step.yaml
    └── view.yaml
```

## Record kinds

Three kinds of record live in this spec; each has its own schema (defined in [spec-schema.yaml](spec-schema.yaml)).

- **Enum.** A closed set of named values (e.g. `connector-type`, `actor-type`). Each value has an id, optional human label, optional description, and may carry aliases.
- **Primitive.** A base data type (e.g. `identifier`, `slug`, `edges`). Defines a base type — string, integer, object, list, union — plus optional regex / shape constraints.
- **Concept.** A first-class ADL entity (e.g. `component`, `scenario`). Carries `properties` (with type, cardinality, constraints), `relationships` (typed edges to other concepts), `invariants` (semantic rules the model must satisfy), `authoring` examples, and `references` to wiki/code where the concept surfaces.

## Type references

Anywhere a record names a `type:`, the value is one of:

- A primitive slug (`identifier`, `slug`, `label`, `string`, `integer`, `boolean`)
- An enum slug (`{ enum: connector-type }`)
- A concept slug (`{ ref: component }`)
- A list (`{ list: <type-spec> }`)
- A union (`{ union: [<type-spec>, …] }`)

Type references are stable and machine-checkable: a small validator can walk every `type:` and confirm the target slug resolves to a record in this directory.

## Cardinality

`cardinality:` accepts the standard four shorthands:

| Value | Meaning |
|---|---|
| `1` | Exactly one. Required. |
| `0..1` | Zero or one. Optional. |
| `*` | Any number including zero. Optional. |
| `1..*` | One or more. Required. |

If `cardinality:` is omitted, default is `1` for `properties`, `*` for `relationships`.

## Invariants

Invariants are semantic rules the *model instance* must satisfy. Each invariant carries a prose `description` and an optional `formal:` block (predicate-logic-flavoured, in plain text — not executable). Invariants are the source of validation rules in the model_compiler.

## Why a formal spec

Three things this gives that the prose wiki couldn't:

- **Single source of truth.** Every enum value, every property, every cardinality lives once. The wiki can be regenerated from the spec; tools (linters, IDE schemas) can be derived from it.
- **Machine-checkable consistency.** A spec validator walks the records and rejects dangling type refs, missing required fields, and orphan invariants — the kind of drift that quietly accumulates in prose.
- **Versionable evolution.** Schema changes are explicit (a record's diff in git), not buried in paragraphs. A future "ADL v2" can carry a different `spec-schema.yaml` and the migration becomes a discrete event.

## Status

This is the initial cut. Coverage is everything in the toolchain today — eight enums, five primitives, fourteen concepts. Future additions (visual primitives like `text`/`rect`/`stack-panel`; layout-engine concepts like `anchor`/`channel`) are deliberate follow-ups, not gaps.
