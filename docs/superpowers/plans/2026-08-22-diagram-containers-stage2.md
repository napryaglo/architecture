# Diagram Containers — Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the gesture + polish layer on top of Stage 1's nesting core — Wrap/Unwrap commands, orphan re-homing when a container leaves the scene (covers both explicit delete and unwrap, a data-loss guard), a live candidate-container highlight during drag, optional auto-grow-to-fit on drop, and edge-case hardening (self/descendant drop rejection, empty/underfull wrap).

**Architecture:** Wrap/Unwrap follow the existing **event-command** shape used by Group/Ungroup: a `RelayCommand` fires a Diagram event, a consumer-side `DiagramMutator` listener (the `DiagramDocument`) performs the mutation. Wrap is a pure document mutation (create a `ContainerFigure` sized to the selection, claim the selected nodes via `parentId` + parent-relative coords); the visual re-parent then happens through the Stage-1 `ContainerPlacement.placeAll()` RESTORE pass when the new container realizes (`_fireContainerBound` fires for every `MuralBase` node, self-containers included). Unwrap and delete share **one** new primitive: `ContainerPlacement.reHome(container)` moves each realized child out to the container's own parent (or root) via the already-tested `reparent` (MOVE, preserves on-screen position, live visual detach), then the document removes the container node. The candidate highlight is a boolean `IsDropCandidate` DP on `ContainerFigure` driven by a Style trigger, toggled from the drag path through the placement collaborator. Auto-grow-to-fit grows (never shrinks) a container inside `reparent` when a dropped child would overflow its child region.

