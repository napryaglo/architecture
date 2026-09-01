# Toolbox Repository (mural framework) — Design

**Date:** 2026-08-08
**Repo:** Mural (`@pragmatic-tech-ai/mural`)
**Status:** Design approved; ready for implementation plan.

This is **Spec A** of a two-spec effort to unify toolbox elements and their
visuals. Spec A builds the generic mural framework foundation. **Spec B**
(separate spec, in the Plexus repo) supplies the concrete meta-model /
library adapters and migrates Plexus's toolbox, canvas, and library preview
onto this foundation. Spec B depends on Spec A being published.

---

## Problem

Today "toolbox elements" come from three sources — built-in shapes
(`ToolboxShape`), meta-model taxonomy terms, and library classes — and three
consumers each hand-roll the same "carry a template + resolve it + subscribe
to an upgrade signal + present it" pattern: the canvas node, the library
preview, and the toolbox tile. The three drifted: the canvas node and preview
resolve and render an element's visual correctly, but the toolbox tile renders
only its text label and silently drops the resolved visual — so library
toolbox tiles show no icons. The root cause is structural: N sources × M
consumers wired pair-by-pair, with the one real resolution authority
(`LibraryRegistry`) only knowing library classes.

Spec A removes the divergence at the framework level: one repository of
droppable elements, one visual-resolution protocol shared by every surface,
and one drop mechanism — so a consumer that forgets to resolve/subscribe
cannot exist.

## Goal

A mural framework subsystem — `ToolboxRepository` and friends — that owns the
structure of a palette (pages of items), resolves each item's visual through a
registered per-kind resolver shared by palette / canvas / preview, and drops
each item through a registered per-kind factory. Mural ships a working
built-in **Shapes** page and wires it on first diagram init. Apps (Plexus)
register additional pages, item kinds, resolvers, and factories against the
same repository.

## Global Constraints

- Package: `@pragmatic-tech-ai/mural`. Consumed by Plexus from Verdaccio
  (`http://localhost:4873/`); a framework change here means a version bump +
  republish before Spec B can consume it.
- **Enums, never string-literal unions** (mural CLAUDE.md). `VisualContext` is
  a real enum with explicit string values. Markup-facing DataTypes register in
  `compiler/symbol-table.ts`.
- **Every Control has a default Style.** `ToolboxVisualPresenter`'s `Template`
  is a `ControlTemplate` DP set in a `*.template.mu`; the ctor calls
  `applyDefaultStyle()`. No `Application.ResolveDefaultResource(stringKey)` /
  `resolveXxxTemplate` helpers.
- **No string-keyed resolution.** Resolvers and factories resolve through typed
  `ServiceKey`s from `Application.current.Services`, never a `kind`-string
  switch.
- **Every test file lives in a `tests/` subfolder** next to the code it
  exercises.
- **Hard cutover.** `ToolboxShape`, `DiagramDocument.ToolboxShapes`, and
  `TOOLBOX_NODE_KIND_FORMAT` are deleted, not deprecated. Every mural demo
  palette + drop path and every affected test migrates onto the repository in
  this spec. Single drag payload format.

---

## Architecture

```
Application.current.Services (singleton)
  ├─ ToolboxRepositoryKey  → ToolboxRepository
  │                              └─ Pages: ObservableCollection<ToolboxPage>
  │                                    └─ Items: ObservableCollection<ToolboxItem>
  │                                          { Id, Label, Descriptor, FactoryKey }
  ├─ ShapeVisualResolverKey → IToolboxVisualResolver  (mural default)
  ├─ ShapeDropFactoryKey    → IToolboxDropFactory     (mural default)
  └─ (Plexus adds concept/class resolvers + factories in Spec B)

Descriptor = { ResolverKey: ServiceKey<IToolboxVisualResolver>, Key: string }

Consumers → all mount ToolboxVisualPresenter (resolve + subscribe in one place):
  • palette tile   Context = Tile
  • canvas node    Context = Figure   (picture-backed factories only)
  • preview        Context = Tile/Figure   (Plexus, Spec B)
```

