# Connector Routing Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual connector routing survive node moves, save, and reload — user-dragged points are pinned (never auto-rerouted), stored absolute with a per-point `userAltered` flag; auto bends re-minimise; the layout pipeline is the only reset.

**Architecture:** Replace `Connector.Waypoints: readonly Point[]` with `readonly RouteWaypoint[]` (`{ point: Point; userAltered: boolean }`, absolute coords). A pure `routePoints()` projection feeds the router `Point[]` as before; a pure `minimiseRoute()` drops redundant *auto* vertices while keeping pinned ones. `_onAttachedNodeMoved` stops clearing pinned vertices. The edit adorner tags only dragged vertices `userAltered`, preserving existing pins by coincidence-matching the rendered route. Serialization gains the flag with a legacy `{x,y}→pinned` fallback. A Plexus layout hook clears waypoints on layout.

**Tech Stack:** TypeScript; Mural framework (`node:test` + `node --test`, `npm test`); Plexus renderer (vitest). No new deps.

## Global Constraints

- Mural test files live in a `tests/` subfolder next to the source; Plexus test files live in a `tests/` subfolder next to the source. (verbatim: "Every test file lives in a `tests/` subfolder next to the code it exercises")
- Real TS `enum`s / typed values, never string-literal unions or bare string literals at use sites.
- `RouteWaypoint.point` is in **absolute diagram-host coordinates** (same space as the old `Waypoints` and `RouteSpec.waypoints`).
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Mural is the framework; Plexus consumes it from Verdaccio. The Plexus task (Task 8) requires publishing a new mural version and bumping Plexus — do NOT use relative `../src` imports.
- Pins are never transformed on a single-endpoint move (absolute); only the rigid group-drag translates them.

---

### Task 1: `RouteWaypoint` model + `routePoints` projection

**Files:**
- Create: `src/framework/diagram/route-waypoint.ts`
- Test: `src/framework/diagram/tests/route-waypoint.test.ts`

**Interfaces:**
- Produces:
  - `interface RouteWaypoint { readonly point: Point; readonly userAltered: boolean }`
  - `function waypoint(point: Point, userAltered?: boolean): RouteWaypoint` (default `userAltered = false`)
  - `function routePoints(wps: readonly RouteWaypoint[] | undefined): readonly Point[]` — projects to bare points (`[]` when undefined)
  - `function hasPinned(wps: readonly RouteWaypoint[] | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point } from '../../../visual-engine/index.js';
import { waypoint, routePoints, hasPinned, type RouteWaypoint } from '../route-waypoint.js';

test('waypoint defaults to auto (not user-altered)', () => {
    const w = waypoint(new Point(10, 20));
    assert.equal(w.userAltered, false);
    assert.equal(w.point.X, 10);
    assert.equal(w.point.Y, 20);
});

test('routePoints projects to bare Points in order; undefined -> []', () => {
    const wps: RouteWaypoint[] = [waypoint(new Point(1, 2), true), waypoint(new Point(3, 4))];
    const pts = routePoints(wps);
    assert.deepEqual(pts.map(p => [p.X, p.Y]), [[1, 2], [3, 4]]);
    assert.deepEqual(routePoints(undefined), []);
});

test('hasPinned is true iff some waypoint is user-altered', () => {
    assert.equal(hasPinned([waypoint(new Point(0, 0))]), false);
    assert.equal(hasPinned([waypoint(new Point(0, 0), true)]), true);
    assert.equal(hasPinned(undefined), false);
});
```

- [ ] **Step 2: Run it — expect FAIL** (`node --test` finds no `../route-waypoint.js`).
  Run: `npm test` (Mural) — expect the new file's tests to fail to import.

- [ ] **Step 3: Implement**

```ts
// route-waypoint.ts
import type { Point } from '../../visual-engine/index.js';

// One interior route vertex, in absolute diagram-host coordinates.
// `userAltered` true = PINNED: a hard constraint the route must pass through,
// preserved across node moves and never re-minimised (only the layout pipeline
// clears it). false = AUTO: a bend the minimiser may move, collapse, or drop.
export interface RouteWaypoint
{
    readonly point:       Point;
    readonly userAltered: boolean;
}

export function waypoint(point: Point, userAltered: boolean = false): RouteWaypoint
{
    return { point, userAltered };
}

// Bare points in order — the router consumes Point[]; undefined -> [].
export function routePoints(wps: readonly RouteWaypoint[] | undefined): readonly Point[]
{
    return wps === undefined ? [] : wps.map(w => w.point);
}

export function hasPinned(wps: readonly RouteWaypoint[] | undefined): boolean
{
    return wps !== undefined && wps.some(w => w.userAltered);
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/route-waypoint.ts src/framework/diagram/tests/route-waypoint.test.ts
git commit -m "feat(connector): RouteWaypoint model + routePoints projection"
```

