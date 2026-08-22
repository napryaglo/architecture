# Diagram Containers — Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A connector whose endpoint node is nested in a container re-routes when an **ancestor container moves** — closing the one gap Stage 1 left open (a container move doesn't tick its descendants' own `Left/Top`, so descendant-anchored connectors didn't re-route).

**Architecture:** A `Connector` already subscribes to its endpoint node's `Left/Top` DPs and re-routes on a tick. Stage 3 adds a parallel subscription to each **ancestor container's** `Left/Top` (walking the `ContainerParent` chain), routed to the same re-route path. Because `ContainerParent` is a plain field with no change event, the ancestor-subscription set is **refreshed whenever the endpoint node's own `Left/Top` ticks** — and `ContainerPlacement.reparent` always writes the node's `Left/Top`, so a reparent (the only thing that changes the chain) reliably triggers the refresh. Two handler kinds keep it re-entrancy-safe: the node-own handler refreshes ancestors then re-routes; the ancestor handler only re-routes.

**Tech Stack:** TypeScript, Mural framework (`src/framework/diagram`), node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-08-22-diagram-containers-design.md` (§9 "Connectors" → "Re-route on container move" + Staging → "Stage 3"). Stage 1/2 plans for context in the same folder.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to the code it exercises (`src/framework/diagram/tests/…`).
- Cross-class internals: prefer public API; if you must reach in, declare a named interface and cast through it — never bracket access. (Here: `ContainerParent` chain-walk uses a small duck-type interface, matching how `nodeRect` already duck-types `ContainerParent?: unknown` at `connector.ts:1636`.)
- Run a single test file: `npx tsx --conditions=development --test src/framework/diagram/tests/<file>.test.ts`. Full suite: `npm test`.
- Commit after each task. Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Mural-only, headless tests. Do NOT run Plexus or touch the corpus.

## Grounding (verified 2026-08-22, post-Stage-2)

- **Node-position subscription (`connector.ts`):** `_reattachSourceNodeListener()` (`:654`) / `_reattachTargetNodeListener()` (`:690`) detach the previous node's `Left/Top` (+`Width/Height`) listeners and attach the current `Source?.Node` / `Target?.Node` ones via `node.AddPropertyChangedListener(resolveKey(node, undefined, 'Left'), this._onSourceNodeMoved)` (`:675-676`), guarded by `MuralBase.HasProperty(node.constructor, 'Left')`. `_trackedSourceNode` / `_trackedTargetNode` (`:267-268`, `MuralBase | undefined`) hold the currently-subscribed node.
- **Re-route path:** handlers `_onSourceNodeMoved` / `_onTargetNodeMoved` (`:315-316`) → `_onAttachedNodeMoved()` (`:326`) which drops `Waypoints` (clean reroute) or calls `_scheduleRecompute()`.
- **Reattach triggers:** `_reattach*NodeListener` is called from `_onSourceEndpointInputChanged` (`:305`, fires when `ConnectorEndpoint.NodeKey` changes) and from the `Source`/`Target` DP change path.
- **Detach:** `DetachFromHosts()` (`:812-826`) removes the tracked nodes' `Left/Top` listeners.
- **`nodeRect()` (`:1621-1655`)** returns `diagramSpaceRect(node)` when `node.ContainerParent !== undefined` (Stage 1), else the raw `Left/Top` rect — so once a reroute is triggered, the route already lands in diagram-space for any nesting depth. `diagramSpaceRect` / `SpatialNode` are already imported (`:26`).
- **`Figure.ContainerParent` (`figure.ts:294`)** is a **plain public field** (not a DP) set by `ContainerPlacement.reparent` (`container-placement.ts:57,70`) / `_restore` (`:121`). No change event — hence the refresh-on-move strategy. `reparent` always writes `node.Left`/`node.Top` (`:58-59` root, `:72-73` into-container).
- **Test harness (`tests/connector.test.ts`):** `makeFigure(left,top,w,h,ports)` builds a bare `Figure`; `startOf(conn)` reads `(conn.Geometry as PathGeometry).Figures[0].StartPoint`. Reroute is synchronous — `connector.test.ts:623-635` sets `fig.Left = 200` and immediately asserts the new `startOf(c).X`. `tests/connector-nested.test.ts` sets `child.ContainerParent = container` directly + uses `__nodeRectForTesting`.

## File Structure

- `src/framework/diagram/connector.ts` — MODIFY: add ancestor-container `Left/Top` subscriptions (source + target), refresh on node-own move, detach on `DetachFromHosts`.
- Tests: `src/framework/diagram/tests/connector-nested-move.test.ts` (CREATE).

---

### Task 1: Subscribe a nested endpoint to its ancestor containers' `Left/Top`

**Files:**
- Modify: `src/framework/diagram/connector.ts`
- Test: `src/framework/diagram/tests/connector-nested-move.test.ts`

**Interfaces:**
- Consumes: `Figure.ContainerParent` chain; `resolveKey`, `MuralBase.HasProperty`, `MuralBase.Add/RemovePropertyChangedListener`; the existing `_onAttachedNodeMoved()`.
- Produces: when an endpoint node has a `ContainerParent`, the connector subscribes each ancestor container's `Left/Top` so an ancestor move re-routes it. New private members: `_sourceAncestors: MuralBase[]`, `_targetAncestors: MuralBase[]`, handlers `_onSourceAncestorMoved`/`_onTargetAncestorMoved`, and `_refreshSourceAncestorListeners()`/`_refreshTargetAncestorListeners()`.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Point } from '../../../visual-engine/index.js';
import { Connector, RoutingMode } from '../connector.js';
import { ConnectorEndpoint } from '../connector-endpoint.js';
import { Figure } from '../figure.js';
import { ContainerFigure } from '../container-figure.js';
import type { PathGeometry } from '../../../visual-engine/index.js';

function app(): void { Application.current = null; new Application(); }
function startX(c: Connector): number { return (c.Geometry as PathGeometry).Figures[0]!.StartPoint.X; }
function startY(c: Connector): number { return (c.Geometry as PathGeometry).Figures[0]!.StartPoint.Y; }

test('moving an ancestor container re-routes a connector anchored to its nested child (source)', () => {
    app();
    const container = new ContainerFigure();
    container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 20, 20, { width: 30, height: 20 });
    child.ContainerParent = container;   // nested BEFORE the endpoint attaches
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ Node: child });
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(800, 200) });   // far right → east anchor
    const beforeX = startX(c);

    container.Left = container.Left + 150;   // move the ANCESTOR (child's own Left/Top unchanged)

    assert.equal(startX(c) - beforeX, 150, 'source anchor tracked the container move');
});

test('moving an ancestor container re-routes a connector anchored to its nested child (target)', () => {
    app();
    const container = new ContainerFigure();
    container.Left = 400; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 20, 20, { width: 30, height: 20 });
    child.ContainerParent = container;
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ FreePoint: new Point(0, 200) });
    c.Target = new ConnectorEndpoint({ Node: child });
    const before = (c.Geometry as PathGeometry).Figures[0]!;
    const beforeEndX = before.Segments !== undefined ? undefined : undefined; // read end via a helper below
    const endBefore = endX(c);

    container.Top = container.Top + 60;   // move ancestor vertically

    assert.equal(endY(c) - endYAt(c, endBefore), 0); // placeholder — replaced below
});

// End-point readers: the connector's END is the last figure point. Straight route
// has a single segment; read the geometry's last point.
function endX(c: Connector): number { const f = (c.Geometry as PathGeometry).Figures[0]!; return lastPoint(f).X; }
function endY(c: Connector): number { const f = (c.Geometry as PathGeometry).Figures[0]!; return lastPoint(f).Y; }
function endYAt(): number { return 0; }
function lastPoint(fig: unknown): Point {
    // A straight PathFigure exposes StartPoint + one LineSegment; fall back to
    // scanning Segments for the final point. Mirror how connector.test.ts reads
    // geometry (StartPoint) and extend for the terminal point.
    const f = fig as { StartPoint: Point; Segments?: ReadonlyArray<{ Point?: Point; Points?: readonly Point[] }> };
    const segs = f.Segments ?? [];
    for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i]!;
        if (s.Points !== undefined && s.Points.length > 0) return s.Points[s.Points.length - 1]!;
        if (s.Point !== undefined) return s.Point;
    }
    return f.StartPoint;
}
```