Adding an element kind = register a resolver + a factory + add items to a
page. Zero changes to drop plumbing or the presenter.

---

## Components

### 1. Core data model

Four `Model` types with DP-backed properties (`src/framework/diagram/toolbox/`).

**`ToolboxVisualDescriptor`** — the lightweight "what to draw" handle.
- `ResolverKey: ServiceKey<IToolboxVisualResolver>` — who can draw it.
- `Key: string` — the resolver-specific handle (a `SHAPE_CATALOG` kind, a
  library class id, a concept id).
- In-memory only; never serialized. The canvas rebuilds a node's descriptor
  from its persisted term id (Spec B).

**`ToolboxItem`** (base `Model`) — one droppable palette entry.
- `Id: string` — unique across the repository; the drag payload carries it.
- `Label: string`
- `Descriptor: ToolboxVisualDescriptor`
- `FactoryKey: ServiceKey<IToolboxDropFactory>` — who turns it into a canvas
  node on drop.
- `BeginDragData` callback DP → `new DataObject().Set(TOOLBOX_ITEM_FORMAT, this.Id)`
  (mirrors the retired `ToolboxShape.BeginKindDragData`).
- Subclassable; the base already carries everything palette + drop need.

**`ToolboxPage`** (`Model`) — one palette section.
- `Id: string`, `Title: string`, `Items: ObservableCollection<ToolboxItem>`.

**`ToolboxRepository`** (`Model`) — the singleton, registered in
`Application.current.Services` under `ToolboxRepositoryKey: ServiceKey<ToolboxRepository>`.
- `Pages: ObservableCollection<ToolboxPage>`.
- `EnsurePage(id, title): ToolboxPage` — get-or-create.
- `ItemById(id): ToolboxItem | undefined` — the drop path's lookup.
- `RemovePage(id): void`, `Clear(): void` — for re-population.
- Pure structure; holds no resolution logic.

### 2. Protocols (interfaces + `ServiceKey`s)

**`VisualContext`** (enum): `{ Tile = 'tile', Figure = 'figure' }`.