---

### Task 2: `minimiseRoute` pure function

**Files:**
- Create: `src/framework/diagram/route-minimiser.ts`
- Test: `src/framework/diagram/tests/route-minimiser.test.ts`

**Interfaces:**
- Consumes: `RouteWaypoint`, `waypoint` (Task 1); `Point`.
- Produces: `function minimiseRoute(wps: readonly RouteWaypoint[], src: Point, tgt: Point): readonly RouteWaypoint[]`
  — keeps every `userAltered` vertex (in order, exact point); drops an `userAltered:false` vertex when it is collinear (within `EPS = 0.5`) with its immediate neighbours in the sequence `[src, ...wps, tgt]`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point } from '../../../visual-engine/index.js';
import { waypoint } from '../route-waypoint.js';
import { minimiseRoute } from '../route-minimiser.js';

const src = new Point(0, 0), tgt = new Point(100, 0);

test('drops a collinear auto vertex', () => {
    const out = minimiseRoute([waypoint(new Point(50, 0))], src, tgt);   // on the src->tgt line
    assert.equal(out.length, 0);
});

test('keeps a non-collinear auto vertex (a real bend)', () => {
    const out = minimiseRoute([waypoint(new Point(50, 40))], src, tgt);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.point.Y, 40);
});

test('keeps a pinned vertex even when collinear', () => {
    const out = minimiseRoute([waypoint(new Point(50, 0), true)], src, tgt);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.userAltered, true);
});

test('keeps order and preserves flags', () => {
    const out = minimiseRoute(
        [waypoint(new Point(30, 20), true), waypoint(new Point(60, 20)), waypoint(new Point(90, 20), true)],
        src, tgt);
    // middle auto is collinear with its two pinned neighbours (all y=20) -> dropped
    assert.deepEqual(out.map(w => [w.point.X, w.userAltered]), [[30, true], [90, true]]);
});
```

- [ ] **Step 2: Run — expect FAIL** (no `../route-minimiser.js`). Run: `npm test`.

- [ ] **Step 3: Implement**

```ts
// route-minimiser.ts
import { Point } from '../../visual-engine/index.js';
import { type RouteWaypoint } from './route-waypoint.js';

const EPS = 0.5;   // sub-pixel collinearity tolerance

// Perpendicular distance of p from the line a->b (0 for a degenerate a==b).
function offLine(p: Point, a: Point, b: Point): number
{
    const dx = b.X - a.X, dy = b.Y - a.Y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p.X - a.X, p.Y - a.Y);
    return Math.abs((p.X - a.X) * dy - (p.Y - a.Y) * dx) / len;
}