> **Executor note:** simplify the target test to the same shape as the source test once you confirm how `connector.test.ts` reads the terminal point. The intent is: with the target node nested, moving the container by `(0,+60)` moves the connector's **end** anchor by `(0,+60)`. Use whatever geometry reader `connector.test.ts` already uses for the end point (grep it — e.g. an `endOf` helper); do not hand-roll `lastPoint` if a helper exists. Keep the **source** test exactly as written (it's the load-bearing one); make the target test its mirror with `assert.equal(endYDelta, 60)`.

- [ ] **Step 2: Run it, verify it fails** — the source assertion fails (`startX(c) - beforeX` is `0`: no ancestor subscription, so the container move doesn't reroute).

- [ ] **Step 3: Implement in `connector.ts`.**

Add tracked fields near `_trackedSourceNode` (`:267`):

```ts
// Ancestor containers whose Left/Top this connector watches, so a nested
// endpoint re-routes when an ANCESTOR moves (its own Left/Top don't tick).
// Refreshed whenever the endpoint node's own Left/Top ticks (reparent writes
// them), the only signal that the ContainerParent chain changed.
private _sourceAncestors: MuralBase[] = [];
private _targetAncestors: MuralBase[] = [];
```

Add handlers near `_onSourceNodeMoved` (`:315`):

```ts
private readonly _onSourceAncestorMoved = (): void => { this._onAttachedNodeMoved(); };
private readonly _onTargetAncestorMoved = (): void => { this._onAttachedNodeMoved(); };
```

Add a chain-walk duck-type near the top-of-file interfaces (or just above the class), mirroring `nodeRect`'s duck-typing:

```ts
interface ContainerParentLike { ContainerParent?: ContainerParentLike | undefined; }
function ancestorChain(node: unknown): MuralBase[] {
    const out: MuralBase[] = [];
    let c = (node as ContainerParentLike | undefined)?.ContainerParent;
    while (c !== undefined) { out.push(c as unknown as MuralBase); c = c.ContainerParent; }
    return out;
}
```

Add the refresh methods (below `_reattachTargetNodeListener`):

```ts
// Re-point the ancestor-container Left/Top subscriptions at the CURRENT chain of
// the source endpoint's node. Detach the previously-tracked ancestors first
// (they are distinct objects from the node, so calling this from the node-moved
// handler is re-entrancy-safe). Idempotent.
private _refreshSourceAncestorListeners(): void
{
    for (const anc of this._sourceAncestors)
        if (MuralBase.HasProperty(anc.constructor, 'Left'))
        {
            anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onSourceAncestorMoved);
            anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onSourceAncestorMoved);
        }
    this._sourceAncestors = ancestorChain(this.Source?.Node);
    for (const anc of this._sourceAncestors)
        if (MuralBase.HasProperty(anc.constructor, 'Left'))
        {
            anc.AddPropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onSourceAncestorMoved);
            anc.AddPropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onSourceAncestorMoved);
        }
}

private _refreshTargetAncestorListeners(): void
{
    for (const anc of this._targetAncestors)
        if (MuralBase.HasProperty(anc.constructor, 'Left'))
        {
            anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onTargetAncestorMoved);
            anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onTargetAncestorMoved);
        }
    this._targetAncestors = ancestorChain(this.Target?.Node);
    for (const anc of this._targetAncestors)
        if (MuralBase.HasProperty(anc.constructor, 'Left'))
        {
            anc.AddPropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onTargetAncestorMoved);
            anc.AddPropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onTargetAncestorMoved);
        }
}
```

Call the refresh at the end of the node-reattach methods so the ancestor set attaches when the endpoint's node is (re)assigned. Add as the last statement of `_reattachSourceNodeListener()` (`:688`) and `_reattachTargetNodeListener()`:

```ts
        this._refreshSourceAncestorListeners();   // end of _reattachSourceNodeListener
```
```ts
        this._refreshTargetAncestorListeners();   // end of _reattachTargetNodeListener
```

Detach in `DetachFromHosts()` — after the `_trackedTargetNode` block (`:826`):

```ts
        for (const anc of this._sourceAncestors)
            if (MuralBase.HasProperty(anc.constructor, 'Left'))
            {
                anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onSourceAncestorMoved);
                anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onSourceAncestorMoved);
            }
        this._sourceAncestors = [];
        for (const anc of this._targetAncestors)
            if (MuralBase.HasProperty(anc.constructor, 'Left'))
            {
                anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Left'), this._onTargetAncestorMoved);
                anc.RemovePropertyChangedListener(resolveKey(anc, undefined, 'Top'),  this._onTargetAncestorMoved);
            }
        this._targetAncestors = [];
```

- [ ] **Step 4: Run it, verify it passes; run the connector test group** (`connector*.test.ts`) for regressions.

- [ ] **Step 5: Commit** "feat(diagram): re-route a connector when an ancestor container of its nested endpoint moves".

---

### Task 2: Refresh ancestor subscriptions when a connected node is reparented

**Files:**
- Modify: `src/framework/diagram/connector.ts` (refresh on node-own move)
- Test: `src/framework/diagram/tests/connector-nested-move.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's `_refreshSourceAncestorListeners`/`_refreshTargetAncestorListeners`; the existing `_onSourceNodeMoved`/`_onTargetNodeMoved`.
- Produces: after a node already carrying a connector is nested (its `ContainerParent` set + `Left/Top` written, as `ContainerPlacement.reparent` does), the connector picks up the new ancestor so a subsequent container move re-routes it.

- [ ] **Step 1: Write the failing test** (append to `connector-nested-move.test.ts`):

```ts
test('nesting an already-connected node then moving the container re-routes it', () => {
    app();
    const container = new ContainerFigure();
    container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 300, 120, { width: 30, height: 20 }); // starts at ROOT
    const c = new Connector();
    c.RoutingMode = RoutingMode.Straight;
    c.Source = new ConnectorEndpoint({ Node: child });   // attached while child is root → no ancestors yet
    c.Target = new ConnectorEndpoint({ FreePoint: new Point(800, 200) });

    // Simulate ContainerPlacement.reparent: link the parent, then write parent-
    // relative Left/Top (the write is what fires the node-moved handler).
    child.ContainerParent = container;
    child.Left = 20; child.Top = 20;

    const beforeX = startX(c);
    container.Left = container.Left + 150;   // move the ancestor
    assert.equal(startX(c) - beforeX, 150, 'ancestor subscription was refreshed on reparent');
});
```

- [ ] **Step 2: Run it, verify it fails** — with only Task 1's attach-time refresh, the ancestor set was captured when `child` was root (empty), and nothing refreshed it on the later nest → the container move doesn't reroute (`delta === 0`).

- [ ] **Step 3: Implement** — refresh the ancestor set inside the node-own move handlers (they fire on the `Left/Top` write that `reparent` performs). Change `_onSourceNodeMoved` / `_onTargetNodeMoved` (`:315-316`):

```ts
private readonly _onSourceNodeMoved = (): void => { this._refreshSourceAncestorListeners(); this._onAttachedNodeMoved(); };
private readonly _onTargetNodeMoved = (): void => { this._refreshTargetAncestorListeners(); this._onAttachedNodeMoved(); };
```

Re-entrancy note: these fire from the **node's own** `Left/Top`; the refresh detaches/attaches listeners on the **ancestor** objects (never the node), so it does not mutate the listener set currently dispatching. The ancestor handler (`_onSourceAncestorMoved`) deliberately does NOT refresh — an ancestor move never changes the chain, and refreshing there would detach the very listener mid-dispatch.

- [ ] **Step 4: Run it, verify it passes; run the connector + container-drag test groups** (`connector*.test.ts`, `container-drag.test.ts`) — the drag path pops a node to root then re-nests on drop, exercising this refresh.

- [ ] **Step 5: Commit** "feat(diagram): refresh a connector's ancestor subscriptions when its node is reparented".

---

## Self-Review

**Spec coverage (§9 "Re-route on container move" + Stage 3):** ancestor-`Left/Top` subscription so a descendant-anchored connector re-routes on an ancestor move → Task 1. "subscriptions refreshed on reparent" → Task 2. Same-parent-sibling / root-to-root connectors are unaffected (they have empty ancestor sets). Deeper nesting works because `ancestorChain` walks the whole `ContainerParent` chain and `nodeRect` already returns `diagramSpaceRect` for any depth.

**Placeholder scan:** All implementation steps carry real code. The **target** test in Task 1 defers its terminal-point reader to "use whatever helper `connector.test.ts` uses" — a match-the-harness direction, flagged explicitly, with the load-bearing **source** test fully concrete. Grep `connector.test.ts` for an `endOf`/end-point reader before writing the target assertion.

**Type consistency:** `_sourceAncestors`/`_targetAncestors: MuralBase[]` written by `ancestorChain(node): MuralBase[]` and consumed by the refresh + detach loops with the same `MuralBase.HasProperty` + `resolveKey` guard the node subscriptions use (`:657-676`). `_onSourceAncestorMoved`/`_onTargetAncestorMoved` route to the existing `_onAttachedNodeMoved()`. `_refreshSourceAncestorListeners`/`_refreshTargetAncestorListeners` are called from both the node-reattach methods (Task 1) and the node-moved handlers (Task 2).

**Known follow-ups for the executor to verify (not blockers):** the exact end-point geometry reader in `connector.test.ts` (Task 1 target test); that `RoutingMode.Straight` is the enum member name used by existing connector tests (grep — mirror it); that reroute is synchronous in the headless harness (Stage-1 `connector-nested.test.ts` + `connector.test.ts:623` both assert immediately after a mutation, so it is).
