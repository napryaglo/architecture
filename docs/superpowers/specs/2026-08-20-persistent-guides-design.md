# Persistent Ruler Guides — Design

**Date:** 2026-08-20
**Repos:** `@pragmatic-tech-ai/mural` (framework: rulers, guide model, adorner, snap+glue) and Plexus (app: persistence, enablement)
**Status:** approved for spec → implementation plan

## Goal

Add Visio-style **long-term guides** to the Mural diagram: horizontal and vertical rulers along the viewport edges, from which the user drags out thin persistent guide lines. Guides survive save/reload, nodes snap to them while dragging, snapped nodes **glue** to the guide (moving the guide moves them), and guides can be repositioned or deleted after placement.

Distinct from the existing *alignment guides*, which are ephemeral (appear only mid-drag) and auto-computed. Persistent guides are user-placed and durable. The two share the adorner + camera-projection + `PositionSnap` machinery but are separate features.

## Non-goals

- No angled/diagonal guides — axis-aligned only (horizontal or vertical).
- No guide-to-guide spacing/distribution tooling.
- No per-guide styling UI (color/label) in this cut — one uniform guide style.
- No ruler unit switching (px/cm/in) — rulers read out raw content coordinates.
- Guides are diagram-presentation metadata; they are **not** model (`.todl`) entities.

## Glossary

- **Guide** — a persistent axis-aligned line at a fixed content coordinate.
- **Ruler** — the measured strip along the top (horizontal) / left (vertical) viewport edge; the drag source for new guides.
- **Glue** — a durable attachment between a node edge and a guide; when the guide moves, glued nodes translate with it.
- **Content coordinates** — the diagram's own coordinate space (node `Left`/`Top`), pre-camera. Rulers/guides render in host space by projecting content coords through the camera (zoom + pan).

## Existing seams this builds on

Verified against the code (2026-08-20):

- **Diagram template** — `Mural/src/framework/diagram/diagram.template.mu` (~250–270): `ScrollViewer (PART_Scroll) → AdornerDecorator → Border (PART_Camera, LayoutTransform=Scale(Zoom)) → ItemsPresenter`. The adorner layer sits outside the camera transform.
- **Camera state** — `diagram.ts` exposes `Zoom: number`, `ScrollX/ScrollY: number`, `Camera: {zoom,offsetX,offsetY}` (RO), `SetCamera(c)`, `HostToContent(hostX,hostY): Point`, `ScrollHost: ScrollViewer`.
- **Snap hook** — `type DiagramPositionSnap = (rect: Rect) => Rect`; DP `PositionSnapKey`. Behaviors compose over any prior callback (see `alignment-guides-behavior.ts`).
- **Alignment model** — `src/runtime/alignment-math.ts`: `AlignmentAxis {X='x',Y='y'}`, `EdgeKind {Min,Mid,Max}`, `findAlignmentGuides(rect, others)`, `AlignmentGuide`. Reused for guide snap math.
- **Adorner** — `src/visual-engine/adorner.ts`: `Adorner` base with `AdornedToLayerMatrix` (content→layer, set each arrange); `AdornerLayer.Add/Remove`, `AdornerLayer.GetAdornerLayer(visual)`. `AlignmentGuidesAdorner` is the render template to mirror.
- **Persistence** — `DiagramDocument.Metadata: Record<string,unknown>` is opaque to Mural and round-trips through `_serialize`/`_deserialize`. Plexus already persists the camera this way: `Plexus/.../persistence/diagram-camera-store.ts` (`doc.Metadata['camera']`, `readCamera`/`writeCamera`).

Rulers are **greenfield** — no existing ruler/tick/gutter component in either repo.

## Data model (Mural)

New file `src/framework/diagram/guides/guide-model.ts`:

```ts
import { AlignmentAxis } from '../../../runtime/alignment-math.js';

export enum GuideEdge { Min = 'min', Mid = 'mid', Max = 'max' }

export interface GuideGlue {
    readonly nodeId: string;   // DiagramDocument node id
    readonly edge:   GuideEdge; // which edge of the node is stuck to the guide
}

export interface PersistentGuide {
    readonly axis:     AlignmentAxis;    // X = vertical line, Y = horizontal line
    readonly position: number;           // content-space coordinate
    readonly glued:    readonly GuideGlue[];
}
```

`Diagram` gains a DP + accessor parallel to `AlignmentGuides`:

