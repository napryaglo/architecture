# BPMN — Business Process Model and Notation

This is the BPMN meta-model — a pragmatic subset of OMG's BPMN 2.0, scoped to the artifacts most practitioners actually use when describing business processes for stakeholders.

## Status

**Spec-only.** The meta-model under [meta-model.yaml](../meta-model.yaml), [enums/](../enums/), and [concepts/](../concepts/) defines the vocabulary. There is no BPMN compiler yet — when one lands at `bpmn_engine/Compiler/bpmn_compiler.py` it will validate `.bpmn.yaml` files against this spec; until then, no tooling consumes BPMN models.

## What's covered

The first cut covers the artifacts that show up in every real process diagram:

| Concept | What it represents |
|---|---|
| [process](../concepts/process.yaml) | The root — one private process per `.bpmn.yaml` file. |
| [pool](../concepts/pool.yaml) | A participant (organisation, system, role). |
| [lane](../concepts/lane.yaml) | Sub-partition of a pool — typically a role or department. |
| [task](../concepts/task.yaml) | An atomic activity. Eight task types in the [task-type enum](../enums/task-type.yaml). |
| [event](../concepts/event.yaml) | Something that happens (start / intermediate / end), classified by trigger. |
| [gateway](../concepts/gateway.yaml) | Routing point (exclusive / parallel / inclusive / event-based / complex). |
| [sequence-flow](../concepts/sequence-flow.yaml) | Intra-pool edge carrying control tokens. |
| [message-flow](../concepts/message-flow.yaml) | Inter-pool asynchronous message. |
| [data-object](../concepts/data-object.yaml) | Information moving between activities. |
| [bpmn-view](../concepts/bpmn-view.yaml) | A hand-drawn diagram of one process. |

Plus four enums:

- [task-type](../enums/task-type.yaml) — none / user / service / manual / script / business-rule / send / receive
- [event-type](../enums/event-type.yaml) — start / intermediate / end (position in flow)
- [event-trigger](../enums/event-trigger.yaml) — none / message / timer / conditional / signal / error / escalation / compensation / link / terminate
- [gateway-type](../enums/gateway-type.yaml) — exclusive / parallel / inclusive / event-based / complex
- [flow-type](../enums/flow-type.yaml) — sequence / message

## What's deliberately not covered (yet)

These artifacts are part of BPMN 2.0 but excluded from this first cut. None are blockers — they can be added when a real diagram needs them:

- **Sub-processes** — a task that expands into its own internal flow. For now, model a sub-process as its own separate `.bpmn.yaml` file; cross-file references can come later.
- **Choreographies and conversations** — protocol-level views of multi-party message exchanges. Public-process modelling. Out of scope until needed.
- **Call activity** — invocation of an external (reusable) process. Same story as sub-processes.
- **Artifacts beyond data objects** — text annotations, groups. Useful for documentation overlays; not modelled here.
- **Detailed data modelling** — message types, data inputs/outputs with schemas, IO specifications. The current `data-object` is documentary only.

## Why "pragmatic subset"

Full BPMN 2.0 has 100+ elements and many subtle semantic edge cases (interrupting vs non-interrupting boundary events, transactional sub-process compensation flows, etc.). Most diagrams that get drawn in practice use a small fraction of that. This meta-model captures that fraction; the omitted parts can land later if and when authors actually need them. Keeping the surface small at the start means the spec stays understandable and the eventual compiler stays implementable.

## How BPMN fits in the multi-meta-model toolchain

A project (declared by `<project>.proj.yaml`) can mix BPMN models alongside enterprise-architecture models. Each model in the project's `models[]` list declares its meta-model:

```yaml
models:
  - id:         enterprise
    meta-model: enterprise-architecture     # or omitted — that's the default
    source:     models/enterprise/enterprise.arch.yaml
    views:
      - id: topology
        label: System Topology
  - id:         order-fulfillment
    meta-model: bpmn
    source:     models/order-fulfillment/order-fulfillment.bpmn.yaml
    views:
      - id: happy-path
        label: Happy Path
```

The orchestrator dispatches each model to the right compiler based on the meta-model field. The viewer's model picker shows both side by side; switching models switches the visual library and the right-rail behaviour.

This wiring isn't implemented yet — it lands when the BPMN compiler does.

## Reference

- [BPMN 2.0 spec (OMG)](https://www.omg.org/spec/BPMN/2.0/) — the full normative specification this meta-model is a subset of.
- [bpmn.io modeler](https://bpmn.io/) — open-source BPMN tooling reference for shapes and conventions.
