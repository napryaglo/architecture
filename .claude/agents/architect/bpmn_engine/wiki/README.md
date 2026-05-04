# BPMN engine

The BPMN-side counterpart to `modeling_engine/`. Currently consists of a single tool — the model compiler. The visual side (auto-renderer, `.bpmn-view` parser, BPMN visual library) is a deliberate follow-up; the model layer needs to prove out before pictures are worth building.

## What's here

- [Compiler/bpmn_compiler.py](../Compiler/bpmn_compiler.py) — reads `<process>.bpmn.yaml`, validates against the BPMN meta-model spec ([adl/meta-models/bpmn/](../../adl/meta-models/bpmn/)), emits a compiled YAML.

## What it validates

Roughly thirty invariants pulled directly from the spec records. The compiler reports them all in one pass — it doesn't bail at the first error — so a single build cycle catches everything.

| Concept | Invariants enforced |
|---|---|
| `meta` | Has `meta.id`. |
| `pool` | At least one pool; pool ids unique; each pool has at least one lane. |
| `lane` | Lane ids unique within a pool (per-pool, NOT global — two pools may both have a lane called `self`); every `flow-nodes[]` entry resolves to a declared task/event/gateway; no node lives in two lanes. |
| `task` | Type is one of the known task types; `service`/`script` tasks with an `assignee` get a warning. |
| `event` | `event-type` is start/intermediate/end; trigger is one of the known triggers; **start events have no incoming sequence flows; end events have no outgoing**; intermediate events with `message`/`signal`/`escalation` triggers MUST declare `direction: catching` or `throwing`. |
| `gateway` | Type is one of the five gateway types; ≥1 incoming AND ≥1 outgoing flows; **parallel gateways forbid conditions on outgoing flows** (parallel fires unconditionally; conditions would be ignored); `default:` references a real outgoing flow. |
| `data-object` | `collection:` is boolean if present. (Orphan-association warning deferred — data associations aren't modelled yet.) |
| `sequence-flow` | Both endpoints resolve; **sequence flows stay within a single pool**. |
| `message-flow` | Both endpoints resolve; **message flows MUST cross pool boundaries**; sender side is a Send task / throwing message event / pool boundary; receiver side is a Receive task / catching message event / pool boundary. |
| Cross-cutting | All node ids globally unique within the process across kinds. |

## Compiled output

The compiled YAML preserves every authored section verbatim with `id:` made explicit on each flow node, plus one derived index:

```yaml
flow-nodes:
  <id>:
    kind: task | event | gateway
    lane: <lane-id>
    pool: <pool-id>
    # plus all original fields (label, type, trigger, etc.)
```

Renderers can look up any node by id without re-walking the pool/lane tree. The `flows:` block is preserved with `id:` synthesised on flows that didn't carry one (so error messages can reference them).

## CLI

```bash
# Explicit source + output (preferred):
python bpmn_engine/Compiler/bpmn_compiler.py <source.bpmn.yaml> --output <out.compiled.yaml>

# Legacy directory form (resolves source as <dir>/<dir>.bpmn.yaml,
# writes <dir>/output/<source-stem>.compiled.yaml):
python bpmn_engine/Compiler/bpmn_compiler.py <project-dir>
```

Exit codes mirror `modeling_engine/Compiler/model_compiler.py`:

| Code | Meaning |
|---|---|
| `0` | Compiled cleanly. Warnings allowed. |
| `1` | Compiled with validation errors. The compiled output is still written, for inspection. |
| `2` | Internal error (file/library not found, malformed YAML). |

## Test corpus

Five exemplars under [bpmn_test_inputs/](../../bpmn_test_inputs/) cover every concept and most enum values across the spec. All five compile clean today (zero errors, zero warnings). When the spec changes, the corpus is the regression suite — any new invariant that doesn't surface against these is poorly tested.

## Design notes

**Pass structure.** Single file. Validators append to a shared `issues` list rather than raising — the compiler accumulates everything and reports at the end so authors don't iterate one-error-at-a-time. The output YAML is written even on validation errors (useful for inspection).

**No library imports.** Unlike the architecture model_compiler, BPMN doesn't have technology libraries — every concept is intrinsic to the meta-model. The whole `resolve_imports` machinery from the architecture compiler isn't needed.

**Spec-bound constants.** The valid task types, event types, triggers, gateway types, and flow types are mirrored from `adl/meta-models/bpmn/enums/` as Python constants at the top of the compiler. If those enums grow new values, the compiler needs the same change. There's no auto-generation today; cross-checking the two by hand is fine for the current pace of change.

**Module-level `_node_by_id` cache.** Lifecycle is one-shot per `main()` call. It's there so the message-flow validator can look up the full node dict without an extra argument threaded through every helper. Not concurrency-safe; fine for a CLI tool that runs once per invocation.

## Roadmap

- **Reachability check.** "Every flow node has a path to at least one end event." Doable with a graph walk; deferred because the spec invariant is more nuanced than it sounds (catching boundary events, escape paths).
- **Data associations.** Once we add a way to link data objects to activities (input/output), the orphan-data-object warning becomes meaningful.
- **`--strict` mode.** Bump warnings to errors. Useful for CI pipelines that want zero-warnings policy.
