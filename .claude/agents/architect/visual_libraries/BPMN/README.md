# BPMN visual library

Templates and styles for rendering BPMN diagrams, paired with the BPMN meta-model under [adl/meta-models/bpmn/](../../adl/meta-models/bpmn/) and the model compiler at [bpmn_engine/Compiler/bpmn_compiler.py](../../bpmn_engine/Compiler/bpmn_compiler.py).

## What's here

One YAML file per BPMN element kind, mirroring how `Default/` ships per-architecture-element files. Each file declares the element's properties (the field schema the markup compiler reads), then a Style with default values + a ControlTemplate (the visual shape composition).

```
visual_libraries/BPMN/
├── README.md           # this file
├── bpmn-view.yaml      # root canvas (analogous to architecture-view)
├── pool.yaml           # swimlane container — top-level band per participant
├── lane.yaml           # sub-band inside a pool
├── task.yaml           # rounded rectangle activity
├── event.yaml          # circle (stroke weight per event-type)
├── gateway.yaml        # diamond with type marker
├── data-object.yaml    # page-shape with optional state annotation
├── connector.yaml      # sequence flow + message flow styles
└── resources/          # SVG icons (per task-type, per event-trigger, per gateway-type)
```

## What's NOT here yet

- **SVG assets under `resources/`.** Templates reference icons by path (e.g. `resources/task-user.svg`) but the files themselves haven't been authored. The visual engine will surface a "missing icon" warning when it can't resolve them; downstream consumers can drop in their preferred icon set without touching the templates.
- **Per-variant data-templates.** Architecture's `Default/data-templates/` selects a different DataTemplate per component category. For BPMN, an analogous mechanism would select per `task.type`, per `event.event-type` + `event.trigger`, per `gateway.type`. The base templates here keep variants in a single template using bound properties (`$self.type`, `$self.trigger`); per-variant DataTemplates can be added later if more visual divergence is needed.
- **Visual primitives.** This library doesn't ship its own `visual_primitives.yaml` — it reuses the primitives (image, text, border, stack-panel, …) defined in [Default/visual_primitives.yaml](../Default/visual_primitives.yaml). The two libraries share that primitive catalogue.

## Layout conventions

BPMN diagrams have strong layout conventions that the templates assume:

- **Pools are horizontal stripes** stretching left-to-right across the diagram. The pool's title bar is a vertical strip on the left edge with the label rotated -90° so it reads bottom-to-top. Each pool stacks vertically below the previous.
- **Lanes are horizontal sub-stripes** inside a pool, partitioning it vertically. Lane title strips also sit on the left edge with rotated labels.
- **Flow nodes** (tasks, events, gateways) live inside lanes, placed left-to-right by the auto-renderer based on dependency order.
- **Sequence flows** are solid arrows; **message flows** are dashed arrows with an open circle at the source end and an open triangle at the target.

These conventions show up in the templates as default `orientation: horizontal` on pools, fixed-width title strips, and the connector-style triggers in `connector.yaml`.

## Status

Spec-only. The markup compiler today doesn't recognise pool/lane/task/event/gateway as composite element kinds — it has hardcoded handling for the architecture meta-model's location/building-block/component/actor. Wiring this library into the toolchain end-to-end requires either generalising the markup compiler to be meta-model aware or adding a BPMN-specific markup compiler / auto-renderer. Both options are roadmap items; this library defines the *what* of BPMN visuals, the *how* lands later.