// Reduce the waypoint list to the minimum the route needs: keep every PINNED
// vertex; drop an AUTO vertex that sits (within EPS) on the straight line
// between its neighbours in the full sequence [src, ...wps, tgt].
export function minimiseRoute(
    wps: readonly RouteWaypoint[], src: Point, tgt: Point,
): readonly RouteWaypoint[]
{
    const kept: RouteWaypoint[] = [];
    for (let i = 0; i < wps.length; i++)
    {
        const w = wps[i]!;
        if (w.userAltered) { kept.push(w); continue; }
        const prev = kept.length > 0 ? kept[kept.length - 1]!.point : src;
        const next = i + 1 < wps.length ? wps[i + 1]!.point : tgt;
        if (offLine(w.point, prev, next) > EPS) kept.push(w);
        // else: collinear auto vertex — drop it.
    }
    return kept;
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/route-minimiser.ts src/framework/diagram/tests/route-minimiser.test.ts
git commit -m "feat(connector): pure route minimiser (keeps pins, drops collinear auto)"
```

---

### Task 3: Retype `Connector.Waypoints` + feed router via projection

**Files:**
- Modify: `src/framework/diagram/connector.ts` (DP `113-114`, getter/setter `167-168`, `RecomputeRoute` `912`, `EMPTY_WAYPOINTS` `1147`)
- Test: `src/framework/diagram/tests/connector.test.ts` (add cases)

**Interfaces:**
- Consumes: `RouteWaypoint`, `routePoints` (Task 1); `minimiseRoute` (Task 2).
- Produces: `Connector.Waypoints: readonly RouteWaypoint[] | undefined` (getter/setter unchanged names).

This task ONLY retypes the DP and fixes the router feed; the adorner/rigid/serialize call sites are later tasks and will be updated to compile there. After this task, `connector.ts` compiles; the other files break and are fixed in Tasks 4–7. Land these as one branch so the suite is green only at the end — but each task still commits.

- [ ] **Step 1: Write the failing test** (add to `connector.test.ts`)

```ts
import { waypoint } from '../route-waypoint.js';
// ... existing imports (Connector, ConnectorEndpoint, Point, Figure) ...

test('Waypoints holds RouteWaypoints; route passes through a pinned point', () => {
    const c = makeConnectorBetween(new Point(0, 0), new Point(100, 0)); // helper in this file
    c.Waypoints = [waypoint(new Point(50, 40), true)];
    c.RecomputeRoute();
    const route = c.CurrentRoutePoints!;
    // the pinned bend appears on the rendered polyline
    assert.ok(route.some(p => Math.abs(p.X - 50) < 1 && Math.abs(p.Y - 40) < 1));
});
```

(If `connector.test.ts` has no `makeConnectorBetween`, build the connector inline the same way the file's existing tests do — reuse its setup helpers.)

- [ ] **Step 2: Run — expect FAIL** (`Waypoints` still typed `Point[]`). Run: `npm test`.

- [ ] **Step 3: Implement — retype + projection**

Change the DP (connector.ts:113-114):
```ts
    public static readonly WaypointsKey   = Model.RegisterProperty<readonly RouteWaypoint[] | undefined>(
        Connector, 'Waypoints',   undefined,             MetaData.None);
```
Getter/setter (167-168):
```ts
    public get Waypoints():    readonly RouteWaypoint[] | undefined  { return this.get_property_value(Connector.WaypointsKey); }
    public set Waypoints(v:    readonly RouteWaypoint[] | undefined) { this.set_property_value(Connector.WaypointsKey, v); }
```
Add imports at top:
```ts
import { type RouteWaypoint, routePoints } from './route-waypoint.js';
import { minimiseRoute } from './route-minimiser.js';
```
In `RecomputeRoute`, replace line 912 `const waypoints = this.Waypoints ?? EMPTY_WAYPOINTS;` with a minimised bare-point projection built AFTER the anchors are known. Since `_resolveAnchors` needs `waypoints: Point[]` too, project first with raw points, then use minimised points for the RouteSpec:
```ts
        const rawPoints = routePoints(this.Waypoints);   // for anchor direction
        let srcAnchor: ResolvedAnchor;
        let tgtAnchor: ResolvedAnchor;
        ({ srcAnchor, tgtAnchor } = this._resolveAnchors(src, tgt, rawPoints));
        // ... (bake block unchanged, but pass rawPoints) ...
        const minimised = routePoints(
            minimiseRoute(this.Waypoints ?? [], new Point(srcAnchor.x, srcAnchor.y), new Point(tgtAnchor.x, tgtAnchor.y)));
        const spec: RouteSpec = { sourceRect, sourceAnchor: srcAnchor, targetRect, targetAnchor: tgtAnchor, waypoints: minimised };
```
Update the two `_resolveAnchors(src, tgt, waypoints)` calls (916, 931) to pass `rawPoints`. Delete `EMPTY_WAYPOINTS` (1147) — no longer used (or leave it; grep confirms after).
Ensure `Point` is imported in connector.ts (it already imports from visual-engine).

- [ ] **Step 4: Run — expect PASS for connector tests** (other files won't compile yet; run just this file):
  Run: `node --test dist/framework/diagram/tests/connector.test.js` after `npm run build`, OR the repo's single-file test command. Expect the new case PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/connector.ts src/framework/diagram/tests/connector.test.ts
git commit -m "feat(connector): retype Waypoints to RouteWaypoint[]; minimise router feed"
```

---

### Task 4: `_onAttachedNodeMoved` preserves pins (the bug fix)

**Files:**
- Modify: `src/framework/diagram/connector.ts:316-327`
- Test: `src/framework/diagram/tests/connector.test.ts`

**Interfaces:**
- Consumes: `hasPinned` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
import { hasPinned } from '../route-waypoint.js';

test('moving an endpoint node PRESERVES pinned waypoints (does not clear)', () => {
    const c = makeConnectorBetween(new Point(0, 0), new Point(100, 0));
    const srcFig = c.Source!.Node as Figure;
    c.Waypoints = [waypoint(new Point(50, 40), true), waypoint(new Point(60, 40))];
    srcFig.Left = srcFig.Left + 30;   // fires _onAttachedNodeMoved
    assert.ok(c.Waypoints !== undefined && c.Waypoints.some(w => w.userAltered && w.point.Y === 40));
});

test('moving an endpoint with NO pinned waypoints clears them (clean reroute)', () => {
    const c = makeConnectorBetween(new Point(0, 0), new Point(100, 0));
    const srcFig = c.Source!.Node as Figure;
    c.Waypoints = [waypoint(new Point(50, 40))];   // auto only
    srcFig.Left = srcFig.Left + 30;
    assert.ok(c.Waypoints === undefined || c.Waypoints.length === 0);
});
```

- [ ] **Step 2: Run — expect FAIL** (current code clears unconditionally). Run: `npm test`.

- [ ] **Step 3: Implement** — replace `_onAttachedNodeMoved` (316-327):

```ts
    private _onAttachedNodeMoved(): void
    {
        const wps = this.Waypoints;
        if (hasPinned(wps))
        {
            // Pins are absolute — keep them where the user put them; drop only
            // the auto vertices so the moved port re-routes cleanly through the
            // pins. Setting Waypoints schedules the recompute.
            this.Waypoints = wps!.filter(w => w.userAltered);
        }
        else if (wps !== undefined && wps.length > 0)
        {
            this.Waypoints = undefined;   // no pins → clean reroute (legacy behaviour)
        }
        else
        {
            this._scheduleRecompute();
        }
    }
```
Add `hasPinned` to the route-waypoint import in connector.ts.

- [ ] **Step 4: Run — expect PASS.** Run: `npm test` (connector tests).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/connector.ts src/framework/diagram/tests/connector.test.ts
git commit -m "fix(connector): keep pinned waypoints on endpoint move (was cleared)"
```

---

### Task 5: Edit adorner — tag dragged vertices, preserve existing pins

**Files:**
- Modify: `src/framework/diagram/behaviors/connector-edit-adorner.ts` (all `Waypoints` sites: 129-133, 185-238, 244-251, 269-295, 350-351, 365, 376-379)
- Modify: `src/framework/diagram/behaviors/connector-interactions-behavior.ts:465` (read projection)
- Test: `src/framework/diagram/tests/connector-edit-adorner.test.ts` (retype existing + add pin cases)

**Interfaces:**
- Consumes: `RouteWaypoint`, `waypoint`, `routePoints` (Task 1).
- The adorner's internal geometry stays in `Point[]`; it reads via `routePoints(connector.Waypoints)` and writes via a local `tag()` that rebuilds `RouteWaypoint[]`, preserving a point's pinned-ness when it coincides (`ApproximatelyEqual`) with an existing pin, plus forcing the moving indices pinned.

- [ ] **Step 1: Write the failing test** (add; also retype existing `c.Waypoints = [new Point(...)]` → `[waypoint(new Point(...), true)]` and reads `c.Waypoints![i].X` → `c.Waypoints![i].point.X`)

```ts
import { waypoint } from '../route-waypoint.js';

test('a segment drag marks the moved vertices userAltered and keeps prior pins', () => {
    const c = makeAdornerConnector();                 // helper as in this file
    c.Waypoints = [waypoint(new Point(40, 10), true)]; // an existing pin
    c.RecomputeRoute();
    const adorner = new ConnectorEditAdorner();
    adorner.BeginSegmentDrag(c, 1);                    // grab an interior segment
    adorner.UpdateCursor(new Point(0, 55));
    adorner.EndDragOverEmpty();
    const wps = c.Waypoints!;
    assert.ok(wps.some(w => w.userAltered && w.point.X === 40 && w.point.Y === 10)); // prior pin kept
    assert.ok(wps.some(w => w.userAltered && w.point.Y === 55));                     // dragged vertex pinned
});
```

- [ ] **Step 2: Run — expect FAIL** (adorner writes bare `Point[]`; type errors + assertions fail).

- [ ] **Step 3: Implement** — add helpers at the bottom of the adorner file:

```ts
import { type RouteWaypoint, waypoint, routePoints } from '../route-waypoint.js';
import { Point } from '../../../visual-engine/index.js';   // if not already imported

// Rebuild a RouteWaypoint[] from bare geometry points: a point is PINNED if it
// coincides with an existing pin OR its index is in `forcePinned`. Everything
// else is auto. This preserves user pins across a materialise-from-rendered-route
// while flagging exactly what the user moved. (primitives Point has no
// ApproximatelyEqual, so use a local epsilon coincidence.)
const COINCIDE_EPS = 0.5;
function coincides(a: Point, b: Point): boolean
{
    return Math.abs(a.X - b.X) < COINCIDE_EPS && Math.abs(a.Y - b.Y) < COINCIDE_EPS;
}
function tag(points: readonly Point[], priorPins: readonly Point[], forcePinned: ReadonlySet<number>): RouteWaypoint[]
{
    return points.map((p, i) => waypoint(
        p, forcePinned.has(i) || priorPins.some(q => coincides(p, q))));
}

function priorPinsOf(c: { Waypoints: readonly RouteWaypoint[] | undefined }): readonly Point[]
{
    return (c.Waypoints ?? []).filter(w => w.userAltered).map(w => w.point);
}
```

Then convert each site to operate on `Point[]` then `tag(...)` at the write:
- `BeginWaypointDrag` (129-133): `const wps = routePoints(connector.Waypoints);` snapshot stores the `RouteWaypoint[]` (`connector.Waypoints?.slice()`); index bounds use `wps.length`.
- `BeginSegmentDrag` (185, 237): `const priors = priorPinsOf(connector); const snapshot = (connector.Waypoints ?? []).slice();` build `next: Point[]` exactly as today (using `route` points), then `connector.Waypoints = tag(next, priors, new Set([moveA, moveB]));`
- `InsertWaypointAndDrag` (244-251): read `routePoints`, build `next: Point[]`, write `connector.Waypoints = tag(next, priorPinsOf(connector), new Set([insertIndex]));` snapshot = `connector.Waypoints?.slice()`.
- `UpdateCursor` waypoint (269-272): `const pts = routePoints(this._state.connector.Waypoints).slice(); pts[index] = cursor; conn.Waypoints = tag(pts, priorPinsOf(conn), new Set([index]));`
- `UpdateCursor` segment (278-295): `const pts = routePoints(connector.Waypoints).slice();` mutate `pts[moveA]/[moveB]`, then `connector.Waypoints = tag(pts, priorPinsOf(connector), new Set([moveA, moveB]));`
- `EndDragOverEmpty` segment (350-351): `const wps = connector.Waypoints; if (wps) connector.Waypoints = dedupeAdjacent(wps);` — update `dedupeAdjacent` to operate on `RouteWaypoint[]` (compare `.point`, keep the pinned one when merging).
- `Abort` (365): `this._state.connector.Waypoints = this._state.snapshot;` — snapshot is now `RouteWaypoint[]` (typed in the state union; update the `_state` interfaces' `snapshot: readonly RouteWaypoint[]`).
- `RemoveWaypoint` (376-379): filter on `connector.Waypoints` directly (already `RouteWaypoint[]`).

Update the `_state` discriminated-union types so `snapshot` fields are `readonly RouteWaypoint[]`. Update `dedupeAdjacent` (below line 383) signature and body to `RouteWaypoint[]`, comparing `a.point`/`b.point`, and when two adjacent coincide, keep the one with `userAltered === true` (pins win).

`connector-interactions-behavior.ts:465`: `const wps = conn.Waypoints ?? [];` → `const wps = routePoints(conn.Waypoints);` (it reads points for hit-testing segment handles). Add the `routePoints` import.

- [ ] **Step 4: Run — expect PASS.** Run: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/behaviors/connector-edit-adorner.ts src/framework/diagram/behaviors/connector-interactions-behavior.ts src/framework/diagram/tests/connector-edit-adorner.test.ts
git commit -m "feat(connector): adorner tags dragged vertices as pinned; preserves prior pins"
```

---

### Task 6: Rigid group-drag — flag-aware translate

**Files:**
- Modify: `src/framework/diagram/diagram.ts:478-509` (`BeginRigidConnectorDrag`)
- Test: `src/framework/diagram/tests/rigid-connector-drag.test.ts`

**Interfaces:**
- Consumes: `RouteWaypoint`, `waypoint` (Task 1).
- The session snapshots each internal connector's `RouteWaypoint[]` and, per tick, re-lays `snapshot + total` translated, **preserving each vertex's `userAltered` flag**.

- [ ] **Step 1: Write the failing test**

```ts
test('rigid group drag translates pinned waypoints by the delta and keeps the flag', () => {
    const { diagram, connector } = makeInternalConnectorScene(); // both endpoints in one moving set
    connector.Waypoints = [waypoint(new Point(50, 40), true)];
    const session = diagram.BeginRigidConnectorDrag(new Set([/* both endpoint nodes */]))!;
    session.Translate(10, 5);
    const w = connector.Waypoints![0]!;
    assert.equal(w.point.X, 60); assert.equal(w.point.Y, 45); assert.equal(w.userAltered, true);
    session.End();
});
```

- [ ] **Step 2: Run — expect FAIL** (snapshot/translate is `Point[]`). Run: `npm test`.

- [ ] **Step 3: Implement** — in `BeginRigidConnectorDrag`, change the snapshot/translate (current 487, 505):
```ts
            const wps = c.Waypoints;                       // readonly RouteWaypoint[] | undefined
            // ... qualify (both endpoints in movingSet) as today ...
            // snapshot the RouteWaypoint[] as-is:
            tracked.push({ connector: c, snapshot: wps.slice() });
```
and in the per-tick re-lay (505):
```ts
            t.connector.Waypoints = t.snapshot.map(w =>
                waypoint(new Point(w.point.X + totalDx, w.point.Y + totalDy), w.userAltered));
```
Update the local `tracked` element type to `{ connector: Connector; snapshot: readonly RouteWaypoint[] }`. Add imports for `waypoint`, `RouteWaypoint`, `Point`.

- [ ] **Step 4: Run — expect PASS.** Run: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.ts src/framework/diagram/tests/rigid-connector-drag.test.ts
git commit -m "feat(connector): rigid group-drag translates pins preserving the flag"
```

---

### Task 7: Serialization — persist the `userAltered` flag (+ legacy fallback)

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`SerializedConnector` 94-104, `_serialize` 725-727, `_deserialize` 841-844)
- Test: `src/framework/diagram/tests/diagram-document-connectors.test.ts`

**Interfaces:**
- Consumes: `RouteWaypoint`, `waypoint` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
import { waypoint } from '../route-waypoint.js';

test('waypoints round-trip with userAltered flags intact', () => {
    const doc = makeDocWithConnector();                 // 2 nodes + 1 connector
    doc.Connectors.Get(0)!.Waypoints = [waypoint(new Point(50, 40), true), waypoint(new Point(60, 40))];
    doc.Save();
    const reloaded = new DiagramDocument(doc.Storage!);
    reloaded.Load();
    const wps = reloaded.Connectors.Get(0)!.Waypoints!;
    assert.deepEqual(wps.map(w => [w.point.X, w.point.Y, w.userAltered]), [[50, 40, true], [60, 40, false]]);
});

test('legacy {x,y} waypoints load as pinned', () => {
    const doc = makeDocWithConnector();
    const legacy = JSON.stringify({ nodes: [/* the 2 nodes */], connectors: [{ source: {/*..*/}, target: {/*..*/}, waypoints: [{ x: 7, y: 8 }] }], nextId: 2 });
    doc.Storage!.SetItem('mural-diagram-state-v1', legacy);
    doc.Load();
    const w = doc.Connectors.Get(0)!.Waypoints![0]!;
    assert.equal(w.point.X, 7); assert.equal(w.userAltered, true);
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test`.

- [ ] **Step 3: Implement**

`SerializedConnector.waypoints` (98):
```ts
    readonly waypoints?:  ReadonlyArray<{ readonly x: number; readonly y: number; readonly userAltered?: boolean }>;
```
`_serialize` (725-727):
```ts
                waypoints:   c.Waypoints !== undefined && c.Waypoints.length > 0
                    ? c.Waypoints.map(w => ({ x: w.point.X, y: w.point.Y, userAltered: w.userAltered }))
                    : undefined,
```
`_deserialize` (841-844):
```ts
            if (sc.waypoints !== undefined && sc.waypoints.length > 0)
            {
                // Legacy entries (no userAltered) were all hand-routed intent → pin them.
                c.Waypoints = sc.waypoints.map(p => waypoint(new Point(p.x, p.y), p.userAltered ?? true));
            }
```
Add `import { waypoint } from './route-waypoint.js';` (Point already imported).

- [ ] **Step 4: Run — expect PASS.** Run: `npm test`. Then run the FULL Mural suite — everything green now.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram-document.ts src/framework/diagram/tests/diagram-document-connectors.test.ts
git commit -m "feat(connector): serialize userAltered flag; legacy {x,y} loads as pinned"
```

---

### Task 8: Publish mural + Plexus layout-reset hook

**Files:**
- Modify: `Mural/package.json` (version bump), publish to Verdaccio
- Modify: `Plexus/package.json` (`@pragmatic-lab/mural` floor), `npm install`
- Modify: `Plexus/src/renderer/src/modules/diagram/layout/layout-pipeline-service.ts` (clear connector waypoints when a layout runs)
- Test: `Plexus/src/renderer/src/modules/diagram/layout/tests/layout-pipeline-service.test.ts`

**Interfaces:**
- Consumes: the published `Connector.Waypoints` setter (accepts `RouteWaypoint[] | undefined`; `undefined` clears).

- [ ] **Step 1: Bump + publish mural**
```bash
cd Mural && npm version minor && npm publish --registry http://localhost:4873/
```
- [ ] **Step 2: Bump Plexus floor + install**
```bash
cd Plexus && npm pkg set dependencies.@pragmatic-lab/mural="^<new-version>" && npm install
```
- [ ] **Step 3: Write the failing test** — assert that running the layout clears each connector's `Waypoints` to `undefined` (read the actual service; the exact method name is `Run`/`Apply` — match the file). Example shape:

```ts
test('running the layout pipeline clears connector waypoints (reset to auto)', async () => {
    const { service, doc, connector } = makeLayoutScene();
    connector.Waypoints = [{ point: new Point(50, 40), userAltered: true }]
    await service.Run(doc)     // match the real entrypoint
    expect(connector.Waypoints).toBeUndefined()
})
```

- [ ] **Step 4: Run — expect FAIL** (layout doesn't clear waypoints). Run: `npm test` (Plexus).

- [ ] **Step 5: Implement** — in the layout pipeline's apply/run entry, before/after it writes node positions, iterate `doc.Connectors` and set each `Waypoints = undefined`. (Grep the file for where it mutates the doc; add the clear in the same pass.)

- [ ] **Step 6: Run — expect PASS + full Plexus suite green.** Run: `npm run typecheck && npm test`.

- [ ] **Step 7: Commit** (both repos)
```bash
cd Mural && git add package.json && git commit -m "release: connector routing persistence"
cd Plexus && git add package.json package-lock.json src/renderer/src/modules/diagram/layout && git commit -m "feat(layout): clear connector waypoints on layout (reset to auto)"
```

---

## Self-Review

**Spec coverage:** Model §1 → T1/T3. Single-move keep + minimiser §2 → T2/T3/T4. Adorner pin §3 → T5. Group-move translate §Behaviour → T6. Serialization + legacy §5 → T7. Layout reset §Layout → T8. Regression (plain diagram round-trip) → covered by T7 round-trip test (a plain DiagramDocument). No gaps.

**Placeholder scan:** T8 leaves the layout entrypoint method name to grep (`Run`/`Apply`) — this is because the service's public method must be read at implementation time; the step says exactly what to do and where. All other steps carry real code.

**Type consistency:** `RouteWaypoint`, `waypoint()`, `routePoints()`, `hasPinned()`, `minimiseRoute()` names are used identically across T1–T8. `Waypoints` getter/setter names unchanged. `Point` accessors: production code uses `.point.X`/`.point.Y`; note the geometry `Point` exposes `.X`/`.Y` (getters over `fX`/`fY`) — confirm the accessor name against `connector-route.ts` (which uses `.X`/`.Y`) before writing tests.
