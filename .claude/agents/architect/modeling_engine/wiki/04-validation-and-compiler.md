# 04 — Validation & compiler

The compiler resolves library imports, inlines symbols, validates the model, and emits the form the visualization engine consumes.

## What the compiler does

1. **Load** `ai_ea/ai_ea.arch.yaml`.
2. **Resolve imports** transitively (depth-first, cycle-protected). Walk every `imports:` declaration in the architecture and in each visited library; merge each library's `categories:` and `technologies:` into resolved registries (earlier wins among imports).
3. **Apply inline overrides.** The architecture's own `categories:` / `custom-technologies:` blocks override library entries on id collision.
4. **Validate** (see rules below).
5. **Emit** the compiled artifact to `ai_ea/output/ai_ea.arch.compiled.yaml` — the same source structure with `imports:` removed and the resolved registries inlined.

## Validation rules

| Class | What's checked |
|---|---|
| **Reference integrity** | Every `category:` reference resolves to a defined category. Every `implemented-by:` entry resolves to a defined technology. |
| **`available-in` consistency** | A component's effective location must be in its implementing technology's `available-in:` list. |
| **`applicable-to` consistency** | A component's `category:` must be in its implementing technology's `applicable-to:` list. |
| **ID uniqueness per location** | Within a single location, component IDs must be unique. Block-internal components share their block's location and may not collide with standalone components there. |
| **Block IDs** | Block IDs are globally unique. |
| **Scenario sequences** | Each scenario carries a non-empty `sequences:` list. Each sequence has a required `Title` and `Entry Point`; Entry Point must resolve to an actor, block, location, or component. |
| **Scenario steps** | Each step parses as `<src> → <dst>`. Both endpoints resolve to bare ids in the global namespace (actor, block, location, or component). |
| **Extra-connectors** | Each entry is a `[src, dst]` pair; both refs must resolve. |
| **`enabled-by` / `hosted-by`** | Each entry must resolve to a component or a location. Bare references resolve in the source component's own location. |
| **Design-smell warnings** | Long `extra-connectors` lists (≥5 entries) warn — many entries means components are connected with no scenario explaining why. |

Errors block a clean compile (exit code 1). Warnings are reported but don't block.

## Invocation

```
python3 modeling_engine/Compiler/model_compiler.py
```

Run from the project root. The script self-locates the project root from its own path; no environment variables needed.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Compiled cleanly. Warnings allowed. |
| 1 | Compiled with validation errors. The compiled output is still written, for inspection. |
| 2 | Internal error (file/library not found, malformed YAML, import cycle). No output written. |

## Output format

`ai_ea/output/ai_ea.arch.compiled.yaml` carries:

```yaml
# Header comments — source path, imports resolved, registry sizes.

meta:           …
locations:      …
actors:         …
categories:     …    # full resolved registry, inlined
technologies:   …    # full resolved registry, inlined
scenarios:      …    # unchanged from source
blocks:         …    # unchanged from source
components:     …    # unchanged from source (grouped by location)
extra-connectors: …  # unchanged from source
```

There is no `imports:` block in the compiled output. The visualization engine consumes this single file with no library resolution of its own.

## What's intentionally not validated (yet)

- **Location parent inheritance.** A technology declared `available-in: [m365]` is currently **not** considered available in `power-platform` (a child of `m365`). Strict matching only. Decision pending.
- **`enabled-by` / `hosted-by` cycles.** No cycle detection on these chains.
- **Scenario coverage.** No check that every component appears in at least one scenario step or `extra-connectors` (orphan detection).

These are reasonable next additions but were left out of v1 of the validator.