**Tech Stack:** TypeScript, Mural framework (`src/framework/diagram`), node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-08-22-diagram-containers-design.md` (read Sections 5–8 + Staging → "Stage 2 — Gestures & polish"; this plan implements that stage). Stage 1 plan (context): `docs/superpowers/plans/2026-08-22-diagram-containers-stage1.md`.

## Global Constraints

- Every control MUST have a default Style; no `Application.ResolveDefaultResource(stringKey)` / string-key template lookups. A control's template is a `ControlTemplate` on its default Style block in a `*.template.mu`, resolved via `applyDefaultStyle()` (see `Mural/CLAUDE.md`).
- Fixed sets of named values are real TypeScript `enum`s, PascalCase members with explicit string values — never string-literal unions or bare literals at use sites.
- Every test file lives in a `tests/` subfolder next to the code it exercises (`src/framework/diagram/tests/…`).
- Cross-class internals: prefer public API / subclassing; if you must reach in, declare a named interface and cast through it — never bracket access. (Applies to the `figure.ts → selector.ContainerPlacement` duck-type already established in Stage 1 as `ContainerPlacementLike`.)
- Run a single test file with: `npx tsx --conditions=development --test src/framework/diagram/tests/<file>.test.ts`. Full suite: `npm test` (runs `build:templates` first — required after any `.mu` edit; a single-file run does NOT rebuild templates, so after editing `diagram.template.mu` run `npx tsx src/tooling/build-control-templates.ts` before template-dependent single-file tests).
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT run the Plexus app or touch the corpus at `C:/Users/Eugene/Projects/plexus_tests`; Stage 2 is Mural-only, headless + framework-integration tests.

## Grounding (verified 2026-08-22, post-Stage-1)

- **Group/Ungroup are event-commands, not ICommand classes.** `commands/group-ops.ts` defines `GroupRequestedArgs { Items }` / `UngroupRequestedArgs { Groups }` + listener types + selection helpers (`selectedTopLevel`, `selectedTopLevelGroups`). `collaborators/diagram-commands.ts:104-121` installs `RelayCommand`s under `Diagram.GroupCommandKey` / `Diagram.UngroupCommandKey` that call `this._diagram._fireGroupRequested(...)`. `diagram.ts:856-894` holds the listener sets, `Add/Remove…Listener`, and `_fireGroupRequested`/`_fireUngroupRequested`. `behaviors/attach-standard-mutations.ts:25` is the `DiagramMutator` interface; `:82-83` are `onGroup`/`onUngroup` (`args => mutator.Group(args.Items)`); `:124-125` add the listeners; teardown at `:132`. The actual mutation is `DiagramDocument.Group` (`diagram-document.ts:844`) / `Ungroup` (`:878`).
- **DiagramDocument internals:** `Nodes: ObservableCollection<Figure|Group|NodeViewModel>` (`.Add`, `.Insert(i,x)`, `.IndexOf`, `.RemoveAt(i)`, `.Count`, `.Get(i)`). `private _nextId = 1` (id form `'n' + this._nextId++`). `private _markDirty()` (`:412`). `private _topLevel(items): (Figure|Group|NodeViewModel)[]` (`:1178`). `DeleteNodes(items)` (`:708`) detaches group membership + `Nodes.RemoveAt` + cascades connectors. `private _boundView: Diagram | undefined` (`:301`) — the live view; `Diagram.ContainerPlacement` is public.
- **ContainerPlacement (`collaborators/container-placement.ts`):** `reparent(node, parentId)` (MOVE, preserves diagram-space position, `_detach` via `RemoveVisualChild` then `AddVisualChild` to the target's `ChildHost` / `_rootHost`, handles `parentId===undefined` → root). `containerAt(point, exclude?)` (innermost, excludes `exclude` + its descendants — the cycle guard). `placeAll()` (RESTORE). Private: `_containers: Map<string, ContainerFigure>`, `_rootHost`, `_isDescendant`, `_realizedNodes()` generator, `_detach`. Constructed in `Diagram` ctor; exposed as `Diagram.ContainerPlacement`.
- **ContainerFigure (`container-figure.ts`):** `ChildHost: Panel | undefined`, `ContentOrigin: Point` = `new Point(CONTAINER_PADDING, CONTAINER_TITLE_BAND + CONTAINER_PADDING)` = `(8, 32)`. Constants `CONTAINER_TITLE_BAND=24`, `CONTAINER_PADDING=8`, `CONTAINER_DEFAULT_W=220`, `CONTAINER_DEFAULT_H=160`. `registerFigureKind('container', …)` so `Figure.fromKind('container', l, t, {width,height})` mints one.
- **Coordinate helpers (`coordinate-space.ts`):** `diagramSpaceRect(node): Rect`, `toParentSpace(point: Point, container: ContainerLike): Point`.
- **Drag path (`figure.ts`):** `OnPointerDown` pops a nested node to root (`placementOf(selector)?.reparent(this, undefined)`) then collects drag partners (skipping `Figure.isNestedUnder` descendants). `OnPointerMove` → `moveSelfToCursor`. `OnPointerUp` (when a drag occurred, ~`:1203-1217`): centre = `new Point(this.Left + this.Width/2, this.Top + this.Height/2)`, `placement.containerAt(centre, this)`, `placement.reparent(this, target?.Id)`. Duck-type is `interface ContainerPlacementLike { reparent(...); containerAt(...): { Id?: string } | undefined }` (`:143-147`) resolved by `placementOf(selector)` (`:148-151`).
- **Highlight precedent:** `Group.IsSelected` (`group.ts:60-61`) is a boolean DP that a Style trigger in `diagram.template.mu` renders as a dashed border. There is no existing `IsDropTarget` DP — this plan adds `IsDropCandidate` in that image.
- **ContainerFigure template (`diagram.template.mu:56-68`):** `Template x:key="DefaultContainerFigure" [TargetType=ContainerFigure]` = outer `Border [Fill=$$Fill, Stroke=$$Stroke]` → `Canvas` → `Border x:name="PART_LabelHost" [Width=$$Width, Height=24]` + `Canvas x:name="PART_ChildContainer" [Canvas.Left=8, Canvas.Top=32, Width=$$Width, Height=$$Height, ClipToBounds=true]`; plus `Style [TargetType=ContainerFigure] { Template = @DefaultContainerFigure; }`.

## File Structure

- `src/framework/diagram/commands/container-ops.ts` — CREATE: pure selection + geometry helpers for wrap/unwrap (`wrapTargets`, `selectedContainers`, `containerGeometryFor`) + the `WrapRequestedArgs`/`UnwrapRequestedArgs` event-arg + listener types. Mirrors `group-ops.ts`. No framework/Diagram import (imports only `Figure`, `ContainerFigure`, `coordinate-space`, primitives).
- `src/framework/diagram/diagram-document.ts` — MODIFY: add `WrapInContainer(items)` + `UnwrapContainer(items)`; teach `DeleteNodes` to re-home a removed container's children.
- `src/framework/diagram/collaborators/container-placement.ts` — MODIFY: add `reHome(container)`, the candidate-highlight methods (`highlightCandidate`/`clearCandidate`), and `_growToFit` (called inside `reparent`).
- `src/framework/diagram/container-figure.ts` — MODIFY: add the `IsDropCandidate` boolean DP.
- `src/framework/diagram/diagram.template.mu` — MODIFY: a Style trigger on `ContainerFigure` that renders the drop-candidate highlight when `IsDropCandidate` is true.
- `src/framework/diagram/diagram.ts` — MODIFY: `WrapInContainerCommandKey`/`UnwrapContainerCommandKey`, listener sets, `Add/Remove…Listener`, `_fireWrapRequested`/`_fireUnwrapRequested`.
- `src/framework/diagram/collaborators/diagram-commands.ts` — MODIFY: install the two `RelayCommand`s.
- `src/framework/diagram/behaviors/attach-standard-mutations.ts` — MODIFY: extend `DiagramMutator` with `WrapInContainer`/`UnwrapContainer`; wire `onWrap`/`onUnwrap`.
- `src/framework/diagram/figure.ts` — MODIFY: extend `ContainerPlacementLike` with the highlight methods; call them from `OnPointerMove`/`OnPointerUp`.
- Tests: co-located `tests/*.test.ts` per task.

---

### Task 1: `container-ops.ts` — pure selection + geometry helpers

**Files:**
- Create: `src/framework/diagram/commands/container-ops.ts`
- Test: `src/framework/diagram/tests/container-ops.test.ts`

**Interfaces:**
- Consumes: `Figure` (`ContainerParent`, `Left/Top/Width/Height`, `Id`), `ContainerFigure` (`instanceof`, `ContentOrigin`, constants), `diagramSpaceRect` (Task provides at runtime — already exists).
- Produces:
  - `interface ContainerBox { left: number; top: number; width: number; height: number; }`
  - `wrapTargets(items: readonly unknown[]): Figure[]` — the top-level (root, `ContainerParent === undefined`) `Figure`s in the selection; the set a wrap will enclose.
  - `selectedContainers(items: readonly unknown[]): ContainerFigure[]` — the `ContainerFigure`s in the selection; the set an unwrap will dissolve.
  - `containerGeometryFor(nodes: readonly Figure[]): ContainerBox` — a box (diagram-space) enclosing the union of the nodes' `diagramSpaceRect`, inset so the nodes sit `CONTAINER_PADDING` inside the child region below the title band.
  - `WrapRequestedArgs { readonly Items: readonly MuralBase[]; }`, `UnwrapRequestedArgs { readonly Containers: readonly MuralBase[]; }`, `WrapRequestedListener`, `UnwrapRequestedListener`.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { ContainerFigure, CONTAINER_PADDING, CONTAINER_TITLE_BAND } from '../container-figure.js';
import { wrapTargets, selectedContainers, containerGeometryFor } from '../commands/container-ops.js';

function app(): void { Application.current = null; new Application(); }
function rect(l: number, t: number, w = 40, h = 30): Figure { return Figure.fromKind('rectangle', l, t, { width: w, height: h }); }

test('wrapTargets keeps top-level Figures, drops nested and non-Figures', () => {
    app();
    const a = rect(10, 10);
    const b = rect(100, 10);
    const nested = rect(5, 5); (nested as unknown as { ContainerParent: unknown }).ContainerParent = a; // simulate nested
    const targets = wrapTargets([a, b, nested, { notAFigure: true }]);
    assert.deepEqual(targets, [a, b]);
});

test('selectedContainers keeps only ContainerFigures', () => {
    app();
    const c = Figure.fromKind('container', 0, 0) as ContainerFigure;
    const r = rect(0, 0);
    assert.deepEqual(selectedContainers([r, c]), [c]);
});

test('containerGeometryFor encloses the union inset below the title band', () => {
    app();
    // two root nodes: union = (10,10)..(140,40) → w=130, h=30.
    const a = rect(10, 10, 40, 30);   // 10..50 x 10..40
    const b = rect(100, 20, 40, 20);  // 100..140 x 20..40
    const box = containerGeometryFor([a, b]);
    // left = unionX - ContentOrigin.X - PAD = 10 - 8 - 8 = -6
    // top  = unionY - ContentOrigin.Y - PAD = 10 - 32 - 8 = -30
    // width  = unionW + ContentOrigin.X + 2*PAD = 130 + 8 + 16 = 154
    // height = unionH + ContentOrigin.Y + 2*PAD = 30 + 32 + 16 = 78
    assert.deepEqual([box.left, box.top, box.width, box.height], [-6, -30, 154, 78]);
    // sanity: the origin constants are the ones we reasoned from.
    assert.equal(CONTAINER_PADDING, 8);
    assert.equal(CONTAINER_TITLE_BAND, 24);
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx tsx --conditions=development --test src/framework/diagram/tests/container-ops.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `container-ops.ts`:**

```ts
import type { MuralBase } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { ContainerFigure, CONTAINER_PADDING } from '../container-figure.js';
import { diagramSpaceRect } from '../coordinate-space.js';

// The diagram-space box a wrap will give its new container.
export interface ContainerBox { left: number; top: number; width: number; height: number; }

// Event args for the Diagram's WrapRequested / UnwrapRequested events (mirrors
// group-ops.ts). Wrap.Items: the top-level nodes to enclose. Unwrap.Containers:
// the containers to dissolve.
export interface WrapRequestedArgs   { readonly Items:      readonly MuralBase[]; }
export interface UnwrapRequestedArgs { readonly Containers: readonly MuralBase[]; }
export type WrapRequestedListener   = (args: WrapRequestedArgs)   => void;
export type UnwrapRequestedListener = (args: UnwrapRequestedArgs) => void;

// The top-level Figures in a selection — the set a wrap encloses. A node already
// nested in a container (ContainerParent set) is skipped: wrapping re-parents a
// root node, and mixing frames would corrupt coordinates.
export function wrapTargets(items: readonly unknown[]): Figure[]
{
    const out: Figure[] = [];
    for (const it of items)
        if (it instanceof Figure && it.ContainerParent === undefined) out.push(it);
    return out;
}

// The ContainerFigures in a selection — the set an unwrap dissolves.
export function selectedContainers(items: readonly unknown[]): ContainerFigure[]
{
    const out: ContainerFigure[] = [];
    for (const it of items) if (it instanceof ContainerFigure) out.push(it);
    return out;
}

// A diagram-space box enclosing the union of the nodes, inset so each node sits
// CONTAINER_PADDING inside the child region (which itself begins at ContentOrigin
// below the title band). The container's ContentOrigin is a constant, so this is
// pure geometry — no realized container needed.
export function containerGeometryFor(nodes: readonly Figure[]): ContainerBox
{
    let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    for (const n of nodes)
    {
        const r = diagramSpaceRect(n);
        minX = Math.min(minX, r.X);        minY = Math.min(minY, r.Y);
        maxX = Math.max(maxX, r.X + r.Width); maxY = Math.max(maxY, r.Y + r.Height);
    }
    // ContentOrigin of a ContainerFigure is (CONTAINER_PADDING, TITLE_BAND + PADDING).
    const originX = CONTAINER_PADDING;
    const originY = ContainerFigure.prototype.ContentOrigin.Y; // TITLE_BAND + PADDING, single source
    const left = minX - originX - CONTAINER_PADDING;
    const top  = minY - originY - CONTAINER_PADDING;
    return {
        left, top,
        width:  (maxX - minX) + originX + 2 * CONTAINER_PADDING,
        height: (maxY - minY) + originY + 2 * CONTAINER_PADDING,
    };
}
```

Note on `ContainerFigure.prototype.ContentOrigin.Y`: `ContentOrigin` is a getter returning a fresh `Point(CONTAINER_PADDING, CONTAINER_TITLE_BAND + CONTAINER_PADDING)` with no `this` dependency, so reading it off the prototype yields the constant Y (32) without an instance. If the executor finds the getter touches `this`, import `CONTAINER_TITLE_BAND` and compute `CONTAINER_TITLE_BAND + CONTAINER_PADDING` directly instead.

- [ ] **Step 4: Run it, verify it passes.**

- [ ] **Step 5: Commit** — `git add -A && git commit` "feat(diagram): container-ops — wrap/unwrap selection + geometry helpers".

---

### Task 2: `DiagramDocument.WrapInContainer`

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (new public method near `Group` at `:844`)
- Test: `src/framework/diagram/tests/container-wrap.test.ts`

**Interfaces:**
- Consumes: `wrapTargets`, `containerGeometryFor` (Task 1); `Figure.fromKind`; `ContainerFigure`; `toParentSpace`/`diagramSpaceRect`; `this.Nodes`, `this._nextId`, `this._markDirty()`, `this._boundView`.
- Produces: `DiagramDocument.WrapInContainer(items: readonly unknown[]): void` — creates a `ContainerFigure` sized via `containerGeometryFor`, inserts it at the min index of the wrapped nodes, sets each node's `ParentId` to the container's id and converts its `Left/Top` to container-local (so the on-screen position is preserved once the RESTORE pass runs). No-op when fewer than 1 target.

- [ ] **Step 1: Write the failing test** — the data mutation is headless-verifiable; visual attach is exercised by Task 4's integration test and existing placement tests.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { DiagramDocument } from '../diagram-document.js';
import { ContainerFigure } from '../container-figure.js';
import { Figure } from '../figure.js';

function doc(): DiagramDocument { Application.current = null; new Application(); return new DiagramDocument(); }

test('WrapInContainer inserts a container and claims the selection as parent-relative children', () => {
    const d = doc();
    const a = d.CreateNode('rectangle', 10, 10)!;   // 40x30 default? use explicit sizes below if needed
    const b = d.CreateNode('rectangle', 100, 20)!;
    const beforeA = { x: a.Left, y: a.Top };
    const beforeB = { x: b.Left, y: b.Top };
    d.WrapInContainer([a, b]);

    // A container node was inserted.
    const container = [...containerNodes(d)][0];
    assert.ok(container instanceof ContainerFigure, 'a ContainerFigure was created');
    assert.ok(container.Id !== undefined, 'container got an id');

    // Both nodes now name the container as parent.
    assert.equal(a.ParentId, container.Id);
    assert.equal(b.ParentId, container.Id);

    // Their Left/Top are now container-local; diagram-space position is preserved:
    // localLeft + (container.Left + ContentOrigin.X) === original diagram Left.
    assert.equal(a.Left + container.Left + container.ContentOrigin.X, beforeA.x);
    assert.equal(a.Top  + container.Top  + container.ContentOrigin.Y, beforeA.y);
    assert.equal(b.Left + container.Left + container.ContentOrigin.X, beforeB.x);
    assert.equal(b.Top  + container.Top  + container.ContentOrigin.Y, beforeB.y);
});

test('WrapInContainer is a no-op for an empty selection', () => {
    const d = doc();
    const before = d.Nodes.Count;
    d.WrapInContainer([]);
    assert.equal(d.Nodes.Count, before);
});

function* containerNodes(d: DiagramDocument): Iterable<ContainerFigure> {
    for (let i = 0; i < d.Nodes.Count; i++) { const n = d.Nodes.Get(i); if (n instanceof ContainerFigure) yield n; }
}
```

- [ ] **Step 2: Run it, verify it fails** (`WrapInContainer` not a function).

- [ ] **Step 3: Implement** — add to `diagram-document.ts` (imports: `wrapTargets`, `containerGeometryFor` from `./commands/container-ops.js`; `ContainerFigure` from `./container-figure.js`; `toParentSpace`, `diagramSpaceRect` from `./coordinate-space.js`; `Point` from visual-engine if not present):

```ts
// Wrap the current top-level selection in a new ContainerFigure. Data mutation
// only: create the container sized to enclose the selection, claim each node via
// ParentId, and convert each node's Left/Top to container-local so its on-screen
// position is preserved when the RESTORE pass (placeAll, driven by the container's
// ContainerBound on realize) re-parents it into the container's ChildHost.
public WrapInContainer(items: readonly unknown[]): void
{
    const targets = wrapTargets(items);
    if (targets.length < 1) return;
    const box = containerGeometryFor(targets);
    const container = Figure.fromKind('container', box.left, box.top,
                                      { width: box.width, height: box.height }) as ContainerFigure;
    container.Id = 'n' + this._nextId++;

    // Insert behind its future children (min index), like Group.
    let minIdx = this.Nodes.Count;
    for (const t of targets) { const i = this.Nodes.IndexOf(t); if (i >= 0 && i < minIdx) minIdx = i; }
    this.Nodes.Insert(minIdx, container);

    for (const t of targets)
    {
        const abs   = diagramSpaceRect(t);                       // current diagram-space top-left
        const local = toParentSpace(new Point(abs.X, abs.Y), container);
        t.ParentId = container.Id;
        t.Left = local.X;
        t.Top  = local.Y;
    }
    container.IsSelected = true;
    this._markDirty();
    // Re-parent now if the container is already realized; otherwise its
    // ContainerBound (fired on realize) re-runs placeAll and attaches the children.
    this._boundView?.ContainerPlacement.placeAll();
}
```

- [ ] **Step 4: Run it, verify it passes.**

- [ ] **Step 5: Commit** "feat(diagram): WrapInContainer — enclose a selection in a new container".

---

### Task 3: `ContainerPlacement.reHome` + `DeleteNodes` re-homes a removed container's children

**Files:**
- Modify: `src/framework/diagram/collaborators/container-placement.ts` (add `reHome`)
- Modify: `src/framework/diagram/diagram-document.ts` (`DeleteNodes` calls `reHome` for each removed container)
- Test: `src/framework/diagram/tests/container-rehome.test.ts`

**Interfaces:**
- Consumes: `ContainerPlacement.reparent` (Stage 1); `Figure.ContainerParent`, `ContainerFigure.Id`/`ParentId`; `this._realizedNodes()`, `this._containers`.
- Produces: `ContainerPlacement.reHome(container: ContainerFigure): void` — move every realized child of `container` out to the container's own parent (or root), preserving on-screen position, then forget the container. `DeleteNodes` calls it for each removed `ContainerFigure` before the node leaves `Nodes`, so children survive (data-loss guard).

- [ ] **Step 1: Write the failing test** — mirror the realized setup in `tests/container-placement.test.ts` (build a Diagram + ItemsPanel + ItemsSource, add a container + child, `diagram.ContainerPlacement.placeAll()`), then delete the container and assert the child re-homed to root with its screen position intact. Read `tests/container-placement.test.ts` for the exact harness (imports, `mountDiagram`, measure/arrange). Concretely:

```ts
// (imports + harness mirror container-placement.test.ts)
test('deleting a container re-homes its child to root, preserving screen position', () => {
    // build diagram; container 'C' at (100,100) 200x160; child 'n1' local (10,10) with ParentId 'C'.
    // placeAll() → child nested (ContainerParent === C).
    // record screen = diagramSpaceRect(child) before delete.
    // doc.DeleteNodes([C])
    // assert: child.ParentId === undefined; child.ContainerParent === undefined;
    //         child still in doc.Nodes; child.Left/Top === recorded screen X/Y (root space).
});
```

- [ ] **Step 2: Run it, verify it fails** (child left dangling / removed with container).

- [ ] **Step 3a: Implement `reHome`** in `container-placement.ts`:

```ts
// Move every realized child of `container` out to the container's own parent
// (or root), preserving each child's on-screen position (reparent = MOVE), then
// forget the container. Used by unwrap and by container deletion so children are
// never destroyed with their box (data-loss guard). No-op-safe if the container
// has no realized children.
public reHome(container: ContainerFigure): void
{
    const kids: Figure[] = [];
    for (const n of this._realizedNodes()) if (n.ContainerParent === container) kids.push(n);
    for (const child of kids) this.reparent(child, container.ParentId);
    if (container.Id !== undefined) this._containers.delete(container.Id);
}
```

- [ ] **Step 3b: Wire into `DeleteNodes`** (`diagram-document.ts:708`). Before removing each item, if it is a `ContainerFigure`, re-home via the live view. Add at the top of the per-item loop (import `ContainerFigure`):

```ts
    for (const item of items)
    {
        if (item instanceof ContainerFigure)
            this._boundView?.ContainerPlacement.reHome(item);
        // ...existing detach + Nodes.RemoveAt + cascade...
    }
```

If `_boundView` is undefined (headless, container never realized), also clear stale membership so no child dangles: after the loop, for any node whose `ParentId` names a just-removed container id, set `ParentId = undefined`. Add before the cascade:

```ts
    const removedContainerIds = new Set<string>();
    for (const item of items)
        if (item instanceof ContainerFigure && item.Id !== undefined) removedContainerIds.add(item.Id);
    if (removedContainerIds.size > 0)
        for (let i = 0; i < this.Nodes.Count; i++)
        {
            const n = this.Nodes.Get(i);
            if (n instanceof Figure && n.ParentId !== undefined && removedContainerIds.has(n.ParentId))
                n.ParentId = undefined;
        }
```

(The `reHome` call already cleared `ParentId` for realized children via `reparent`; this second sweep is the headless/unrealized safety net and is idempotent.)

- [ ] **Step 4: Run it, verify it passes; run the delete/connector-cascade tests** (`delete-node-connector-cascade.test.ts`, `container-*.test.ts`) for regressions.

- [ ] **Step 5: Commit** "feat(diagram): re-home a container's children when it is deleted (data-loss guard)".

---

### Task 4: `DiagramDocument.UnwrapContainer`

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (new public method near `Ungroup` at `:878`)
- Test: `src/framework/diagram/tests/container-unwrap.test.ts`

**Interfaces:**
- Consumes: `selectedContainers` (Task 1); `reHome` (Task 3, via `_boundView`); `this.Nodes`, `this._markDirty()`.
- Produces: `DiagramDocument.UnwrapContainer(items: readonly unknown[]): void` — for each selected `ContainerFigure`, re-home its children (screen position preserved) then remove the container node. No-op when no container is selected.

- [ ] **Step 1: Write the failing test** — realized setup (mirror Task 3 harness): container + child, `placeAll()`, then `doc.UnwrapContainer([container])`; assert the child survives at root with preserved position and the container node is gone.

```ts
test('UnwrapContainer dissolves the container, its child survives at root', () => {
    // build diagram; container 'C' + child 'n1' (ParentId 'C'); placeAll().
    // screen = diagramSpaceRect(child) before.
    // doc.UnwrapContainer([C])
    // assert: C not in doc.Nodes; child still in doc.Nodes;
    //         child.ParentId === undefined; child.Left/Top === screen X/Y.
});

test('UnwrapContainer is a no-op when no container is selected', () => {
    // select a plain Figure; UnwrapContainer([figure]); assert Nodes.Count unchanged.
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement** — add to `diagram-document.ts` (import `selectedContainers` from `./commands/container-ops.js`):

```ts
// Dissolve the selected containers: re-home each container's children out to its
// own parent/root (preserving screen position — the reHome primitive), then
// remove the container node. Symmetric with Ungroup. Children (and their
// connectors) survive; the container's own connectors cascade away with it.
public UnwrapContainer(items: readonly unknown[]): void
{
    const containers = selectedContainers(items);
    if (containers.length === 0) return;
    for (const container of containers)
    {
        this._boundView?.ContainerPlacement.reHome(container);
        const idx = this.Nodes.IndexOf(container);
        if (idx >= 0) this.Nodes.RemoveAt(idx);
    }
    this._cascadeRemoveConnectorsFor(containers);
    this.Status = `Unwrapped ${containers.length} container${containers.length === 1 ? '' : 's'}.`;
    this._markDirty();
}
```

(Confirm `_cascadeRemoveConnectorsFor(items: readonly unknown[])` and `Status` exist — both are used by `Ungroup`/`DeleteNodes` in the same file. If `reHome` already handles the child-membership sweep for the headless case, the unwrap path inherits the Task 3 safety net only through `DeleteNodes`; since `UnwrapContainer` removes via `Nodes.RemoveAt` directly, add the same headless `ParentId`-clear guard here if `_boundView` is undefined: clear `ParentId` on any node naming a removed container id — copy the sweep from Task 3.)

- [ ] **Step 4: Run it, verify it passes; run the full container test group.**

- [ ] **Step 5: Commit** "feat(diagram): UnwrapContainer — dissolve a container, keep its children".

---

### Task 5: Wrap/Unwrap commands (Diagram events + RelayCommands + mutator wiring)

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (command keys, listener sets, `Add/Remove…Listener`, `_fire…`)
- Modify: `src/framework/diagram/collaborators/diagram-commands.ts` (install the two RelayCommands)
- Modify: `src/framework/diagram/behaviors/attach-standard-mutations.ts` (`DiagramMutator` + `onWrap`/`onUnwrap` wiring)
- Test: `src/framework/diagram/tests/container-commands.test.ts`

**Interfaces:**
- Consumes: `WrapRequestedArgs`/`UnwrapRequestedArgs`/listeners + `wrapTargets`/`selectedContainers` (Task 1); `DiagramDocument.WrapInContainer`/`UnwrapContainer` (Tasks 2, 4); `RelayCommand`; the Group/Ungroup command scaffolding it mirrors.
- Produces: `Diagram.WrapInContainerCommandKey`/`UnwrapContainerCommandKey` (RelayCommands); `Add/RemoveWrapRequestedListener`, `Add/RemoveUnwrapRequestedListener`, `_fireWrapRequested`, `_fireUnwrapRequested`; `DiagramMutator.WrapInContainer(items)` / `UnwrapContainer(items)`. Wrap enabled when `wrapTargets(SelectedItems).length >= 1`; Unwrap enabled when `selectedContainers(SelectedItems).length >= 1`.

- [ ] **Step 1: Write the failing test** — mirror `tests/diagram-group-commands.test.ts` (fire the command, capture the event args):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
// (harness imports mirror diagram-group-commands.test.ts)

test('WrapInContainerCommand fires WrapRequested with the top-level selection', () => {
    // build a diagram with two selected root Figures.
    const requests: readonly unknown[][] = [];
    diagram.AddWrapRequestedListener(args => requests.push(args.Items));
    assert.equal(diagram.WrapInContainerCommand!.CanExecute(undefined), true);
    diagram.WrapInContainerCommand!.Execute(undefined);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.length, 2);
});

test('UnwrapContainerCommand CanExecute is false without a selected container', () => {
    // selection = one plain Figure.
    assert.equal(diagram.UnwrapContainerCommand!.CanExecute(undefined), false);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3a: Diagram plumbing** (`diagram.ts`) — mirror the Group block at `:856-894`. Add command keys near `GroupCommandKey` (search it), listener sets near `_groupRequestedListeners`, and the fire/subscribe methods near `_fireGroupRequested`:

```ts
// (near GroupCommandKey)
public static readonly WrapInContainerCommandKey  = MuralBase.RegisterProperty<ICommand | undefined>(Diagram, 'WrapInContainerCommand',  undefined, MetaData.None);
public static readonly UnwrapContainerCommandKey  = MuralBase.RegisterProperty<ICommand | undefined>(Diagram, 'UnwrapContainerCommand',  undefined, MetaData.None);
public get WrapInContainerCommand(): ICommand | undefined { return this.get_property_value(Diagram.WrapInContainerCommandKey); }
public get UnwrapContainerCommand(): ICommand | undefined { return this.get_property_value(Diagram.UnwrapContainerCommandKey); }

// (near _groupRequestedListeners)
private readonly _wrapRequestedListeners:   Set<WrapRequestedListener>   = new Set();
private readonly _unwrapRequestedListeners: Set<UnwrapRequestedListener> = new Set();
public AddWrapRequestedListener   (l: WrapRequestedListener):   void { this._wrapRequestedListeners.add(l); }
public RemoveWrapRequestedListener(l: WrapRequestedListener):   void { this._wrapRequestedListeners.delete(l); }
public AddUnwrapRequestedListener   (l: UnwrapRequestedListener): void { this._unwrapRequestedListeners.add(l); }
public RemoveUnwrapRequestedListener(l: UnwrapRequestedListener): void { this._unwrapRequestedListeners.delete(l); }
/** @internal */ public _fireWrapRequested  (args: WrapRequestedArgs):   void { for (const l of [...this._wrapRequestedListeners])   l(args); }
/** @internal */ public _fireUnwrapRequested(args: UnwrapRequestedArgs): void { for (const l of [...this._unwrapRequestedListeners]) l(args); }
```

Import `WrapRequestedArgs, WrapRequestedListener, UnwrapRequestedArgs, UnwrapRequestedListener` from `./commands/container-ops.js` (match the `type`-import style used for `GroupRequestedArgs` at `diagram.ts:39`). Confirm the exact `RegisterProperty`/`ICommand`/`MetaData` symbols against the Group command-key declaration (copy its form verbatim — it may live via `diagram-commands.ts` rather than a DP; if Group's keys are declared there, declare Wrap/Unwrap keys in the same place and mirror precisely).

- [ ] **Step 3b: Install the RelayCommands** (`collaborators/diagram-commands.ts`, mirror `_installGroupCommands` at `:104-121`):

```ts
import { wrapTargets, selectedContainers } from '../commands/container-ops.js';
// ...inside the install routine (or a new _installContainerCommands called alongside _installGroupCommands):
const canWrap   = (): boolean => wrapTargets(this._diagram.SelectedItems).length >= 1;
const canUnwrap = (): boolean => selectedContainers(this._diagram.SelectedItems).length >= 1;
this._install(Diagram.WrapInContainerCommandKey, 'WrapInContainer',
    new RelayCommand(
        () => this._diagram._fireWrapRequested({ Items: wrapTargets(this._diagram.SelectedItems) }),
        canWrap,
        { Text: 'Wrap in container', Description: 'Enclose the current top-level selection in a new container.' }));
