# Diagram Containers — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the nesting core for diagram containers — a `ContainerFigure` that holds child Figures as true visual descendants (hard-clipped, move-together), membership tracked by a serialized `parentId`, with connectors and selection adorners correct for nested nodes, plus drag-in/out and drop-empty creation.

**Architecture:** The node collection stays flat; a `parentId` on each `NodeVisual` names its container. A `ContainerPlacement` collaborator re-parents each child Figure's Visual out of the root figures-layer into its container's inner clipped `Canvas` after realization (using the existing `ContainerBound` event). A `diagramSpaceRect(figure)` helper walks the ancestor-container chain summing content offsets; connector `nodeRect()` and `SelectionBoundsTracker` read through it so nested nodes route/adorn correctly. Move-together, z-order, hit-test, and hard-clip come from the real visual tree.

**Tech Stack:** TypeScript, Mural framework (`src/framework/diagram`), node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-08-22-diagram-containers-design.md` (read Sections 1–9 + Staging; this plan implements Stage 1).

## Global Constraints

- Every control MUST have a default Style; no `Application.ResolveDefaultResource(stringKey)` / string-key template lookups. A control's template is a `ControlTemplate` on its default Style block in a `*.template.mu`, resolved via `applyDefaultStyle()` (see `Mural/CLAUDE.md`).
- Fixed sets of named values are real TypeScript `enum`s, PascalCase members with explicit string values — never string-literal unions or bare literals at use sites.
- Every test file lives in a `tests/` subfolder next to the code it exercises (`src/framework/diagram/tests/…`).
- Cross-class internals: prefer public API / subclassing; if you must reach in, declare a named interface and cast through it — never bracket access.
- Run a single test file with: `npx tsx --conditions=development --test src/framework/diagram/tests/<file>.test.ts` (confirm against `package.json` `test` script). Full suite: `npm test`.
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT run the Plexus app or touch the corpus at `C:/Users/Eugene/Projects/plexus_tests`; Stage 1 is Mural-only, headless + framework-integration tests.

## File Structure

- `src/framework/diagram/node-visual-store.ts` — MODIFY: add `parentId` to `NodeVisual`; Read/Apply map it to/from `Figure.ParentId`.
- `src/framework/diagram/figure.ts` — MODIFY: add `ParentId` (string | undefined) + a live `ContainerParent` link + `ContentOrigin`/`ChildHost` hooks used by subclass/collaborator.
- `src/framework/diagram/container-figure.ts` — CREATE: `ContainerFigure extends Figure` with `PART_ChildContainer` inner Canvas, title band, `ChildHost`, `ContentOrigin`.
- `src/framework/diagram/diagram.template.mu` — MODIFY: add `Style[TargetType=ContainerFigure]` with the container template.
- `src/framework/diagram/collaborators/container-placement.ts` — CREATE: the re-parenting collaborator (deferred attach + reparent).
- `src/framework/diagram/coordinate-space.ts` — CREATE: `diagramSpaceRect(node)` / `toParentSpace(point, container)`.
- `src/framework/diagram/connector.ts` — MODIFY: `nodeRect()` returns `diagramSpaceRect`.
- `src/framework/diagram/collaborators/selection-bounds-tracker.ts` — MODIFY: union bounds via `diagramSpaceRect`.
- `src/framework/diagram/node-serializers-default.ts` — MODIFY: register the `'container'` node serializer.
- `src/framework/diagram/diagram.ts` — MODIFY: construct `ContainerPlacement`; register `'container'` in the drop/catalog path; drag-in/out on pointer-up; skip descendants as drag-shift partners.
- `src/framework/diagram/shape-catalog.ts` — MODIFY: register the `'container'` kind so `Figure.fromKind('container', …)` yields a `ContainerFigure`.
- Tests: co-located `tests/*.test.ts` per task.

---

### Task 1: `parentId` on `NodeVisual` + `Figure.ParentId`

**Files:**
- Modify: `src/framework/diagram/figure.ts` (add `ParentId` accessor, plain nullable field — it is not layout-affecting geometry, it is a membership tag consumed by the collaborator)
- Modify: `src/framework/diagram/node-visual-store.ts` (interface + Read/Apply)
- Test: `src/framework/diagram/tests/node-visual-store.test.ts` (extend existing)

**Interfaces:**
- Produces: `Figure.ParentId: string | undefined` (get/set); `NodeVisual.parentId?: string`; `NodeVisualStore.Read` captures it, `Apply` restores it.

- [ ] **Step 1: Write the failing test** — append to `node-visual-store.test.ts`:

```ts
test('parentId: omitted when unset, captured + round-tripped when set', () => {
    const store = new NodeVisualStore();
    // Unset → omitted.
    const bare = fig();
    assert.equal('parentId' in store.Read(bare), false);
    // Set → captured...
    const child = fig(); child.ParentId = 'container-7';
    const v = store.Read(child);
    assert.equal(v.parentId, 'container-7');
    // ...and restored onto a fresh node.
    const g = fig();
    store.Apply(v, g);
    assert.equal(g.ParentId, 'container-7');
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx tsx --conditions=development --test src/framework/diagram/tests/node-visual-store.test.ts` → FAIL (`ParentId` not a property / `parentId` undefined).

- [ ] **Step 3: Implement.** In `figure.ts`, add a private field and accessor near the other membership/provenance members (`_kind`, line ~245):

```ts
// Container membership tag: the id of the ContainerFigure this node nests in
// (undefined = root). Not layout geometry — the ContainerPlacement collaborator
// reads it to re-parent this Figure's Visual into that container's ChildHost, and
// mirrors it to the live ContainerParent link. Persisted via NodeVisualStore.
private _parentId: string | undefined = undefined;
public get ParentId(): string | undefined { return this._parentId; }
public set ParentId(v: string | undefined) { this._parentId = v; }
```

In `node-visual-store.ts`, add to the `NodeVisual` interface (near `anchor`):

```ts
    // Container membership: the id of the ContainerFigure this node nests in
    // (omitted when a root node). Its Left/Top are then parent-relative.
    parentId?: string;
```

In `Read`, after the anchor capture:

```ts
        if (node.ParentId !== undefined) v.parentId = node.ParentId;
```

In `Apply`, after the anchor restore:

```ts
        if (v.parentId !== undefined) node.ParentId = v.parentId;
```

- [ ] **Step 4: Run it, verify it passes.** Same command → PASS. Also run the whole `node-visual-store.test.ts` (no regressions).

- [ ] **Step 5: Commit** — `git add -A && git commit` "feat(diagram): NodeVisual carries parentId (container membership)".

---

### Task 2: `coordinate-space.ts` — `diagramSpaceRect` / `toParentSpace`

**Files:**
- Create: `src/framework/diagram/coordinate-space.ts`
- Test: `src/framework/diagram/tests/coordinate-space.test.ts`

**Interfaces:**
- Consumes (Task 3/4 provide at runtime): a node exposing `Left/Top/Width/Height` and an optional `ContainerParent` link; a container exposing `ContentOrigin: Point` and itself being such a node.
- Produces:
  - `interface SpatialNode { Left: number; Top: number; Width: number; Height: number; ContainerParent?: ContainerLike; }`
  - `interface ContainerLike extends SpatialNode { ContentOrigin: Point; }`
  - `diagramSpaceRect(node: SpatialNode): Rect` — node rect in absolute diagram-host space.
  - `toParentSpace(point: Point, container: ContainerLike): Point` — a diagram-space point expressed in the container's content space.

This task is pure geometry (no framework deps) so it is unit-testable in isolation with plain stub objects.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Rect } from '../../../visual-engine/index.js';
import { diagramSpaceRect, toParentSpace, type ContainerLike, type SpatialNode } from '../coordinate-space.js';

function container(left: number, top: number, originX: number, originY: number, parent?: ContainerLike): ContainerLike {
    return { Left: left, Top: top, Width: 200, Height: 200, ContentOrigin: new Point(originX, originY), ContainerParent: parent };
}

test('diagramSpaceRect: root node is its own Left/Top', () => {
    const n: SpatialNode = { Left: 10, Top: 20, Width: 30, Height: 40 };
    const r = diagramSpaceRect(n);
    assert.deepEqual([r.X, r.Y, r.Width, r.Height], [10, 20, 30, 40]);
});

test('diagramSpaceRect: one level sums container origin + content offset', () => {
    // container at (100,100), content inset (5, 25); child local (10, 20).
    const c = container(100, 100, 5, 25);
    const child: SpatialNode = { Left: 10, Top: 20, Width: 30, Height: 40, ContainerParent: c };
    const r = diagramSpaceRect(child);
    assert.deepEqual([r.X, r.Y], [100 + 5 + 10, 100 + 25 + 20]); // (115, 145)
});

test('diagramSpaceRect: two levels walk the whole chain', () => {
    const outer = container(100, 100, 5, 25);
    const inner = container(10, 10, 2, 8, outer); // inner is a child of outer
    const child: SpatialNode = { Left: 1, Top: 1, Width: 5, Height: 5, ContainerParent: inner };
    const r = diagramSpaceRect(child);
    // outer origin (100+5,100+25)=(105,125) + inner local (10,10) = inner diagram origin (115,135)
    // + inner content (2,8) = (117,143) + child local (1,1) = (118,144)
    assert.deepEqual([r.X, r.Y], [118, 144]);
});

test('toParentSpace: inverse of one level', () => {
    const c = container(100, 100, 5, 25);
    const p = toParentSpace(new Point(115, 145), c);
    assert.deepEqual([p.X, p.Y], [10, 20]);
});
```

- [ ] **Step 2: Run it, verify it fails** — module not found.

- [ ] **Step 3: Implement `coordinate-space.ts`:**

```ts
import { Point, Rect } from '../../visual-engine/index.js';

export interface SpatialNode {
    readonly Left: number;
    readonly Top: number;
    readonly Width: number;
    readonly Height: number;
    readonly ContainerParent?: ContainerLike;
}

export interface ContainerLike extends SpatialNode {
    readonly ContentOrigin: Point;
}

// The node's rect in absolute diagram-host space. Walks the container-ancestor
// chain: each container contributes its own diagram-space top-left plus its
// ContentOrigin (the inset of its child host from its own origin). A root node
// (no ContainerParent) is simply (Left, Top, Width, Height).
export function diagramSpaceRect(node: SpatialNode): Rect {
    let x = node.Left;
    let y = node.Top;
    let container = node.ContainerParent;
    while (container !== undefined) {
        x += container.Left + container.ContentOrigin.X;
        y += container.Top + container.ContentOrigin.Y;
        container = container.ContainerParent;
    }
    return new Rect(x, y, node.Width, node.Height);
}

// Express a diagram-space point in `container`'s content space (the inverse of
// the per-level sum in diagramSpaceRect). Used when re-parenting a node into a
// container so its local Left/Top keep it visually put.
export function toParentSpace(point: Point, container: ContainerLike): Point {
    const origin = diagramSpaceRect(container); // container's own diagram-space top-left
    return new Point(point.X - origin.X - container.ContentOrigin.X,
                     point.Y - origin.Y - container.ContentOrigin.Y);
}
```

- [ ] **Step 4: Run it, verify it passes.**

- [ ] **Step 5: Commit** "feat(diagram): diagram-space coordinate walk for nested nodes".

---

### Task 3: `Figure.ContainerParent` + `ContentOrigin` seam

**Files:**
- Modify: `src/framework/diagram/figure.ts`
- Test: `src/framework/diagram/tests/figure-container-parent.test.ts`

**Interfaces:**
- Produces on `Figure`: `ContainerParent: Figure | undefined` (live link, plain field, set by the collaborator); `ContentOrigin: Point` (base Figure returns `Point(0,0)` — only `ContainerFigure` overrides). These satisfy `SpatialNode`/`ContainerLike` from Task 2 so `diagramSpaceRect(figure)` compiles and runs.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';
import { diagramSpaceRect } from '../coordinate-space.js';

function fig(l: number, t: number): Figure { Application.current = null; new Application(); return Figure.fromKind('rectangle', l, t, { width: 40, height: 30 }); }

test('base Figure: ContentOrigin is (0,0) and ContainerParent defaults undefined', () => {
    const f = fig(5, 6);
    assert.deepEqual([f.ContentOrigin.X, f.ContentOrigin.Y], [0, 0]);
    assert.equal(f.ContainerParent, undefined);
});

test('diagramSpaceRect uses a Figure ContainerParent link', () => {
    const parent = fig(100, 100);
    const child = fig(10, 20);
    child.ContainerParent = parent;
    const r = diagramSpaceRect(child);
    // base ContentOrigin (0,0): 100+0+10, 100+0+20
    assert.deepEqual([r.X, r.Y], [110, 120]);
});
```

- [ ] **Step 2: Run it, verify it fails** (`ContentOrigin`/`ContainerParent` undefined).

- [ ] **Step 3: Implement** in `figure.ts` (near `_parentId` from Task 1):

```ts
import { Point } from '../../visual-engine/index.js'; // add if not already imported

// Live link to the ContainerFigure this node is nested in (undefined = root).
// Maintained by ContainerPlacement in lock-step with ParentId; read by
// diagramSpaceRect to walk the ancestor chain. A plain field (not a DP): it is
// view-structure the collaborator owns, not bindable content.
public ContainerParent: Figure | undefined = undefined;

// The inset of this node's child host from its own top-left. Base Figure hosts
// no children, so (0,0); ContainerFigure overrides with its title-band + padding.
public get ContentOrigin(): Point { return Point.Zero ?? new Point(0, 0); }
```

(If `Point.Zero` does not exist, use `new Point(0, 0)`; confirm against `visual-engine`.)

- [ ] **Step 4: Run it, verify it passes.**

- [ ] **Step 5: Commit** "feat(diagram): Figure ContainerParent link + ContentOrigin seam".

---

### Task 4: `ContainerFigure` + its template

**Files:**
- Create: `src/framework/diagram/container-figure.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (add `Style[TargetType=ContainerFigure]`)
- Modify: `src/framework/diagram/shape-catalog.ts` (register `'container'` kind → constructs a `ContainerFigure` box)
- Test: `src/framework/diagram/tests/container-figure.test.ts`

**Interfaces:**
- Consumes: `Figure` base; `ContentOrigin` override point from Task 3.
- Produces: `ContainerFigure extends Figure` with `ChildHost: Panel | undefined` (the `PART_ChildContainer` Canvas) and `ContentOrigin: Point` (title-band height + padding, e.g. `new Point(PADDING, TITLE_BAND + PADDING)`); constants `CONTAINER_TITLE_BAND`, `CONTAINER_PADDING`. Registered so `Figure.fromKind('container', l, t, {width,height})` returns a `ContainerFigure`.

Read first: `text-node.ts` (a Figure subclass with its own default Style — mirror its `OverrideMetadata(…DefaultStyleKeyKey)` + ctor shape) and the existing Figure `Template` in `diagram.template.mu` (PART_Content + PART_LabelHost) to copy structure.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Panel } from '../../../basic/index.js';
import { ContainerFigure, CONTAINER_TITLE_BAND, CONTAINER_PADDING } from '../container-figure.js';
import { Figure } from '../figure.js';

function app(): void { Application.current = null; new Application(); }

test('ContainerFigure exposes a ChildHost panel after style resolution', () => {
    app();
    const c = new ContainerFigure();
    assert.ok(c.ChildHost instanceof Panel, 'PART_ChildContainer should resolve to a Panel');
});

test('ContentOrigin reserves the title band + padding', () => {
    app();
    const c = new ContainerFigure();
    assert.equal(c.ContentOrigin.X, CONTAINER_PADDING);
    assert.equal(c.ContentOrigin.Y, CONTAINER_TITLE_BAND + CONTAINER_PADDING);
});

test("Figure.fromKind('container') yields a ContainerFigure", () => {
    app();
    const c = Figure.fromKind('container', 3, 4, { width: 160, height: 120 });
    assert.ok(c instanceof ContainerFigure);
    assert.equal(c.Left, 3); assert.equal(c.Top, 4);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `container-figure.ts`** (mirror `text-node.ts`'s default-Style wiring):

```ts
import { MuralBase, Element } from '../../runtime/index.js';
import { Panel } from '../../basic/index.js';
import { Point } from '../../visual-engine/index.js';
import { Figure } from './figure.js';

export const CONTAINER_TITLE_BAND = 24; // header height for the title
export const CONTAINER_PADDING    = 8;  // inset around the child region

// A container node: a titled, styleable box that hosts child Figures as true
// visual descendants inside PART_ChildContainer (a clipped Canvas). Being a
// Figure it keeps geometry, Fill/Stroke card styling, ShapeText title, and
// connector endpoints; ClipToBounds (Figure default true) hard-clips children.
export class ContainerFigure extends Figure {
    static { MuralBase.OverrideMetadata(ContainerFigure, Element.DefaultStyleKeyKey, { default_value: ContainerFigure }); }

    private _childHost: Panel | undefined;

    constructor() {
        super(); // Figure ctor calls applyDefaultStyle()
        this._childHost = this.GetTemplateChild('PART_ChildContainer') as Panel | undefined;
    }

    public get ChildHost(): Panel | undefined { return this._childHost; }

    public override get ContentOrigin(): Point {
        return new Point(CONTAINER_PADDING, CONTAINER_TITLE_BAND + CONTAINER_PADDING);
    }
}
```

- [ ] **Step 4: Add the template** to `diagram.template.mu` — a `Style[TargetType=ContainerFigure]` whose `Template` mirrors the Figure template's Canvas root and adds a clipped child-host Canvas. Read the existing Figure `Template` block first and copy its `PART_Content`/`PART_LabelHost` shape; add:

```
Style [ TargetType = ContainerFigure ] {
    Template {
        Canvas {
            // The box paints via Figure Fill/Stroke; label host carries the title.
            Border x:name="PART_LabelHost" [ Width = $$Width, Height = $$Height ]
            // Child region: clipped Canvas hosting nested Figures, inset below the title band.
            Canvas x:name="PART_ChildContainer"
                [ Canvas.Left = 8, Canvas.Top = 32,
                  Width = $$Width, Height = $$Height, ClipToBounds = true ]
        }
    }
}
```

(Match exact binding syntax + property names to the real Figure template; `32` == `CONTAINER_TITLE_BAND + CONTAINER_PADDING`, `8` == `CONTAINER_PADDING`. If width/height must subtract the insets, bind through a converter or set in `MeasureOverride` — confirm how the Figure template sizes PART_Content.)

- [ ] **Step 5: Register the kind** in `shape-catalog.ts` so `fromKind('container', …)` builds a `ContainerFigure`. Read how `SHAPE_CATALOG_MAP` entries construct a Figure; a container is not a silhouette shape, so `fromKind` must branch to `new ContainerFigure()` for `'container'` (add a small special-case in `Figure.fromKind` or a catalog entry whose factory returns a `ContainerFigure`). Keep the box rectangular (no `_shape`), sized to `options.width/height`.

- [ ] **Step 6: Run tests + full suite; commit** "feat(diagram): ContainerFigure with inner clipped child host + 'container' kind".

---

### Task 5: `ContainerPlacement` collaborator (re-parent + deferred attach)

**Files:**
- Create: `src/framework/diagram/collaborators/container-placement.ts`
- Modify: `src/framework/diagram/diagram.ts` (construct it, like `new SelectionBoundsTracker(this)` at line ~1202)
- Test: `src/framework/diagram/tests/container-placement.test.ts`

**Interfaces:**
- Consumes: the Diagram's `AddContainerBoundListener((container: Figure, item: unknown) => void)` (diagram.ts:1058); `Diagram.Generator.ContainerFromItem`; `Figure.ParentId` (Task 1), `Figure.ContainerParent` (Task 3), `ContainerFigure.ChildHost` (Task 4); `Panel.AddChild/RemoveChild`; `toParentSpace`/`diagramSpaceRect` (Task 2).
- Produces: `class ContainerPlacement { constructor(diagram); reparent(node: Figure, parentId: string | undefined): void }` — placing a node under `parentId`'s container (or root), keeping the visual, `ContainerParent` link, `ParentId`, and local `Left/Top` consistent.

Behavior:
- On `ContainerBound(container, item)`: resolve the node Figure (`container`), read its `ParentId`; if set, `place(node)` — find the parent `ContainerFigure` by id (via a map it maintains of id→ContainerFigure as containers bind); if the parent isn't bound yet, enqueue `node` and flush the queue whenever a container binds.
- `place(node)`: if target is root → ensure the node's Visual is a child of the figures-layer; else `RemoveChild` from current host, convert `Left/Top` via `toParentSpace(diagramSpaceRect(node) top-left, target)`, set `node.ContainerParent = target`, `target.ChildHost.AddChild(node)`.
- `reparent(node, parentId)`: set `node.ParentId = parentId` then `place(node)`; used by drag-in/out (Task 8) and wrap (Stage 2).
- Cycle/dangling guard: if `parentId` names a missing container or an ancestor of the node, fall back to root and `log`.

- [ ] **Step 1: Write the failing test** (framework integration — realize a container + a child whose ParentId points at it; assert the child's Visual parent becomes the container's ChildHost). Mirror the setup in `tests/container-bound-geometry.test.ts` (Diagram + PaginatedCanvas/ItemsPanel + ItemsSource) and `tests/selection-bounds-vm.test.ts`:

```ts
// Pseudocode-accurate shape; fill exact imports from container-bound-geometry.test.ts.
test('a node whose ParentId names a bound container is re-parented into its ChildHost', () => {
    // build Diagram with ItemsPanel; add a ContainerFigure (id 'C') and a child Figure (id 'n1').
    // set child.ParentId = 'C' via the NodeVisualStore apply path (or directly for the unit).
    // measure/arrange so realization + ContainerBound fire.
    // assert: child.GetVisualParent() === container.ChildHost
    // assert: child.ContainerParent === container
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement `container-placement.ts`** per the behavior above. Read `collaborators/selection-bounds-tracker.ts` for the collaborator shape (ctor takes the diagram, subscribes, holds no domain state) and `figure.ts` for `GetVisualParent`. Use a named interface for any Diagram internals you must reach (`Generator`, figures-layer host) rather than bracket access.

- [ ] **Step 4: Wire it** in `diagram.ts` next to `new SelectionBoundsTracker(this)`: `new ContainerPlacement(this)`. Keep a reference if the drag path (Task 8) needs to call `reparent`.

- [ ] **Step 5: Run tests + full suite; commit** "feat(diagram): ContainerPlacement re-parents nested nodes into their container host".

---

### Task 6: Connector routing through `diagramSpaceRect`

**Files:**
- Modify: `src/framework/diagram/connector.ts` (`nodeRect()` at line ~1620)
- Test: `src/framework/diagram/tests/connector-nested.test.ts`

**Interfaces:**
- Consumes: `diagramSpaceRect` (Task 2), `Figure.ContainerParent` (Task 3).
- Produces: `nodeRect()` returns the node's diagram-space rect (nesting-aware).

- [ ] **Step 1: Write the failing test** — a connector between a nested child and a root node routes to the child's *diagram-space* rect, not its local `Left/Top`. Mirror an existing connector test's harness (`tests/connector-vm-container.test.ts`). Assert the source/target rects used for routing equal `diagramSpaceRect(child)` (e.g., inspect the connector's resolved endpoint or the route's first/last point).

- [ ] **Step 2: Run it, verify it fails** (routes to local coords).

- [ ] **Step 3: Implement.** In `nodeRect()`, when the node is a `Figure` with a `ContainerParent`, return `diagramSpaceRect(node)`; keep the existing `Left/Top` fast-path for root nodes and the `ArrangedRect` fallback for non-Figure endpoints. Duck-type via a named interface (`{ Left; Top; Width; Height; ContainerParent? }`), not `instanceof` if the file avoids the Figure import — confirm the existing import graph.

- [ ] **Step 4: Run it, verify it passes; run the connector test group** (`connector-*.test.ts`) for regressions.

- [ ] **Step 5: Commit** "fix(diagram): connectors route to nested nodes' diagram-space rect".

---

### Task 7: Selection adorner bounds through `diagramSpaceRect`

**Files:**
- Modify: `src/framework/diagram/collaborators/selection-bounds-tracker.ts`
- Test: `src/framework/diagram/tests/selection-bounds-nested.test.ts`

**Interfaces:**
- Consumes: `diagramSpaceRect` (Task 2).
- Produces: `SelectionBoundsTracker` computes each selected node's contribution to the union via `diagramSpaceRect` so a nested node's adorner lands correctly.

- [ ] **Step 1: Write the failing test** — mirror `tests/selection-bounds-vm.test.ts`: select a nested child; assert the tracker's derived bounds (Left/Top/Width/Height DPs) equal `diagramSpaceRect(child)`, not the child's local rect.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement** — in the tracker's per-node bounds read, replace the raw `Left/Top/Width/Height` read with `diagramSpaceRect(node)` when the node exposes a `ContainerParent`; keep the plain read for root nodes.

- [ ] **Step 4: Run it, verify it passes; run selection tests for regressions.**

- [ ] **Step 5: Commit** "fix(diagram): selection bounds use diagram-space rect for nested nodes".

---

### Task 8: Drag-in / drag-out + no double-move of descendants

**Files:**
- Modify: `src/framework/diagram/figure.ts` (`OnPointerUp` reparent hit-test; drag-partner collection skips container descendants)
- Modify: `src/framework/diagram/diagram.ts` if the hit-test needs the container registry from `ContainerPlacement`
- Test: `src/framework/diagram/tests/container-drag.test.ts`

**Interfaces:**
- Consumes: `ContainerPlacement.reparent` (Task 5), `diagramSpaceRect`/`toParentSpace` (Task 2), the existing drag path (`OnPointerDown` partner collection ~figure.ts:870, `OnPointerMove` ~1005, `OnPointerUp`).
- Produces: on drop, a Figure whose diagram-space center lands inside a `ContainerFigure` (topmost, excluding self + own descendants) is re-parented into it; if its center leaves its current container it un-nests to that container's parent/root.

- [ ] **Step 1: Write the failing test** — simulate a drag: place a `ContainerFigure` and a root Figure; move the Figure so its center is inside the container; fire the pointer-up path; assert `figure.ParentId === container.Id`, `figure.ContainerParent === container`, and the Figure's Visual parent is `container.ChildHost`, and its screen (`diagramSpaceRect`) position is unchanged across the reparent. Then drag it back out and assert it returns to root.

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement.** In `OnPointerUp` (after a move completes), compute the dragged Figure's diagram-space center, ask the container registry (from `ContainerPlacement`) for the topmost `ContainerFigure` containing that point excluding `this` and any descendant of `this`; if it differs from the current `ContainerParent`, call `placement.reparent(this, target?.Id)`. In the drag-partner collection (`OnPointerDown`), skip any Figure that is a descendant of `this` (a moved container already moves its subtree via the visual tree — see spec §5) to avoid double-move.

- [ ] **Step 4: Run it, verify it passes; run drag/figure tests for regressions.**

- [ ] **Step 5: Commit** "feat(diagram): drag a node into/out of a container to (un)nest it".

---

### Task 9: `'container'` node serializer + parentId round-trip

**Files:**
- Modify: `src/framework/diagram/node-serializers-default.ts` (register `'container'`, near the `'shape'`/`'text'` registrations at lines 116/188/221)
- Test: `src/framework/diagram/tests/container-serialize.test.ts`

**Interfaces:**
- Consumes: `registerNodeSerializer` (node-serialization.ts:64); `ContainerFigure` (Task 4); `NodeVisual.parentId` (Task 1).
- Produces: a `'container'` serializer (`matches: n instanceof ContainerFigure`, `serialize: () => ({})` content-empty like `'arch'`/`'text'` since box + title + card style ride the node record/visuals, `deserialize: () => new ContainerFigure()`); a full save→load round-trip that reconstructs a container + its child (via `parentId`) with the child re-parented into the container's host.

- [ ] **Step 1: Write the failing test** — mirror `tests/container-bound-geometry.test.ts`'s document serialize/deserialize: build a doc with a `ContainerFigure` (id 'C') + a child (`ParentId='C'`), serialize to the two-section form, deserialize into a fresh Diagram, run measure/arrange, and assert the child ends up in the container's `ChildHost` with `ContainerParent === container` (proving `parentId` + deferred attach survive a round-trip regardless of node order).

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement** — register the `'container'` serializer; confirm the deserialize/`ContainerBound`/`ContainerPlacement` flush order re-parents children after all nodes exist (Task 5 already handles deferred attach; this test guards it end-to-end).

- [ ] **Step 4: Run it, verify it passes; run the full suite.**

- [ ] **Step 5: Commit** "feat(diagram): serialize container nodes + parentId membership round-trip".

---

## Self-Review

**Spec coverage (Stage 1 rows):** §1 parentId/flat data → Task 1; §2 ContainerFigure/inner host/title → Task 4; §3 placement collaborator/deferred attach/reparent → Task 5; §4 diagramSpaceRect + connector + adorner consumers → Tasks 2,6,7; §5 drag-in/out + no double-move → Task 8; §6 drop-empty (kind) → Task 4 (wrap/unwrap is Stage 2); §8 serialization → Tasks 1,9; §9 connectors positionally correct (static) → Task 6. Container `ContainerParent`/`ContentOrigin` seam → Task 3. Stage-1 connector re-route on ancestor move is explicitly Stage 3 (not in this plan) — consistent with the spec.

**Placeholder scan:** Two spots defer exact syntax to "confirm against the real file" (the `.mu` template bindings in Task 4; the `Point.Zero` check in Task 3) — these are grounding directions to match verified patterns, not logic gaps; every code step carries real code. No "TBD"/"handle edge cases"/"similar to Task N".

**Type consistency:** `ParentId: string | undefined` (Task 1), `ContainerParent: Figure | undefined` + `ContentOrigin: Point` (Task 3), `ChildHost: Panel | undefined` + `ContentOrigin` override (Task 4), `diagramSpaceRect(SpatialNode): Rect` / `toParentSpace(Point, ContainerLike): Point` (Task 2), `ContainerPlacement.reparent(node, parentId)` (Task 5) — names/types used consistently in Tasks 6/7/8/9.

**Known follow-ups for the executor to verify against live code (not blockers):** exact `diagram.template.mu` binding syntax and how PART sizing subtracts insets; whether `Figure.fromKind` special-cases `'container'` or a catalog factory returns the subclass; the precise figures-layer host handle inside `ContainerPlacement`; `Point.Zero` availability.
