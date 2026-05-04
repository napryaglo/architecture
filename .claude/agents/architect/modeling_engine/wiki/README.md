# Modeling Engine — Wiki

A reference for the modeling side of the Architecture Agent: the architecture description language (DSL), the supporting library system, the compiler, and the naming/structural decisions that shape them.

This wiki captures the resolved state. The chronological journey — including alternatives considered and rejected — lives in the decision log.

## Pages

| # | Page | What it covers |
|---|---|---|
| 01 | [Meta-model](01-meta-model.md) | Core concepts: relationship types (Interaction / Enablement / Hosting), purpose-first naming, location-scoped IDs, the no-collapse rule. |
| 02 | [Schema & syntax](02-schema.md) | Architecture file shape, property semantics (`implemented-by` / `enabled-by` / `hosted-by` / `applicable-to`), references, path conventions, icon resolution. |
| 03 | [Libraries](03-libraries.md) | Library structure, transitive imports, current libraries (`default`, `microsoft`), wiki pages, resources. |
| 04 | [Validation & compiler](04-validation-and-compiler.md) | What the compiler does, validation rules, output format, invocation. |
| 05 | [Naming migration](05-naming-migration.md) | The tech-first → purpose-first rename pass, with the full anchor table. |
| 06 | [Decision log](06-decision-log.md) | Chronological record of decisions made during the 2026-04-27 design pass, with rationale. |

## Repository layout

```
<project root>/
  ai_ea/
    ai_ea.arch.yaml                 # the architecture source
    model/                          # markdown model files
    research/                       # research threads (dsl/, layout_engine/, …)
    resources/                      # generic non-vendor icons
  technology_library/
    default/                        # meta-model categories
    microsoft/                      # Microsoft cloud technology stack
  modeling_engine/
    Compiler/
      model_compiler.py             # the compiler
    wiki/                           # this wiki
  output/
    ai_ea.arch.compiled.yaml        # compiled artifact (generated)
```

## Where to start

If you're new to the project: [01 — Meta-model](01-meta-model.md).
If you're authoring or editing an architecture: [02 — Schema & syntax](02-schema.md).
If you're building a renderer that consumes the compiled output: [04 — Validation & compiler](04-validation-and-compiler.md).
If you want to know *why* something is the way it is: [06 — Decision log](06-decision-log.md).
