# Unified Node View-Model Engine — Design

**Status:** parent design (decomposition + shared architecture). Each sub-project
(M1–M4, P1) gets its own spec → plan → build.

**Goal:** Unify mural's diagram node model so every node is a **view-model** held
in `DiagramDocument.Nodes`, rendered by a `[DataType=…]` **DataTemplate** hosted
inside a generic **Figure container**, and persisted through **generic per-VM
serialization**. This replaces the current *items-are-Figures* model and lets a
consumer (Plexus architecture nodes) render a per-type visual — an icon + label —
without subclassing `Figure` or touching mural's serialize.

## 1. Background — current state

- **Items-are-Figures ("new arch").** `Nodes` holds `Figure` instances. A
  `Figure` draws its **intrinsic** geometry (a `Shape` bound to the shape-catalog
  `Geometry`/`Fill`/`Stroke`) plus a `ShapeText` label. `DiagramDocument._serialize`
  iterates `Nodes`, persisting each `Figure` as `{id, kind, left, top, w, h, d,
  text}`; `_deserialize` reconstructs catalog/​text/​callout figures.
- **A latent wrapped-VM path already exists.** `Diagram.GetContainerForItemOverride`
  wraps any non-`Figure` `Model` item in a fresh `Figure` and calls `bindContainer`,
  which sets the container's `Tag`/`DataContext`/`Content = item`. But the Figure
  container template has **no `ContentPresenter`**, so the item never renders — the
  "known wart" the Figure header comment describes.
- **DataTemplate dispatch already works.** `ContentControl` resolves a template by
  the content's runtime type via `findDataTemplateForType(value.constructor, this)`
  (see `base/content-control.ts`). Only the presenter *host* is missing from the
  Figure container template.
- **History.** The suite calls the current model "items-are-Figures (**new arch**)"
  and `figure.ts` references a "historical `ShapeNodeVM`." This effort deliberately
  reverses that migration — back toward VMs — because per-type DataTemplate visuals
  are the requirement the items-are-Figures model cannot serve cleanly.

## 2. Target architecture

- **`Nodes` holds node view-models only** (plain `Model` subclasses).
- **`Figure` becomes the generic container**, owning everything that is *not* the
  node's picture: `Left`/`Top` (position, two-way bound to the VM), `Width`/`Height`
  (size), drag, selection (`Tag → VM`), resize, ports / connector anchoring. Its
  `Content` is the node VM; its template hosts a `ContentPresenter` that resolves
  `[DataType=<VM>]` to the node's visual.
- **Every node kind = a VM + a DataTemplate:**
  - `ShapeNodeVM` — `Kind`, unit-1 geometry source, `Fill`, `Stroke`. Template
    draws a `Shape` bound to a size-scaled `Geometry`. Replaces the Figure's
    intrinsic geometry rendering.
  - `TextNodeVM`, `CalloutNodeVM` — today's `TextShape` / `Callout` become VMs +
    templates.
  - `ArchNodeVM` (Plexus) — `Descriptor`, `Label`, `EntityId`. Template =
    `ToolboxVisualPresenter[Context=Figure, Descriptor=$Descriptor]` + a label.
- **Generic serialization.** Each VM type registers a `(serialize, deserialize)`
  pair keyed by a stable type tag. `DiagramDocument` writes `{type, left, top, w, h,
  data}` per node and dispatches on load by `type`. App-level VM data (arch entity
  ids, etc.) round-trips through the VM's own `data` blob — mural stays generic.

## 3. Decomposition

Each stage is a working, independently testable increment. The Diagrammer demo and
Plexus freeform shapes must stay green after every stage.

- **M1 — Container renders Content.** Add the `ContentPresenter` to the Figure
  container template; resolve `[DataType]` via existing `ContentControl` machinery;
  bind container `Left`/`Top` two-way to the VM; selection surfaces the VM via `Tag`.
  Prove with one minimal VM kind + template. Shapes remain intrinsic (dual path).
- **M2 — Shapes (`ShapeNodeVM`).** Migrate freeform shapes onto the VM path:
  `ShapeNodeVM` + shape DataTemplate (geometry/fill/stroke, size-driven rescale).
  `CreateNode` / `CombineSelection` emit `ShapeNodeVM` into `Nodes`; `DeleteNodes` +
  ungrouped-shape `Combine` operate on VM items. **Groups and connectors are NOT
  migrated here** — `Group`/`Ungroup` and connector endpoints stay Figure-based, so
  grouping/connecting VM shapes is limited until M4/M3; the group-related regression
  tests are temporarily skipped (re-enabled in M4). Serialize stays on the legacy
  format (interim) until M3.
- **M3 — Connectors + generic serialize.** Migrate connector endpoints to reference
  VMs and route against VM bounds; wire the `DeleteNodes` connector cascade to VMs.
  Replace the legacy `.diagram` format with a generic per-VM `(serialize, deserialize)`
  registry (`DiagramDocument` dispatch on load; back-compat read of old Figure scenes).
- **M4 — Groups + ports + Text/Callout VMs.** `GroupViewModel` (groups on the VM
  engine, bbox/parent/leaf semantics) + a group DataTemplate; per-kind port fidelity;
  `TextNodeVM` / `CalloutNodeVM`. Re-enable the group regression tests.
- **P1 — Plexus `ArchNodeVM`.** Arch drop factory builds `ArchNodeVM` (icon
  `Descriptor` + `Label` + `EntityId`) into `Nodes`; `[DataType=ArchNodeVM]` template
  renders icon + label; the arch binding re-materializes VMs from the model on open;
  positions ride the generic serialize from M3. This is where the original
  "we need icon and label" ask lands.

## 4. Migration & compatibility

- **Dual path in M1.** The intrinsic-shape rendering and the VM+template rendering
  coexist through M1; M2 collapses shapes onto the VM path.
- **Serialize back-compat (M3).** The loader reads legacy `{kind, d, …}` figure
  scenes and materializes the equivalent `ShapeNodeVM`; new saves use the typed-VM
  format. No silent data loss.
- **Consumers.** The demo (`demo/demos/diagram`) and Plexus keep working after each
  stage; each stage's spec lists the exact regression tests that gate it.

## 5. Risks

- **Figure-centric interaction code.** Drag / selection / group / resize / arrow-nudge
  assume Figure items today. The container keeps all of it; the VM-as-item path (the
  wrapped-container branch) must be exercised — the code already carries fallback
  branches (`Generator.ContainerFromItem`, "leaf is a data row") from the earlier VM
  arch, which reduces risk.
- **Connector anchoring.** Endpoints anchor to nodes. They must bind to the container
  Figure's bounds, not the inner VM/visual, or connectors detach after the migration.
- **Reversing "new arch".** items-are-Figures was itself a migration target; watch for
  the reasons it won (drag ergonomics, fewer indirections, perf on large scenes) and
  keep the container path as direct as the current one.

## 6. Out of scope

- Syncing in-place label edits back into a consumer's data model (Plexus model
  round-trip of renamed labels) — a follow-up after P1.
- Connector VMs (connectors stay as-is; this effort is node-model only).
