# Connector Routing Persistence — Design (Spec 1 of 2)

## Goal

Manual connector routing must survive node moves, save, and reload. Points the
user drags are **pinned** (never auto-rerouted) and stored so they persist;
everything else is auto and free to re-minimise. This spec covers the
persistence + pinning core. Auto anchor selection (symmetry + crossing
minimisation on a node side) is **Spec 2** and out of scope here.

## Background — the bug

A connector stores manual routing in `Connector.Waypoints` as an **absolute**
`Point[]`. `Connector._onAttachedNodeMoved` deliberately **clears** it whenever
an endpoint node's `Left`/`Top` changes ("absolute points get stranded on a
move"). The save→file→reload round-trip is otherwise correct — `_serialize`
writes `waypoints`, `_deserialize` restores them (diagram-document.ts) — but on
reopen the view re-applies node geometry, firing `_onAttachedNodeMoved`, which
wipes the just-restored routing. From the user's seat: routing "isn't saved."

The framework already distinguishes single vs group moves for waypoints:
`rigid-connector-drag.ts` translates a connector's waypoints rigidly when **both**
endpoints are in a multi-drag's moving set; only a **single**-endpoint move takes
the clearing path.

## Decisions (agreed)

- **Pins are absolute diagram coordinates.** "Survives a move" means *not
  cleared*, not *transformed*. A single node move keeps the pin where the user
  put it and re-routes the auto segments through it.
- **Group move translates pins.** When both endpoints move by the same delta, the
  pins translate rigidly with them (the existing rigid-drag mechanism).
- **Per-point `userAltered` flag, serialized.** The segment-drag adorner
  materialises the whole current route into the waypoint list (auto corners
  included), so a flag is required to tell a point the user actually dragged from
  an incidental auto corner.
- **Layout pipeline is the only reset.** It clears all waypoints (pinned
  included) and rebuilds automatically.

## Model

Replace the flat absolute list with a tagged-vertex list:

```ts
// A single interior route vertex, in absolute diagram-host coordinates.
interface RouteWaypoint {
    readonly point:       Point;
    readonly userAltered: boolean;   // true = pinned (hard constraint); false = auto (minimiser-owned)
}

// Connector.Waypoints: readonly RouteWaypoint[] | undefined
```

- `userAltered: true` (**pinned**) — the route MUST pass through this exact
  absolute point. Never moved, dropped, or reprojected except by the layout
  pipeline (§ Layout).
- `userAltered: false` (**auto**) — a bend the minimiser may move, collapse, or
  discard.

Endpoints are unchanged in this spec: they resolve through the existing
`ConnectorEndpoint` DPs → `ResolvedAnchor`. The router still consumes
`RouteSpec.waypoints: readonly Point[]`; the connector projects its
`RouteWaypoint[]` down to bare `Point[]` (pinned + surviving auto) when building
the spec.

## Behaviour

### Single-endpoint move (the fix)

`_onAttachedNodeMoved` stops clearing. It recomputes the route (the moved port
follows its node) and runs the minimiser (below). Pinned vertices stay at their
absolute points; the auto segments re-form around them.

### Group move (both endpoints)

Unchanged mechanism — `rigid-connector-drag.ts` translates the connector's
waypoints by the drag delta. Made flag-aware: pinned vertices translate and keep
`userAltered: true`; auto vertices may be dropped (the minimiser regenerates
them). The rigid path still overwrites the per-figure recompute within the tick,
so there is no flash.

### The minimiser

On every recompute, a pure pass reduces the waypoint list to the minimum needed:
- **Keep** every `userAltered: true` vertex, in order, at its exact point.
- **Drop** `userAltered: false` vertices that are redundant — collinear with
  their neighbours (within an epsilon), or that the router would reproduce as a
  corner anyway.

This keeps the list from accumulating junk as the adorner materialises routes,
and it is what lets a moved node "re-route respecting the points the user
altered." It is a pure function over `(anchors, waypoints)` and unit-tests on
plain arrays (mirrors `connector-route.ts`).

### Edit adorner (how a point becomes pinned)

The segment/bend drag still materialises the current route into the waypoint
list, but marks **only the vertex the user actually moved** `userAltered: true`.
Materialised corners it passed through stay `userAltered: false`.

## Layout pipeline (reset)

Running the Plexus layout pipeline is the single "reset to auto" operation: it
**clears every connector's `Waypoints` (pinned included)**, so the route is
rebuilt from scratch. This is a small hook in the Plexus layout stage; the route
model and the clear itself live in mural.

## Serialization

`SerializedConnector.waypoints` becomes an array of tagged points:

```ts
readonly waypoints?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly userAltered: boolean }>;
```

- `_serialize` writes every `RouteWaypoint` with its flag.
- `_deserialize` rebuilds `RouteWaypoint[]` and assigns `Connector.Waypoints`.
- **Back-compat:** a legacy `{ x, y }` entry (no `userAltered`) loads as
  `userAltered: true` — legacy hand-routed points were all user intent, so pinning
  them preserves the old scene's look.

The reopened diagram is pixel-identical, and the minimiser/layout still know
which points are pins.

## Non-goals (Spec 2)

- Auto-selecting the exact anchor **on a node side** for symmetry + crossing
  minimisation (a global algorithm inside the layout pipeline).
- Serializing `PortSide` / `PortIndex` so an auto-selected anchor is stable across
  reopen without re-running layout.

## Affected files

**Mural (core):**
- `src/framework/diagram/connector.ts` — `RouteWaypoint` model + `Waypoints` DP
  type; `_onAttachedNodeMoved` no longer clears; minimiser call in
  `RecomputeRoute`; project `RouteWaypoint[]` → `Point[]` for `RouteSpec`.
- `src/framework/diagram/connector-route.ts` (or a sibling `route-minimiser.ts`)
  — the pure minimiser.
- `src/framework/diagram/behaviors/connector-edit-adorner.ts` — mark the dragged
  vertex `userAltered: true`; materialised corners `false`.
- `src/framework/diagram/rigid-connector-drag.ts` + its Diagram-side session —
  flag-aware translate.
- `src/framework/diagram/diagram-document.ts` — `SerializedConnector.waypoints`
  shape + `_serialize`/`_deserialize` (with legacy fallback).

**Plexus (layout reset hook):**
- `src/renderer/src/modules/diagram/layout/*` — clear connector waypoints when
  the layout pipeline runs.

## Testing

- **Minimiser** (pure): drops collinear auto vertices; keeps pinned vertices;
  keeps order; epsilon behaviour; empty/degenerate inputs.
- **Serialization round-trip**: pinned + auto mix survives `_serialize` →
  `_deserialize` with flags intact; legacy `{x,y}` loads as pinned.
- **Single-endpoint move**: pinned vertex stays at its absolute point; auto
  vertices re-minimise; nothing is cleared.
- **Group move**: rigid translate moves pinned vertices by the delta, preserving
  flags.
- **Adorner**: a segment drag marks exactly the dragged vertex `userAltered`.
- **Layout reset**: running the pipeline clears pinned waypoints.
- **Regression**: a plain (non-arch) diagram round-trips manual routing across
  save/reload (the originally reported failure).