this._install(Diagram.UnwrapContainerCommandKey, 'UnwrapContainer',
    new RelayCommand(
        () => this._diagram._fireUnwrapRequested({ Containers: selectedContainers(this._diagram.SelectedItems) }),
        canUnwrap,
        { Text: 'Unwrap container', Description: 'Dissolve the selected container(s), keeping their contents.' }));
```

`wrapTargets`/`selectedContainers` take `readonly unknown[]`; `RelayCommand({ Items })` casts to `MuralBase[]` as Group does — match Group's exact cast/typing. If `_install`'s signature differs, mirror the Group calls precisely.

- [ ] **Step 3c: Mutator wiring** (`behaviors/attach-standard-mutations.ts`). Extend the interface (near `:29`):

```ts
    WrapInContainer(items: readonly unknown[]): void;
    UnwrapContainer(items: readonly unknown[]): void;
```

Add handlers (near `:82`) and subscriptions (near `:124`) + teardown (near `:132`):

```ts
import type { WrapRequestedArgs, UnwrapRequestedArgs } from '../commands/container-ops.js';
const onWrap   = (args: WrapRequestedArgs):   void => mutator.WrapInContainer(args.Items);
const onUnwrap = (args: UnwrapRequestedArgs): void => mutator.UnwrapContainer(args.Containers);
// ...
diagram.AddWrapRequestedListener(onWrap);
diagram.AddUnwrapRequestedListener(onUnwrap);
// ...teardown:
diagram.RemoveWrapRequestedListener(onWrap);
diagram.RemoveUnwrapRequestedListener(onUnwrap);
```

`DiagramDocument` already provides `WrapInContainer`/`UnwrapContainer` (Tasks 2, 4), so it satisfies the widened `DiagramMutator`. Update the two test doubles that implement `DiagramMutator` inline — `toolbox/tests/drop-routing.test.ts:13` and `toolbox/tests/shape-resolver-factory.test.ts:24-25` — to add `WrapInContainer(){}, UnwrapContainer(){}` so they still typecheck.

- [ ] **Step 4: Run it, verify it passes; run `diagram-group-commands.test.ts` + the toolbox tests** for regressions; run `npm run typecheck` (or the project's typecheck script) to catch the `DiagramMutator` doubles.

- [ ] **Step 5: Commit** "feat(diagram): Wrap/Unwrap container commands wired end-to-end".

---

### Task 6: Candidate-container highlight during drag

**Files:**
- Modify: `src/framework/diagram/container-figure.ts` (add `IsDropCandidate` DP)
- Modify: `src/framework/diagram/diagram.template.mu` (Style trigger renders the highlight)
- Modify: `src/framework/diagram/collaborators/container-placement.ts` (`highlightCandidate`/`clearCandidate`)
- Modify: `src/framework/diagram/figure.ts` (extend `ContainerPlacementLike`; call from `OnPointerMove`/`OnPointerUp`)
- Test: `src/framework/diagram/tests/container-highlight.test.ts`

**Interfaces:**
- Consumes: `containerAt` (Stage 1); `placementOf(selector)` + `ContainerPlacementLike` (Stage 1, `figure.ts:143-151`).
- Produces: `ContainerFigure.IsDropCandidate: boolean` (DP, default false); `ContainerPlacement.highlightCandidate(point: Point, exclude: Figure): void` and `clearCandidate(): void` (track + toggle a single highlighted container); `ContainerPlacementLike` gains `highlightCandidate`/`clearCandidate`; the drag path highlights the hovered container on move and clears on up.

- [ ] **Step 1: Write the failing test** (placement-level, headless — mirror `tests/container-placement.test.ts` harness):

```ts
test('highlightCandidate marks the hovered container and clears the previous one', () => {
    // realized diagram with two containers C1 @ (0,0) 100x100 and C2 @ (200,0) 100x100; placeAll().
    const dragged = /* a root Figure */;
    diagram.ContainerPlacement.highlightCandidate(new Point(50, 50), dragged);
    assert.equal(c1.IsDropCandidate, true);
    assert.equal(c2.IsDropCandidate, false);
    diagram.ContainerPlacement.highlightCandidate(new Point(250, 50), dragged);
    assert.equal(c1.IsDropCandidate, false, 'previous candidate cleared');
    assert.equal(c2.IsDropCandidate, true);
    diagram.ContainerPlacement.clearCandidate();
    assert.equal(c2.IsDropCandidate, false);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3a: DP on `ContainerFigure`** (`container-figure.ts`) — mirror `Group.IsSelectedKey` (`group.ts:60-61`):

```ts
public static readonly IsDropCandidateKey = MuralBase.RegisterProperty<boolean>(
    ContainerFigure, 'IsDropCandidate', false, MetaData.None);
public get IsDropCandidate(): boolean { return this.get_property_value(ContainerFigure.IsDropCandidateKey); }
public set IsDropCandidate(v: boolean) { this.set_property_value(ContainerFigure.IsDropCandidateKey, v); }
```

Confirm `MuralBase`/`MetaData` imports already present in the file (Stage 1 added `OverrideMetadata` use, so `MuralBase` is imported).

- [ ] **Step 3b: Placement methods** (`container-placement.ts`):

```ts
private _candidate: ContainerFigure | undefined;

// Highlight the container the given diagram-space point would drop into
// (innermost, excluding `exclude` + its descendants), clearing any prior
// highlight. Called on each drag move.
public highlightCandidate(point: Point, exclude: Figure): void
{
    const next = this.containerAt(point, exclude);
    if (next === this._candidate) return;
    if (this._candidate !== undefined) this._candidate.IsDropCandidate = false;
    this._candidate = next;
    if (next !== undefined) next.IsDropCandidate = true;
}

// Drop any active candidate highlight (drag ended / cancelled).
public clearCandidate(): void
{
    if (this._candidate !== undefined) this._candidate.IsDropCandidate = false;
    this._candidate = undefined;
}
```

- [ ] **Step 3c: Style trigger** (`diagram.template.mu`) — add a highlight when `IsDropCandidate` is true, mirroring the `Group` `IsSelected` trigger already in this file (search `IsSelected` to copy its exact `Style`/`Setter`/trigger syntax). Extend the `Style [TargetType = ContainerFigure]` block (`:66`):

```
Style [ TargetType = ContainerFigure ] {
    Template = @DefaultContainerFigure;
    // Drop-candidate affordance: accent the box while a drag hovers it.
    when ($$IsDropCandidate = true) {
        Stroke = @Primary;          // match the exact trigger form used by Group.IsSelected
    }
}
```

Match the real trigger dialect (`when (...)` vs a `Trigger`/`Setter` element) and the accent resource key to what the `IsSelected` trigger uses. After editing, run `npx tsx src/tooling/build-control-templates.ts` before the single-file test.

- [ ] **Step 3d: Drag-path calls** (`figure.ts`). Extend the `ContainerPlacementLike` interface (`:143-147`):

```ts
interface ContainerPlacementLike {
    reparent(node: Figure, parentId: string | undefined): void;
    containerAt(point: Point, exclude?: Figure): { Id?: string } | undefined;
    highlightCandidate(point: Point, exclude: Figure): void;
    clearCandidate(): void;
}
```

In `OnPointerMove`, after `moveSelfToCursor(...)` (~`:1089`), highlight the hovered container (the node was popped to root on pointer-down, so `Left/Top` are diagram-space):

```ts
        placementOf(selector)?.highlightCandidate(
            new Point(this.Left + this.Width / 2, this.Top + this.Height / 2), this);
```

(`selector` is resolved in `OnPointerMove` the same way as in `OnPointerUp`; if it isn't already in scope there, resolve it via `Selector.FromContainer` exactly as `OnPointerUp` does at `:1209`.) In `OnPointerUp`, clear the highlight right before/after the `reparent` (both drag and non-drag exit paths, so the highlight never sticks):

```ts
        placementOf(selector)?.clearCandidate();
```

- [ ] **Step 4: Run it, verify it passes; run the drag test group** (`container-drag.test.ts`, `figure*.test.ts`) for regressions; rebuild templates + run the full suite once (`npm test`) to confirm the `.mu` trigger compiles.

- [ ] **Step 5: Commit** "feat(diagram): highlight the candidate container while dragging a node into it".

---

### Task 7: Auto-grow-to-fit on drop

**Files:**
- Modify: `src/framework/diagram/collaborators/container-placement.ts` (`_growToFit`, called from `reparent`)
- Test: `src/framework/diagram/tests/container-grow.test.ts`

**Interfaces:**
- Consumes: `reparent` (Stage 1); `ContainerFigure.ContentOrigin`, `Width`/`Height`; `CONTAINER_PADDING`.
- Produces: private `ContainerPlacement._growToFit(container: ContainerFigure, child: Figure): void` — grows (never shrinks) the container so `child`'s just-placed local rect + padding fits inside the child region. Invoked at the end of `reparent`'s "into a container" branch.

- [ ] **Step 1: Write the failing test** (realized harness):

```ts
test('dropping a child near the edge grows the container to fit', () => {
    // container C @ (0,0) 120x100; child F 40x40. reparent F into C at a local position
    // that overflows: after reparent, C.Width/Height must cover ContentOrigin + local + size + PAD.
    // Arrange F's pre-drop diagram-space so toParentSpace lands it at local ~ (100, 80).
    diagram.ContainerPlacement.reparent(F, C.Id);
    assert.ok(C.Width  >= C.ContentOrigin.X + F.Left + F.Width  + 8);
    assert.ok(C.Height >= C.ContentOrigin.Y + F.Top  + F.Height + 8);
});

test('dropping a child that already fits does not shrink the container', () => {
    // container C 300x300; small child well inside → C.Width/Height unchanged.
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Implement.** Add `_growToFit` and call it at the end of `reparent`'s parent-set branch (after `host.AddVisualChild(node)` at `:74`), importing `CONTAINER_PADDING` from `../container-figure.js`:

```ts
        host.AddVisualChild(node);
        this._growToFit(target, node);      // <-- new line
    }
    // ...

// Grow (never shrink) `container` so `child`'s just-placed local rect fits inside
// the child region with CONTAINER_PADDING to spare. child.Left/Top are already in
// container-local space at call time.
private _growToFit(container: ContainerFigure, child: Figure): void
{
    const needW = container.ContentOrigin.X + child.Left + child.Width  + CONTAINER_PADDING;
    const needH = container.ContentOrigin.Y + child.Top  + child.Height + CONTAINER_PADDING;
    if (needW > container.Width)  container.Width  = needW;
    if (needH > container.Height) container.Height = needH;
}
```

- [ ] **Step 4: Run it, verify it passes; run the drag + placement test groups** for regressions (the grow must not perturb the drag-in/out screen-position tests).

- [ ] **Step 5: Commit** "feat(diagram): auto-grow a container to fit a dropped child".

---

### Task 8: Edge-case hardening (self/descendant rejection, empty/underfull)

**Files:**
- Test: `src/framework/diagram/tests/container-edge-cases.test.ts` (CREATE — behavior already exists from Stage 1 + earlier tasks; this task pins it with tests and fixes any gap surfaced)
- Modify (only if a test surfaces a gap): `container-placement.ts` / `diagram-document.ts`

**Interfaces:**
- Consumes: `containerAt` cycle guard (Stage 1), `WrapInContainer`/`UnwrapContainer` no-op guards (Tasks 2, 4).
- Produces: regression tests proving the edge cases; a fix only if a test fails.

- [ ] **Step 1: Write the tests:**

```ts
test('containerAt rejects the dragged node itself and its own descendants (no cycle)', () => {
    // realized: outer container O, inner container I nested in O, both realized.
    // dragging O: containerAt(point-inside-I, exclude=O) must NOT return I (I is O's descendant).
    const hit = diagram.ContainerPlacement.containerAt(pointInsideI, O);
    assert.notEqual(hit, I);
    assert.notEqual(hit, O);
});

test('WrapInContainer no-ops on empty selection; UnwrapContainer no-ops without a container', () => {
    const before = doc.Nodes.Count;
    doc.WrapInContainer([]);
    doc.UnwrapContainer([doc.CreateNode('rectangle', 0, 0)!]); // a plain figure
    assert.equal(doc.Nodes.Count, before + 1); // only the plain figure was added, nothing wrapped/unwrapped
});

test('unwrapping an empty container just removes it', () => {
    // realized empty container C (no children); UnwrapContainer([C]).
    // assert: C gone from Nodes; no error.
});
```

- [ ] **Step 2: Run them.** The cycle-guard and no-op cases should already PASS (Stage 1 `containerAt` excludes descendants; Tasks 2/4 guard empties). If any FAIL, apply the minimal fix (e.g., a missing guard) and note it in the commit.

- [ ] **Step 3: If a fix was needed, implement it; otherwise proceed.**

- [ ] **Step 4: Run the full suite** (`npm test`) — all green, template build included.

- [ ] **Step 5: Commit** "test(diagram): pin container edge cases (cycle rejection, empty wrap/unwrap)".

---

## Self-Review

**Spec coverage (Stage 2 row — "Wrap/Unwrap commands; drag candidate-container highlight; orphan re-homing on container delete; optional auto-grow-to-fit on drop; edge cases"):**
- Wrap command → Tasks 1 (helpers/args), 2 (mutation), 5 (command + wiring). Unwrap command → Tasks 1, 4, 5.
- Drag candidate-container highlight → Task 6.
- Orphan re-homing on container delete → Task 3 (`reHome` + `DeleteNodes` hook); unwrap reuses it (Task 4).
- Auto-grow-to-fit on drop → Task 7.
- Edge cases (self/descendant drop rejection, empty container) → Task 8 (mostly pins Stage-1 behavior).
- §6 "sized to the selection's union + padding, positioned to enclose it… convert each to content-space (they don't move on screen)" → Task 2 geometry + coord conversion. §6 "Unwrap clears children's parentId (converting back)… deletes the container" → Task 4. §"Deleting a container re-homes children… (data-loss guard)" → Task 3.

Explicitly deferred (consistent with the spec): **Stage 3** connector re-route when an ancestor container moves. **Mid-drag reparent** (this stage commits on drop, per §5 hysteresis). A default **keyboard chord** for Wrap/Unwrap is intentionally omitted (Ctrl+G/Ctrl+Shift+G are Group/Ungroup; no free, non-conflicting chord) — the commands are exposed via `WrapInContainerCommand`/`UnwrapContainerCommand` for consumers to bind to a toolbar/menu, matching how commands are the API surface.

**Placeholder scan:** Every code step carries real code. Three spots defer exact dialect to a verified sibling and say so explicitly: the RelayCommand/command-key declaration form (Task 5, "copy Group's form verbatim"), the `.mu` trigger syntax + accent key (Task 6, "mirror the `IsSelected` trigger"), and `ContainerFigure.prototype.ContentOrigin.Y` vs importing the constant (Task 1 note). These are "match the established pattern" directions, not logic gaps. Test bodies for the realized-harness tasks (3, 4, 6, 7, 8) give exact assertions but say "mirror `container-placement.test.ts` harness" for the diagram/ItemsPanel boilerplate rather than duplicating ~40 lines of setup — the harness is a fixed, greppable pattern the executor copies.

**Type consistency:** `WrapInContainer(items: readonly unknown[])` / `UnwrapContainer(items: readonly unknown[])` identical across DiagramDocument (Tasks 2, 4), the `DiagramMutator` interface, and the mutator doubles (Task 5). `reHome(container: ContainerFigure)` (Task 3) is called from `DeleteNodes` (Task 3) and `UnwrapContainer` (Task 4). `WrapRequestedArgs { Items }` / `UnwrapRequestedArgs { Containers }` (Task 1) are consumed with those exact field names in Diagram fire methods and mutator handlers (Task 5) — note Unwrap carries `Containers`, not `Items`. `highlightCandidate(point, exclude)` / `clearCandidate()` (Task 6) match between `ContainerPlacement`, the `ContainerPlacementLike` duck-type, and the `figure.ts` call sites. `containerGeometryFor(nodes): ContainerBox` (Task 1) feeds `Figure.fromKind('container', box.left, box.top, {width: box.width, height: box.height})` (Task 2).

**Known follow-ups for the executor to verify against live code (not blockers):** exact Group command-key declaration site + `RelayCommand`/`_install` signatures (Task 5); the `.mu` trigger dialect and accent resource key from the `IsSelected` trigger (Task 6); whether `_cascadeRemoveConnectorsFor` and `Status` are the right names in `diagram-document.ts` (Task 4 — both used by `Ungroup`/`DeleteNodes` in the same file); whether `ContentOrigin` getter is `this`-free for the prototype read (Task 1).