**`IToolboxVisualResolver`** — descriptor → picture, per surface, with a
not-yet-loaded signal.
- `Resolve(descriptor: ToolboxVisualDescriptor, context: VisualContext): Visual`
  — returns a **fresh** `Visual` per call (a Visual can't be in two places),
  sized/chromed for the context; returns the resolver's own **placeholder**
  Visual during the not-yet-loaded window.
- `AddChangedListener(cb: (key: string) => void): void` /
  `RemoveChangedListener(cb): void` — fires with a descriptor `Key` when that
  key's real picture becomes available. Resolvers whose data is always ready
  (shapes) never fire it.

**`IToolboxDropFactory`** — dropped item → real canvas node.
- `CreateDropped(context: ToolboxDropContext): unknown | null`
  where `ToolboxDropContext = { Item: ToolboxItem, Descriptor: ToolboxVisualDescriptor,
  Position: Point, Diagram: Diagram, Mutator: DiagramMutator }`.
- Creates the selectable/movable node, mutates the document through `Mutator`,
  returns the created node (for selection) or `null`.
- **Visual delegation is optional.** Intrinsic-geometry factories (shapes)
  build their Figure directly and ignore the resolver on the canvas.
  Picture-backed factories set node content via the resolver's `Figure`-context
  Visual, through the shared presenter (so it upgrades on `changed`).

Both register in `Application.current.Services` under their `ServiceKey`s and
resolve on demand — no `kind`-string switches.

### 3. Shared presenter — `ToolboxVisualPresenter`

One framework Control (extends `ContentControl`, for its `Content` DP + host
template) that every surface routes its visual through, so "resolve + host +
subscribe" exists in exactly one place. Keys on the **descriptor**, not the
item (a canvas node / preview is not a `ToolboxItem`).

- DPs: `Descriptor: ToolboxVisualDescriptor`, `Context: VisualContext`.
- On `Descriptor`/`Context` change: resolve
  `Services.getRequired(Descriptor.ResolverKey)`, call `Resolve(Descriptor,
  Context)`, set the result as the Control's `Content`.
- Subscribe once to that resolver's `AddChangedListener`; on `key ===
  Descriptor.Key`, re-resolve and **swap `Content` in place** (no sibling
  re-layout, no tile/node rebuild). Unsubscribe on descriptor change or when
  the Control leaves the tree.
- Real Control per mural rules: ctor calls `applyDefaultStyle()`; `Template` is
  a `ControlTemplate` DP in `toolbox-visual-presenter.template.mu` that hosts
  `Content` via a `ContentPresenter`. No chrome in code.

The class resolver (Spec B) bridges to a `Visual` as: look up
`Descriptor.Key` in the baked presentation → `DataTemplate` → `.Apply({
Display })` → `Visual`; placeholder box until loaded, then `changed(Key)`. The
presenter is oblivious — it hosts a `Visual` and re-hosts on signal.

Consumers: palette tile (`Context = Tile`), picture-backed canvas node
(`Context = Figure`), library preview (Spec B). All mount the same Control, so
all subscribe identically — the divergence bug becomes structurally
impossible.

### 4. Built-in Shapes + `Diagram` first-init

**`ShapeToolboxItem`** (extends `ToolboxItem`) — one per `SHAPE_CATALOG` entry.
`Id = "shape:" + kind`, `Label` from the catalog, `Descriptor = { ResolverKey:
ShapeVisualResolverKey, Key: kind }`, `FactoryKey = ShapeDropFactoryKey`.

**Shape resolver** (`IToolboxVisualResolver` under `ShapeVisualResolverKey`) —
`Resolve(desc, Tile)` returns a 48×48 `Figure.fromKind(desc.Key)` with
`IsHitTestVisible = false` and the preview fill (today's
`ToolboxShape.PreviewNode`, now behind the resolver). Always ready: no
placeholder, never fires `changed`. `Resolve(desc, Figure)` returns
`Figure.fromKind` at default size (unused by the shape factory, but defined).

**Shape factory** (`IToolboxDropFactory` under `ShapeDropFactoryKey`) —
`CreateDropped(ctx)` → `ctx.Mutator.CreateNode(ctx.Descriptor.Key,
ctx.Position.X, ctx.Position.Y)`, returns the node. Intrinsic geometry: never
touches the resolver on the canvas.

**`ensureToolboxDefaults(services)`** — idempotent, run from the `Diagram`
control's initialization, guarded so N diagrams register once:
1. If `services` lacks `ToolboxRepositoryKey` → create `ToolboxRepository`,
   register it.
2. Register the shape resolver + shape factory under their keys if absent.
3. If the repository has no "Shapes" page → add one, populated with a
   `ShapeToolboxItem` per `SHAPE_CATALOG` entry.

A bare mural diagram gets a working Shapes palette with zero app wiring.

### 5. Drag & drop — single payload format

- **`TOOLBOX_ITEM_FORMAT`** (`'@pragmatic-tech-ai/mural/toolbox-item'`) replaces
  `TOOLBOX_NODE_KIND_FORMAT` outright. The drag payload carries the item id.
- `canvas-drop-behavior` gates `DragOver`/`Drop` on `TOOLBOX_ITEM_FORMAT`
  instead of the deleted kind format.
- `attach-standard-mutations`' `onDropped`:
  ```
  const id = args.Data.Get(TOOLBOX_ITEM_FORMAT)
  const repo = Application.current.Services.getRequired(ToolboxRepositoryKey)
  const item = repo.ItemById(id);            if (!item) return
  const factory = Application.current.Services.getRequired(item.FactoryKey)
  const node = factory.CreateDropped({
      Item: item, Descriptor: item.Descriptor,
      Position: new Point(args.Position.X - off.dx, args.Position.Y - off.dy),
      Diagram: diagram, Mutator: mutator,
  })
  if (node != null) diagram.SelectedItem = node
  ```
- `DiagramMutator.CreateNode` **stays** on the interface (the shape factory and
  programmatic callers use it), but *drop* always goes through a factory. The
  `NodeDropOffset` convention is unchanged, applied once in the router.

Adding a kind touches no drop plumbing: register resolver + factory, add items.

### 6. Migration (hard cutover)

Footprint: `ToolboxShape` / `ToolboxShapes` / `TOOLBOX_NODE_KIND_FORMAT` = 68
refs across 20 files.

**New files** (`src/framework/diagram/toolbox/`): `toolbox-repository.ts`,
`toolbox-page.ts`, `toolbox-item.ts`, `toolbox-visual-descriptor.ts`,
`toolbox-visual-resolver.ts` (interface + `VisualContext`),
`toolbox-drop-factory.ts` (interface + `ToolboxDropContext`),
`toolbox-visual-presenter.ts` + `toolbox-visual-presenter.template.mu`,
`shape-visual-resolver.ts`, `shape-drop-factory.ts`, `shape-toolbox-item.ts`,
`ensure-toolbox-defaults.ts`.

**Deleted:** `toolbox-shape.ts` (class + its 19 internal refs);
`TOOLBOX_NODE_KIND_FORMAT`.

**Modified core:** `diagram-document.ts` (remove the `ToolboxShapes` DP + its
ctor population; `CreateNode` stays); `canvas-drop-behavior.ts` (gate on
`TOOLBOX_ITEM_FORMAT`); `attach-standard-mutations.ts` (`onDropped` →
repo-lookup + factory); `diagram.ts` (call `ensureToolboxDefaults` on init;
export swap); `framework/index.ts` (export new types, remove `ToolboxShape`);
`compiler/symbol-table.ts` (register `ToolboxVisualPresenter` + new markup
DataTypes, drop `ToolboxShape`).

**Demos** (`demo/demos/diagram/*` — `.mu`, `.mu.js`, `.mjs`): the toolbox rail
rebinds from `Document.ToolboxShapes` to the repository's `Pages`; the
`[DataType = ToolboxShape]` tile template becomes a `ToolboxItem` tile hosting
`ToolboxVisualPresenter [ Descriptor = $Descriptor, Context = Tile ]`;
`$BeginKindDragData` → `$BeginDragData`.

**Docs:** `diagram-api-guide.md`, `behaviors.md`, `current-backlog.md` updated
to the new API.

---

## Testing

All test files under `tests/` subfolders.

- **Repository / descriptor / item** — `EnsurePage` get-or-create, `ItemById`
  hit/miss, `Clear`/`RemovePage`; item exposes descriptor + factory key +
  `BeginDragData` payload carrying `Id` under `TOOLBOX_ITEM_FORMAT`.
- **Presenter (regression net)** — mount with a *fake* resolver that returns a
  placeholder then fires `changed`; assert `Content` is the resolved Visual and
  **swaps in place** on the signal; assert it unsubscribes on descriptor change
  / detach (no leak). This is the test whose absence allowed the original bug.
- **Shape resolver / factory** — `Resolve(desc, Tile)` → a 48×48
  non-hit-test `Figure`; `CreateDropped` → `mutator.CreateNode(kind, x, y)`
  called and the node returned.
- **Drop routing** — synth `ItemDropped` with `TOOLBOX_ITEM_FORMAT = id` → repo
  lookup → factory `CreateDropped` with offset-applied `Position` →
  `SelectedItem` set (rewrite of `diagram-canvas-drop.test.ts`).
- **First-init idempotency** — `ensureToolboxDefaults` twice → one repo, one
  Shapes page, resolver + factory registered once.
- **Demo smoke** — the diagram demo still drops a shape and creates a node.

---

## Out of scope (Spec B, Plexus)

- Concept and library-class resolvers (the latter backed by `LibraryRegistry` +
  the baked presentation), and their placeholder + `changed` behavior.
- Drop factories that create arch instance nodes.
- The populator that fills the repository from `projectToolbox` (replacing
  `TermTile` scanning), and `ToolboxService` exposing the repo as `.Repository`.
- Migrating the Plexus canvas (`InstanceNodeVM` / `ArchDiagramDocument`) and the
  library preview onto `ToolboxVisualPresenter`.
- Deleting `TermTile` / `toolbox-term-template`.