- `Diagram.GuidesKey` (routed DP), `Diagram.Guides: readonly PersistentGuide[]` (get/set), `Diagram._setGuides(g)` internal writer used by the behavior.
- `Diagram.RulersVisible: boolean` (DP, default `false`) — gates ruler chrome so untouched diagrams render exactly as today.

A node glues to **at most one X guide and one Y guide** simultaneously (a corner node can be glued to both, tracked independently — each guide's `glued` list references the node once).

## Component 1 — Rulers (Mural chrome)

**Template change.** Wrap `PART_Scroll` in a `Grid` so rulers sit *outside* both the camera and the scroll region (fixed on-screen, never zoom, never scroll):

```
Grid (rows: [rulerH, *], cols: [rulerW, *])
  ├─ (0,0) PART_RulerCorner   — small filler box
  ├─ (0,1) PART_RulerTop      — RulerBar Orientation=Horizontal
  ├─ (1,0) PART_RulerLeft     — RulerBar Orientation=Vertical
  └─ (1,1) PART_Scroll        — existing ScrollViewer → AdornerDecorator → PART_Camera → ItemsPresenter (unchanged)
```

When `RulersVisible=false`, ruler row/col collapse to 0 and the template is visually identical to today.

**`RulerBar`** (`src/framework/diagram/guides/ruler-bar.ts`, `extends Control`) — a measured strip. Reads `Diagram.Zoom` + `Diagram.ScrollX/ScrollY` (subscribes for invalidation), paints tick marks + numeric labels at "nice" intervals. Tick interval is chosen so on-screen spacing stays legible across zoom: pick the smallest interval from a `{1,2,5}×10ⁿ` ladder whose `interval × Zoom ≥ MIN_TICK_PX`. Projects a content coordinate `c` to host: `hostPos = c × Zoom − Scroll{X|Y}`. Renders through `.mural` template primitives (lines + `TextBlock`), no hardcoded chrome.

Tick math is pure and unit-tested in isolation:
`chooseTickInterval(zoom, minPx): number` and `ticksInRange(interval, contentMin, contentMax): number[]`.

## Component 2 — Guides adorner (render)

`PersistentGuidesAdorner extends Adorner` (`src/framework/diagram/guides/persistent-guides-adorner.ts`), mirroring `AlignmentGuidesAdorner`:

- Pooled `Border` line visuals; subscribes to `Diagram.GuidesKey` → `InvalidateArrange`.
- `ArrangeOverride` projects each guide's `position` through `AdornedToLayerMatrix` (the camera-projection pattern shipped in the alignment-guides fix): X-guide → vertical line `Rect(px − t/2, 0, t, H)`, Y-guide → horizontal line `Rect(0, py − t/2, W, t)`.
- **Hit-test-visible** lines (unlike the transient alignment guides): each line carries a few px of transparent grab padding so it can be grabbed for repositioning. Guide style is visually distinct from the ephemeral blue alignment guides (e.g. a solid accent line) — sourced from `DiagramSettings` (`GuideColor`, `GuideThickness`, `GuideGrabPadding`).
- Installed/removed via the same `_mount…/_detach…` + `AdornerLayer.GetAdornerLayer(ItemsPanelInstance)` pattern the alignment adorner uses; mount is deferred (microtask) until the items panel materializes.

## Component 3 — Guides behavior (interaction)

`attachPersistentGuides(diagram)` (`src/framework/diagram/behaviors/persistent-guides-behavior.ts`), the interaction coordinator, mirroring `alignment-guides-behavior.ts` and using the **preview-interceptor** pattern (routed pointer events tunnel through `Diagram.OnPreview*`, since figures swallow the bubble pass).

**Create (drag from ruler).** Pointer-down on a `RulerBar` starts a placement drag. A provisional guide follows the cursor via `Diagram.HostToContent`. **Snap-while-placing:** the provisional position snaps to node edges/centers using `findAlignmentGuides` against all node rects (same 5px tolerance). Pointer-up commits a new `PersistentGuide` into `Diagram.Guides` (axis from which ruler: top ruler → Y guide, left ruler → X guide).

**Reposition (drag a guide).** Pointer-down on a guide line (hit-test-visible) starts a move. New position via `HostToContent`, snap-while-placing as above. On move, the guide's glued nodes translate by the delta (see glue). Drop commits.

**Delete.** Drag a guide fully back onto its originating ruler → remove from `Diagram.Guides`. Also: with a guide grabbed/selected, `Delete`/`Backspace` removes it. Removal clears the guide's glue; nodes stay where they are.

All three routes funnel through one `setGuidePosition(guide, contentPos)` path so snapping/glue behave identically whether placing or repositioning.

## Component 4 — Snap + glue

**Snap (node → guide).** `attachPersistentGuides` composes a second link onto `Diagram.PositionSnap`, *after* the alignment-guides link. Given the dragged node's candidate `rect`, for each guide test the three node edges on that axis (min/mid/max) against `guide.position`; within tolerance, shift the rect so the nearest edge lands exactly on the guide. Alignment-guide snapping still runs first; persistent-guide snapping refines.

**Glue formation.** On node **drop**, for each axis, if a node edge is within tolerance of a guide, record `{nodeId, edge}` on that guide's `glued` list (replacing any prior glue for that node on that axis). If no guide is within tolerance on an axis, the node's glue for that axis is cleared.

**Glue break.** Plain drag-away is the un-glue gesture: while dragging a node, if it moves beyond tolerance from a guide it was glued to, that glue is dropped at drop time (i.e. re-evaluated by the drop rule above — a node that ends far from its old guide simply isn't re-glued). No modifier key.

**Glue translation (guide → nodes).** When a guide is dragged by `delta`, before committing the new position, translate every glued node: X-guide → `node.Left += dx`; Y-guide → `node.Top += dy`. Per-axis and independent — dragging an X guide never touches Y positions. Node mutation goes through `DiagramDocument` mutators so it's undoable and persisted like any move.

**Delete.** Removing a guide clears its `glued` list; nodes are left in place.

## Component 5 — Persistence (Plexus)

New `Plexus/src/renderer/src/modules/diagram/persistence/diagram-guides-store.ts`, a direct sibling of `diagram-camera-store.ts`:

```ts
export const DIAGRAM_GUIDES_KEY = 'guides';
export interface DiagramGuidesState { readonly guides: readonly PersistentGuide[] }
export function readGuides(doc: DiagramDocument): DiagramGuidesState | undefined;
export function writeGuides(doc: DiagramDocument, state: DiagramGuidesState): void;
```

Stored under `doc.Metadata['guides']` — opaque to Mural, round-trips through the existing serializer, **zero change to Mural's serialization contract**. Glue is part of the persisted shape, so stuck nodes stay stuck across reloads. Wiring mirrors the camera store: on load, `Diagram.Guides = readGuides(doc)?.guides ?? []`; on `GuidesKey` change (debounced with the existing save path), `writeGuides(doc, {guides})` + save.

## Enablement

Plexus turns the feature on for the architecture diagram: set `Diagram.RulersVisible = true` and call `attachPersistentGuides(diagram)` where it already calls `attachAlignmentGuides`. Other diagram hosts are unaffected (defaults keep rulers hidden and guides absent).

## Testing

**Mural (headless, `node:test`):**
- Tick math — `chooseTickInterval` picks legible intervals across a zoom sweep; `ticksInRange` enumerates correctly.
- Guides adorner — lines arrange to non-zero size; positions project through a non-identity `AdornedToLayerMatrix` (extends the existing `alignment-guides-adorner.test.ts` pattern).
- Snap composition — a candidate rect near a guide snaps its edge onto the guide; composes after alignment snap without clobbering it.
- Glue — drop within tolerance forms glue; drag-away drops it; dragging a guide translates glued nodes on the correct axis only; delete clears glue and leaves nodes.
- Serialization round-trip of `PersistentGuide` (incl. glue) via a fake metadata store.

**Mural (live, Playwright + Electron):** on `test_arch/diagram.diagram` — drag a guide from each ruler, confirm it renders on the node row at the projected position; drag a node onto a guide, confirm snap + glue; drag the guide, confirm glued node follows; reload, confirm guide + glue survive. (Reuses the `_electron` + `mural:visual-backref` introspection setup.)

**Plexus (vitest):** `diagram-guides-store` read/write round-trip through a fake `DiagramDocument`; load→`Diagram.Guides` and change→`writeGuides` wiring.

## Rollout

Mural minor version bump published to local Verdaccio (localhost:4873 only). Plexus bumps the dependency, wires the store + enablement, rebuilds. Both mains stay unpushed until the user asks. Standard dance, same as recent features.

## Resolved decisions

- Drag source: **rulers** (Visio-style), not bare edges or a toolbar button.
- Behaviors: persist + node-snaps-to-guide + reposition/delete + snap-while-placing — **all in v1**.
- Snap strength: **sticky glue** (guide drags glued nodes).
- Ruler mount: **Grid wrapper** around `PART_Scroll` (rulers as first-class chrome).
- Un-glue gesture: **plain drag-away** (no modifier).
- Scope: **full feature in one cut**, not phased.
