# Diagram connectors

Lines / curves that link two shapes on a `Diagram` surface, the way
yEd / Visio / drawio / Lucidchart / dgrm.net link nodes. A
framework-level addition to the existing `Diagram` control (today:
nodes only, no edges). This doc is the consolidated design — read it
end-to-end before touching code.

**Will live in:** [src/framework/diagram/](../framework/diagram/) — the
same directory as `diagram.ts` and `diagram-node.ts`.

See also: [adorners.md](adorners.md) for the adorner surface the edit
handles ride on, [behaviors.md](behaviors.md) for the
attach-create-gesture pattern, [drawing.md](drawing.md) for
`PathGeometry` / `DrawingContext`, [templating.md](templating.md) for
the `DataTemplate` dispatch the connector + cap visuals use.

## 1. Scope locks (decided)

These were resolved through the brainstorming pass; everything else in
the doc follows from them.

1. **Anchor model** — *both* ports + auto. A connector's endpoint
   names a node and *optionally* a port. If the port name resolves
   against the node's `Ports` collection, use it. Otherwise auto-anchor.
2. **Routing flavor** — *pluggable per-connector*. Built-ins ship for
   `Straight`, `Orthogonal`, `Bezier`. Custom routers register through
   a `RouterRegistry`.
3. **Editing surface** — *full edit* from day one. Drag-create from a
   source shape to a target. Re-anchor by dragging endpoints.
   Add / move / remove waypoints. Delete with `Delete` / `Backspace`.
4. **Scope** — *framework primitive from day one*. Lives in
   `src/framework/diagram/`, not as demo-local code in the diagram
   demo. The diagram demo is the first consumer, not the owner.
5. **Port location** — *both* bbox + outline. A port declares its
   coordinate space (`Bbox` 0..1 local, or `Outline` arc-length
   parameter against `Node.Geometry`). Bbox default; outline opt-in
   for shapes that need precision.
6. **Custom routers + custom connectors + custom caps** — all
   extensible. Routers via `RouterRegistry`. Connector subclasses via
   `Diagram.ConnectorTemplate: DataTemplate`. Caps via per-end
   `SourceCapTemplate` / `TargetCapTemplate: DataTemplate`.
7. **Port distribution** — `IPortProvider` strategy. Each Shape
   subclass declares a `DefaultPortProvider` static; the consumer can
   override per-instance via `NodeVM.PortProvider`. Built-ins for
   rectangular / radial / outline-walking / polygon-vertex topologies;
   `CustomPortProvider(fn)` is the escape hatch. See § 3.8.

## 2. Module layout

```
src/framework/diagram/
  diagram.ts                       (modify — add Connectors + ConnectorTemplate DPs, switch ItemsPanel to layered)
  diagram-node.ts                  (modify — notify on X/Y/Width/Height change so routes re-run)
  diagram-layers-panel.ts          (NEW — 3-layer Panel: connectors / nodes / adorners)
  connector.ts                     (NEW — Connector extends Shape)
  connector-endpoint.ts            (NEW — ConnectorEndpoint value-type Model)
  port.ts                          (NEW — Port + PortResolver)
  port-providers/
    port-provider.ts               (NEW — IPortProvider interface)
    bounding-box-ports.ts          (NEW)
    radial-ports.ts                (NEW)
    outline-ports.ts               (NEW)
    vertex-ports.ts                (NEW)
    custom-port-provider.ts        (NEW — wraps a callback)
  routing/
    router.ts                      (NEW — IRouter + RouteSpec + RouterRegistry)
    straight-router.ts             (NEW)
    orthogonal-router.ts           (NEW)
    bezier-router.ts               (NEW)
  caps/
    cap-inset.ts                   (NEW — Connector.CapInset attached property + reader)
  connector-create-behavior.ts     (NEW — drag-from-source-to-target gesture)
  connector-edit-adorner.ts        (NEW — endpoint + waypoint handles when selected)
  tests/
    straight-router.test.ts
    orthogonal-router.test.ts
    bezier-router.test.ts
    port-bbox.test.ts
    port-outline.test.ts
    port-providers.test.ts
    connector.test.ts
    connector-create.test.ts
    connector-edit.test.ts
    cap-inset.test.ts

src/resources/framework.resources.mu
  + DefaultConnector Style (default router = Orthogonal, default target cap = ArrowCap)
  + ArrowCap / FilledArrowCap / OpenCircleCap / FilledCircleCap / DiamondCap DataTemplates
```

## 3. Type sketches

### 3.0 Enum types

Named string-valued TS enums per the codebase convention (cf.
[`SegmentedPosition`](../framework/segmented-button.ts),
[`DrawerVariant`](../framework/drawer.ts)). Each enum lives in the
file of its primary consumer; an `index.ts` barrel re-exports.

```ts
// port.ts
export enum PortCoordSpace {
    Bbox    = 'Bbox',     // X / Y in shape-local 0..1 bbox space
    Outline = 'Outline',  // OutlineT arc-length parameter against Node.Geometry
}

export enum PortSide {
    N    = 'N',
    S    = 'S',
    E    = 'E',
    W    = 'W',
    Auto = 'Auto',   // resolver derives from position; only valid on input
}

// Narrower type the resolver emits — Auto has been resolved away.
export type ResolvedPortSide = Exclude<PortSide, PortSide.Auto>;

// connector.ts
export enum AnchorClip {
    Bbox     = 'Bbox',      // clip centroid line against ArrangedRect (fast)
    Geometry = 'Geometry',  // clip against Node.Geometry via §19 (precise)
}

export enum ConnectorEnd {
    Source = 'Source',
    Target = 'Target',
}

// diagram-layers-panel.ts
export enum DiagramLayer {
    Connectors = 'Connectors',
    Nodes      = 'Nodes',
    Adorners   = 'Adorners',
}
```

`RoutingMode` is open-ended (custom routers register through
`RouterRegistry`) so it can't be a closed enum. The built-ins ship
as a `const` namespace so consumers can write
`Connector.RoutingMode = RoutingMode.Orthogonal` and still benefit
from rename refactors:

```ts
// routing/router.ts
export const RoutingMode = {
    Straight:   'Straight',
    Orthogonal: 'Orthogonal',
    Bezier:     'Bezier',
} as const;
export type BuiltInRoutingMode = typeof RoutingMode[keyof typeof RoutingMode];
```

`Connector.RoutingModeKey` is typed `string` (not `BuiltInRoutingMode`)
so custom registered names compile.

### 3.1 `Port`

Lives on the node's VM as part of a `Ports` collection. Coordinate
space is per-port so a single shape can mix bbox-snapped ports and
outline-walked ports.

```ts
class Port extends Model {
    // Semantic identifier — used by ConnectorEndpoint.PortName to look
    // up a specific port by string. Analogous to Visual.Name / FindName.
    // Default '' = anonymous; anonymous ports are addressed positionally
    // by (Side, Index) instead. A shape can mix both freely (e.g. a
    // workflow node with explicit 'in' / 'out' named ports plus a row
    // of anonymous decorative ports addressable as (S, 0..N)).
    static NameKey       = Model.RegisterProperty<string>(Port, 'Name', '', MetaData.None);
    static CoordSpaceKey = Model.RegisterProperty<PortCoordSpace>(
        Port, 'CoordSpace', PortCoordSpace.Bbox, MetaData.None);

    // Bbox mode: X/Y in shape-local 0..1 bbox space. (0,0) top-left, (1,1) bottom-right.
    // Outline mode: X/Y ignored; OutlineT parameterizes the shape's Geometry boundary
    //               by arc length, in [0,1]. Resolution flattens the outline and walks.
    static XKey         = Model.RegisterProperty<number>(Port, 'X', 0, MetaData.None);
    static YKey         = Model.RegisterProperty<number>(Port, 'Y', 0, MetaData.None);
    static OutlineTKey  = Model.RegisterProperty<number>(Port, 'OutlineT', 0, MetaData.None);

    // Routing hint — which way the line leaves / enters at this port.
    // INDEPENDENT of Name: a single shape side can host many ports
    // (one rectangle south edge can hold 5 ports all with Side =
    // PortSide.S, each with its own X / Name).
    // PortSide.Auto = derived from the resolved position (bbox edge in
    // bbox mode; outline tangent in outline mode).
    static SideKey      = Model.RegisterProperty<PortSide>(
        Port, 'Side', PortSide.Auto, MetaData.None);
}
```

**Two independent addressing schemes.** A port can be addressed
positionally (by `(Side, Index)`) or by name (when `Name` is set).
The two schemes coexist on the same `Port` and are used in different
contexts. Easy to conflate because both look like "labels for ports."
They aren't:

| Field | What it is | Many-to-one? | Used by |
|---|---|---|---|
| `Name` | Semantic identifier, optional | Names are unique within a shape | `ConnectorEndpoint.PortName` lookup |
| `Side` | Cardinal routing-direction hint | Many ports share a side | Router's direction bias + positional addressing |
| *Index* | Position within `Side`, **derived** | One per (Side, Index) pair within a shape | `ConnectorEndpoint.PortSide` + `PortIndex` lookup |

**`Index` is not a field on `Port`** — it's computed at resolution
time by `PortResolver`. Algorithm: bucket the shape's `Ports` by
`Side`, sort each bucket by primary axis (`X` ascending for `N` / `S`,
`Y` ascending for `E` / `W`), assign 0-based indices. Tie-break by
secondary axis. Recomputed when the port list changes; stable across
re-renders as long as the port set is stable.

Means providers don't manage indices — they just emit ports with
`Side` set, in any order, and the framework derives positions.

A rectangle with `BoundingBoxPorts({ portsPerSide: 3 })` emits 12
ports; resolution buckets them into `N: [0..2]`, `S: [0..2]`, `E:
[0..2]`, `W: [0..2]`. All four port positions on the south edge have
`Side = PortSide.S`, distinct `X` values, and resolve to indices 0 /
1 / 2 in left-to-right order. None have `Name` set — they're
positionally addressed. A workflow node's `ExplicitPorts` might be
`[Port({Name: 'in', Side: S}), Port({Name: 'out', Side: N})]` —
both named (addressable as `PortName: 'in'` / `'out'`) *and*
positionally addressable (`(S, 0)` / `(N, 0)`). Hybrid is fine.

`PortResolver` is a stateless helper that, given a `(port, node)`
pair, returns `{ x, y, side }` in diagram coordinates. Outline-mode
resolution caches the flattened-outline arc-length table per
`(Geometry identity, flattenTolerance)` so repeated re-routes don't
re-flatten. Cache key uses the Geometry's reference identity; the
cache invalidates when the node's `Geometry` DP fires
PropertyChanged — see open question § 7.1.

The node's VM holds ports under whatever DP / property the consumer
declares. The framework discovers them through a small interface:

```ts
interface IPortHost { readonly Ports: readonly Port[] | undefined; }
```

`PortResolver` duck-types on the presence of a `Ports` getter rather
than requiring an inheritance relationship — node VMs stay free to
inherit from whatever base they want.

### 3.2 `ConnectorEndpoint`

One end of a connector. Either bound to a node (with an optional port
name) or free-floating (used during a drag-create / re-anchor drag,
and for un-attached connectors authored in markup).

```ts
class ConnectorEndpoint extends Model {
    static NodeKey      = Model.RegisterProperty<Model | undefined>(
        ConnectorEndpoint, 'Node', undefined, MetaData.None);

    // Two orthogonal port-lookup paths — at most one is meaningful per
    // endpoint. PortName wins when both are set; if neither resolves,
    // resolution falls through to closest-port or geometric clip
    // (see algorithm below).
    static PortNameKey  = Model.RegisterProperty<string | undefined>(
        ConnectorEndpoint, 'PortName', undefined, MetaData.None);
    static PortSideKey  = Model.RegisterProperty<PortSide | undefined>(
        ConnectorEndpoint, 'PortSide', undefined, MetaData.None);
    static PortIndexKey = Model.RegisterProperty<number | undefined>(
        ConnectorEndpoint, 'PortIndex', undefined, MetaData.None);

    static FreePointKey = Model.RegisterProperty<Point | undefined>(
        ConnectorEndpoint, 'FreePoint', undefined, MetaData.None);
}
```

Resolution algorithm (run inside the connector's route pipeline):

1. If `Node === undefined` → use `FreePoint`. Resolver derives `side`
   from waypoint geometry; falls back to `PortSide.E` if there's no
   adjacent waypoint to read direction from.
2. If `Node` is set + `PortName` resolves against a `Node.Ports`
   entry's `Name` → use `PortResolver` on the matched Port. **Named
   lookup**.
3. Else if `Node` is set + `PortSide` AND `PortIndex` are both set →
   bucket `Node.Ports` by `Side`, sort by primary axis, look up
   `bucket[PortSide][PortIndex]`. If the index is out of range, fall
   through to step 4. **Positional lookup**.
4. Else if `Node.Ports` is non-empty → pick the closest port to the
   line-of-sight from the connector's other endpoint's resolved
   position. Tie-break by smaller `(Side, Index)` lex order. **Auto-pick
   from available ports**.
5. Else → **geometric clip**: clip the centroid-to-centroid line
   against the node, in either bbox or geometry mode (controlled by
   `Connector.AnchorClip` — see § 3.5).

Step 4 is what makes anonymous provider-emitted ports useful without
explicit addressing — the framework picks the best landing point from
whatever the provider supplies. Step 5 is the no-port-system-at-all
fallback.

**Fragility note on positional addressing.** Holding a reference to
`(PortSide.S, PortIndex 2)` and then changing the provider (e.g.
`portsPerSide: 3 → 2`) silently shifts what that index points at, or
falls through to auto-pick if 2 is out of range. Positional refs are
inherently positional — consumers serializing connector references
across provider changes should use `PortName` instead, or pin the
provider via the consumer's own data model.

### 3.3 `IRouter` + `RouterRegistry`

Pure functions. No `Visual`, no DOM. Hot path is `compute()`; cap
rotation uses `tangentAt()`.

```ts
interface ResolvedAnchor {
    x:    number;
    y:    number;
    side: ResolvedPortSide;   // PortSide minus Auto — see § 3.0
}

interface RouteSpec {
    sourceRect:   Rect;
    sourceAnchor: ResolvedAnchor;
    targetRect:   Rect;
    targetAnchor: ResolvedAnchor;
    waypoints:    readonly Point[];
}

interface IRouter {
    compute(spec: RouteSpec):   PathGeometry;
    tangentAt(spec: RouteSpec,  end: ConnectorEnd): number;   // radians
}

class RouterRegistry {
    private static readonly _routers = new Map<string, IRouter>();
    public static register(name: string, router: IRouter): void;
    public static resolve(name: string):  IRouter;   // throws with known-names list on miss
}
```

Built-ins self-register on module load under the names from
`RoutingMode` (see § 3.0):

- `RoutingMode.Straight` — polyline through waypoints, single segment
  when `waypoints.length === 0`.
- `RoutingMode.Orthogonal` — 90° segments. No waypoints + same-side
  endpoints → Z-shape. No waypoints + different-side endpoints →
  L-shape. With waypoints → each waypoint is a bend point.
- `RoutingMode.Bezier` — cubic curves. No waypoints → single cubic
  with control points derived from `side` (e.g. `PortSide.E` extends
  the control point rightward by `0.5 * |target.x - source.x|`). With
  waypoints → spline through waypoints, each acting as an interior knot.

Consumers register custom routers by name:

```ts
import { RouterRegistry } from '@visualisation-sub/mural/framework/diagram';
RouterRegistry.register('elbowed', new ElbowedRouter());
// then in markup: Connector [..., RoutingMode="elbowed"]
```

`Connector.RoutingModeKey` is typed `string` (not `BuiltInRoutingMode`)
on the DP so custom registered names compile — extensibility trades
the narrowing.

### 3.4 `Connector`

Extends `Shape` so it inherits Stroke / Fill / StrokeThickness and
slots into the existing rendering pipeline. Computes its own `Geometry`
DP from the resolved endpoints + waypoints + router.

```ts
class Connector extends Shape {
    static SourceKey            = Model.RegisterProperty<ConnectorEndpoint | undefined>(
        Connector, 'Source', undefined, MetaData.Measure);
    static TargetKey            = Model.RegisterProperty<ConnectorEndpoint | undefined>(
        Connector, 'Target', undefined, MetaData.Measure);
    static WaypointsKey         = Model.RegisterProperty<ObservableCollection<Point> | undefined>(
        Connector, 'Waypoints', undefined, MetaData.Measure);

    static RoutingModeKey       = Model.RegisterProperty<string>(
        Connector, 'RoutingMode', RoutingMode.Orthogonal, MetaData.Measure);
    static AnchorClipKey        = Model.RegisterProperty<AnchorClip>(
        Connector, 'AnchorClip', AnchorClip.Bbox, MetaData.Measure);

    static SourceCapTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        Connector, 'SourceCapTemplate', undefined, MetaData.Render);
    static TargetCapTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(
        Connector, 'TargetCapTemplate', undefined, MetaData.Render);
}
```

Internal pipeline, run in `MeasureOverride`:

1. Resolve `Source` and `Target` endpoints via `ConnectorEndpoint`
   resolution → two `ResolvedAnchor`s.
2. Look up the router by name via `RouterRegistry.resolve(RoutingMode)`.
3. Build a `RouteSpec`; call `router.compute(spec)` → `PathGeometry`.
4. Read `Connector.CapInset` from each cap template's instantiated
   root; shorten the polyline at each end by that amount (the line
   stops short so a filled cap doesn't get poked through). See § 3.6.
5. Write the shortened geometry to the inherited `Shape.Geometry` DP.
6. Compute `HitTestGeometry` by widening the route by ~6 px via the
   §19 `widen()` helper (hit zone larger than the visible stroke so
   thin lines stay clickable).

Cap visuals materialize as overlay children of the connector, each
positioned at its endpoint with `RenderTransform = RotateTransform(
router.tangentAt(spec, end))`. Re-instantiated when the cap template
DP changes; re-positioned every measure.

Reactivity to source / target node moves: when `Source.Node` or
`Target.Node` is set, the Connector subscribes to that node's `X` /
`Y` / `ArrangedRect` PropertyChanged via typed listeners. Each fire
calls `InvalidateMeasure()`. Subscription is per-endpoint and
re-wires when the endpoint's `Node` DP changes. See open question
§ 7.2.

### 3.5 `Diagram` changes

Two structural changes to today's [diagram.ts](../framework/diagram/diagram.ts):

```ts
class Diagram extends Selector {
    // ... existing PositionSnap DP unchanged ...

    static ConnectorsKey         = Model.RegisterProperty<ObservableCollection<Model> | undefined>(
        Diagram, 'Connectors', undefined, MetaData.None);
    static ConnectorTemplateKey  = Model.RegisterProperty<DataTemplate | undefined>(
        Diagram, 'ConnectorTemplate', undefined, MetaData.None);
}
```

`Connectors` is a parallel collection to `ItemsSource`, not a subset.
Connectors aren't items — they're a second selectable population on
the same canvas. The Diagram listens to `Connectors`'s collection
events and materializes one Visual per entry via
`ConnectorTemplate.LoadContent()`, falling back to a built-in default
that produces `Connector`. Identical mechanic to `ItemTemplate` →
`ContentPresenter` → DataTemplate dispatch elsewhere in the framework.

Selection is unified — both nodes and connectors live in the
Selector's `_selectedContainers`. Marquee selects whichever
containers fall inside the rect. `Delete` / `Backspace` removes
the selected items, leaving it to the consumer's callback to update
the underlying VM collections. See open question § 7.3.

### 3.6 Caps + `Connector.CapInset`

Caps are DataTemplates. The cap author declares how far back the
painted line should stop using an attached property on the cap's
template root:

```mu
// Built-in FilledArrowCap, in framework.resources.mu
DataTemplate [DataType=ConnectorCapDataContext] {
    Path [
        Data="M 0,0 L -12,-6 L -12,6 Z",
        Fill=$Foreground,
        // The line should stop 12 px inside the endpoint so it
        // doesn't poke through the arrow's flat back.
        [Connector.CapInset]=12,
    ]
}
```

`Connector.CapInset` (attached property on `Visual`, default `0`) is
read by the connector's route pipeline after the cap template is
instantiated and measured. The router-emitted polyline is shortened
by that amount at the cap end before being written to `Geometry`.

Default cap catalog ships as DynamicResource keys in
[framework.resources.mu](../resources/framework.resources.mu):

| Key                  | Shape                                       | `CapInset` |
|----------------------|---------------------------------------------|------------|
| `@ArrowCap`          | Open arrow (two stroke lines, V-shape)      | 0          |
| `@FilledArrowCap`    | Filled triangle, point at endpoint          | 12         |
| `@OpenCircleCap`     | Stroked circle centered on endpoint         | 0          |
| `@FilledCircleCap`   | Filled disc centered on endpoint            | radius     |
| `@DiamondCap`        | Filled rhombus                              | 8          |

Default for `TargetCapTemplate` is `@ArrowCap`. Default for
`SourceCapTemplate` is `undefined` (no cap at the source end).

### 3.7 `DiagramLayersPanel`

A 3-layer Canvas-shaped Panel. Replaces the bare Canvas that's the
Diagram's current ItemsPanel.

| Layer | Z | Hosts                                                           |
|-------|---|-----------------------------------------------------------------|
| 0     | 0 | Connector visuals (under all nodes).                            |
| 1     | 1 | DiagramNode containers (today's behavior).                      |
| 2     | 2 | Adorners: selection rings, edit handles, alignment guides, drag-create ghost, port-discovery overlays. |

Each layer is itself a `Canvas` so children honor `Canvas.Left` /
`Canvas.Top`. Layer routing happens via an attached property:
`DiagramLayersPanel.Layer: DiagramLayer` on each child Visual (see
§ 3.0 for the enum).

This puts adorners above everything else (drag handles always
clickable), keeps connectors visually behind nodes (typical
diagram-tool look), and gives marquee / autoscroll a single panel to
hit-test against. See open question § 7.6 for the z-bump on selected
nodes.

### 3.8 Port distribution — `IPortProvider`

Where ports land on a shape is a function of the shape's *topology*,
not its identity. A small set of strategies covers the common
topologies; consumers register more via `CustomPortProvider`. Mirrors
the `IRouter` / `RouterRegistry` pattern but per-instance (the
provider lives on the NodeVM as a DP, not in a global registry,
because a single node's distribution can vary independently of any
other node using the same Shape).

Two distinct port-population modes coexist on a NodeVM, addressing
genuinely different use cases:

- **Explicit ports** — consumer hand-lists `Port` instances with
  semantic names ("in", "out", "trigger"). Used when each port carries
  data-model meaning. Workflow nodes, schema entities, anything where
  ports are typed connection slots.
- **Provider-computed ports** — consumer picks a distribution strategy
  + parameters; framework computes `Port` instances on demand. Used
  for purely positional ports — most decorative diagram shapes.

```ts
interface IPortHost {
    // The host's geometric extent in shape-local space.
    readonly ArrangedRect: Rect;
    // Optional — outline-mode providers need it; bbox-mode providers don't.
    readonly Geometry?:    Geometry;
}

interface IPortProvider {
    GetPorts(host: IPortHost): readonly Port[];
}

class NodeVM extends Model {
    static PortProviderKey  = Model.RegisterProperty<IPortProvider | undefined>(
        NodeVM, 'PortProvider', undefined, MetaData.None);
    static ExplicitPortsKey = Model.RegisterProperty<readonly Port[] | undefined>(
        NodeVM, 'ExplicitPorts', undefined, MetaData.None);

    // Unified read surface — providers feed the same downstream
    // PortResolver as explicit ports. ExplicitPorts wins when set;
    // see open question § 7.13 on whether the two modes should merge.
    get Ports(): readonly Port[] {
        return this.ExplicitPorts
            ?? this.PortProvider?.GetPorts(this)
            ?? EMPTY_PORTS;
    }
}
```

**Built-in providers.** All in `src/framework/diagram/port-providers/`.

| Provider | Topology | Parameters | Typical shapes |
|---|---|---|---|
| `BoundingBoxPorts` | Rectangular: place on bbox edges | `portsPerSide: number = 1` | Rectangle, Pill, Squircle, RoundedRect |
| `RadialPorts` | Circular: equiangular around centroid | `count: number`, `startAngle: number = 0` | Ellipse, Circle, regular polygons treated as round |
| `OutlinePorts` | Arc-length-spaced around `Geometry` | `count: number`, `startT: number = 0` | Smooth catalog shapes (Heart, Clamshell, Bun, Fan) |
| `VertexPorts` | One per polygon vertex + optional midpoints | `includeMidpoints: boolean = false` | Triangle, Diamond, Slanted, Arrow head |
| `CustomPortProvider` | Programmatic | `fn: (host) => readonly Port[]` | Heart with 5 anatomical points; Arrow with tail+head+barbs; anything else |

Each provider emits `Port` instances; the existing `PortResolver`
machinery (§ 3.1) resolves their `(CoordSpace, X/Y or OutlineT)` to
diagram-host coordinates. **Providers don't bypass the resolver —
they produce its input.** Means the bbox-mode vs outline-mode split
keeps working: `BoundingBoxPorts` emits `CoordSpace = Bbox` ports,
`OutlinePorts` emits `CoordSpace = Outline` ports, etc.

**Provider-emitted ports are usually anonymous** (`Name = ''`) and
addressed positionally via `(Side, Index)` per § 3.1. The framework
derives the index at resolution time by sorting within each side
bucket — providers don't manage indices.

Concrete example — `BoundingBoxPorts({ portsPerSide: 3 })` emits 12
ports. The right-hand column shows the `(Side, Index)` each port
resolves to:

```ts
// Provider emit (any order — framework re-sorts within each side bucket):
[
    new Port({ Side: PortSide.N, X: 0.25, Y: 0    }),   // → (N, 0)
    new Port({ Side: PortSide.N, X: 0.50, Y: 0    }),   // → (N, 1)
    new Port({ Side: PortSide.N, X: 0.75, Y: 0    }),   // → (N, 2)
    new Port({ Side: PortSide.S, X: 0.25, Y: 1    }),   // → (S, 0)
    new Port({ Side: PortSide.S, X: 0.50, Y: 1    }),   // → (S, 1)
    new Port({ Side: PortSide.S, X: 0.75, Y: 1    }),   // → (S, 2)
    new Port({ Side: PortSide.E, X: 1,    Y: 0.25 }),   // → (E, 0)
    new Port({ Side: PortSide.E, X: 1,    Y: 0.50 }),   // → (E, 1)
    new Port({ Side: PortSide.E, X: 1,    Y: 0.75 }),   // → (E, 2)
    new Port({ Side: PortSide.W, X: 0,    Y: 0.25 }),   // → (W, 0)
    new Port({ Side: PortSide.W, X: 0,    Y: 0.50 }),   // → (W, 1)
    new Port({ Side: PortSide.W, X: 0,    Y: 0.75 }),   // → (W, 2)
]
// A connector wanting "the middle south-edge port" addresses
// (PortSide.S, PortIndex 1).
```

Name a provider-emitted port only when downstream consumers need to
refer to it by string (e.g. `CustomPortProvider` cases where the
data-model layer needs a stable, layout-independent identifier — see
the Heart example below). All five built-in providers emit anonymous
ports; only `CustomPortProvider` outputs can carry names if the
authoring callback assigns them.

**Shape → provider mapping.** Each `Shape` subclass declares its
natural default via a static field; consumers override per-instance
through `NodeVM.PortProvider`.

```ts
class Rectangle extends Shape {
    public static readonly DefaultPortProvider: IPortProvider
        = new BoundingBoxPorts({ portsPerSide: 1 });
}
class Ellipse extends Shape {
    public static readonly DefaultPortProvider: IPortProvider
        = new RadialPorts({ count: 4 });
}
class Triangle extends Shape {
    public static readonly DefaultPortProvider: IPortProvider
        = new VertexPorts({ includeMidpoints: false });
}
class Heart extends Shape {
    public static readonly DefaultPortProvider: IPortProvider
        = new CustomPortProvider(host => [
            new Port({ Name: 'top-left',  CoordSpace: PortCoordSpace.Outline, OutlineT: 0.10, Side: PortSide.N }),
            new Port({ Name: 'top-right', CoordSpace: PortCoordSpace.Outline, OutlineT: 0.40, Side: PortSide.N }),
            new Port({ Name: 'bottom',    CoordSpace: PortCoordSpace.Outline, OutlineT: 0.75, Side: PortSide.S }),
            // ...
        ]);
}
```

A small `resolveDefaultPortProvider(shape: Shape): IPortProvider`
helper walks up the class chain reading `DefaultPortProvider` so
subclasses inherit unless they redeclare. NodeVMs that don't set
`PortProvider` route through this helper.

**Side derivation works generically.** When a provider emits a port
with `Side = PortSide.Auto`, the resolver derives the cardinal: bbox
mode reads which edge the port sits on; outline mode computes the
outward normal at `OutlineT` (perpendicular to the outline tangent,
pointing away from centroid) and quantizes to the dominant axis. No
per-shape code; works for every Shape that has a Geometry.

**Cache lifecycle.** `GetPorts()` results cache on the NodeVM keyed
by `(provider identity, ArrangedRect dimensions, Geometry identity)`.
Cache invalidates when the NodeVM's `PortProvider`, `ArrangedRect`,
or the underlying shape's `Geometry` change. Shares the invalidation
channel with `PortResolver`'s arc-length cache (§ 7.1) so a single
geometry change clears both layers.

See open questions § 7.11 (static vs dynamic port count under
connector demand), § 7.12 (cache invalidation pre-conditions), §
7.13 (mixing explicit + provider ports).

## 4. Editing flow

### 4.1 Drag-create

`ConnectorCreateBehavior` attaches to each Layer 1 node. Watches for
`PointerDown` on the node's body OR on a visible port (when port
discovery is active).

```text
PointerDown over source node (or port)
  → Diagram materializes a transient Connector with
      Source = { Node: sourceVM, <port-ref if a port was hit> }
      Target = { FreePoint: cursorDiagramCoords }
    where <port-ref> is:
      - PortName: <name>                          if the hit port had Name set
      - PortSide: <side>, PortIndex: <index>      if the hit port was anonymous
      - (nothing — auto-pick at resolution time)  if no port was hit
  → connector renders, tracking the cursor as the unbound end

PointerMove
  → behavior updates Target.FreePoint to current cursor
  → connector re-routes per move (sub-frame is fine; routing is cheap
    for Straight / Orthogonal; Bezier needs the open question § 7.4
    "throttle?" answered first)

PointerUp over target node (or port)
  → behavior clears Target.FreePoint, sets Target.Node = targetVM
    (+ the same <port-ref> shape as above if a port was hit)
  → invokes Diagram.OnConnectorCreated callback so the consumer can
    push the connector into their VM-side collection
  → the transient connector is removed; the consumer's add triggers
    a fresh non-transient one through the Connectors collection

PointerUp over empty space
  → abort: drop the transient connector silently
```

The drag-create gesture also drives the port-discovery overlay (see
§ 7.5).

### 4.2 Endpoint re-anchor

`ConnectorEditAdorner` is visible iff the connector is selected.
Renders two drag handles, one at each resolved endpoint position.

```text
PointerDown on an endpoint handle
  → clear that end's port-ref fields (Node, PortName, PortSide,
    PortIndex); set FreePoint = cursor
  → connector now follows cursor at that end

PointerMove
  → update FreePoint

PointerUp over a target node (or port)
  → set Node = targetVM; write the appropriate port-ref shape
    (PortName or PortSide+PortIndex, per § 4.1's port-ref rules);
    clear FreePoint
  → re-anchored

PointerUp over empty space
  → restore original endpoint (the adorner snapshotted it at PointerDown)
```

### 4.3 Waypoint add / move / remove

Same adorner. Renders a draggable handle per existing waypoint and a
ghost "mid-segment" handle at the midpoint of each segment. Dragging
a mid-segment handle materializes a new waypoint at the drag start
position and immediately starts dragging it. Right-click on a
waypoint handle removes it. `Backspace` with no selection but with a
hovered waypoint also removes it.

For Orthogonal routing, waypoints constrain bends. For Straight,
they're polyline vertices. For Bezier, they're spline knots.

### 4.4 Delete

`Diagram.OnKeyDown` already nudges nodes on arrow keys. Adds:
`Delete` / `Backspace` → fire `Diagram.OnDeleteRequested(selectedItems)`
callback. Consumer removes from their VM-side `ItemsSource` and
`Connectors` collections. Framework doesn't mutate consumer
collections directly.

## 5. Coordinate spaces (pin once, test once)

- **Diagram-host coords.** What `Canvas.Left` / `Canvas.Top` on a
  DiagramNode are. What `DiagramNode.X` / `Y` mirror to. What
  `ConnectorEndpoint.FreePoint` is in. What the router consumes and
  produces.
- **Shape-local bbox coords.** What `Port.X` / `Y` are in (bbox mode),
  normalized 0..1. `PortResolver` scales by the node's `ArrangedRect`
  to get diagram-host coords.
- **Shape-local outline arc-length.** What `Port.OutlineT` is in,
  parameter 0..1 around the perimeter. `PortResolver` flattens
  `Node.Geometry` and walks to get diagram-host coords.

All three pinned by tests at the three-way boundary in
`port-bbox.test.ts` / `port-outline.test.ts`.

## 6. Test plan

Mostly deterministic geometry — assert exact PathGeometry segments
from known router inputs.

- `straight-router.test.ts` — 0 / 1 / N waypoints, source-equals-target
  degenerate case, polyline tangent at each end.
- `orthogonal-router.test.ts` — all 16 (sourceSide × targetSide)
  combinations with no waypoints; with waypoints; reverse-direction
  cases; same-side-same-axis edge case (needs the Z-shape detour).
- `bezier-router.test.ts` — control-point math for each side
  combination; multi-knot spline shape; tangent at t=0 / t=1.
- `port-bbox.test.ts` — bbox resolution at corners, edges, centroid;
  `PortSide.Auto` derivation from edge.
- `port-outline.test.ts` — outline arc-length resolution for circle
  (analytic), for unit-square (4 segments), for a heart-shape from
  the catalog (numerical, tolerance ~0.5 px). Cache hit verified by
  instrumenting flatten count.
- `connector.test.ts` — full pipeline: ConnectorEndpoint → resolution
  → routing → geometry. Node-move reactivity: bump source `X`, assert
  Geometry changes. All five resolution paths from § 3.2 pinned:
  FreePoint, named lookup, positional `(PortSide, PortIndex)` lookup,
  positional-lookup-out-of-range fallthrough to auto-pick, no-ports
  fallthrough to geometric clip. Index derivation tested under
  scrambled provider emit order (re-sort must produce stable indices).
- `connector-create.test.ts` — simulated pointer down→move→up;
  transient connector lifecycle; abort on empty drop;
  `OnConnectorCreated` fires with correct shape.
- `connector-edit.test.ts` — endpoint drag re-anchors; waypoint add /
  move / delete; original endpoint restoration on aborted re-anchor.
- `cap-inset.test.ts` — cap template instantiation; inset read from
  attached property; painted line shorter than route by exactly
  `CapInset`; cap rotation matches `tangentAt`.

## 7. Open questions

These are the points to resolve before / during implementation.
Numbered for cross-reference.

### 7.1. Outline-mode port cache invalidation

When a shape's `Node.Geometry` DP changes (animated morphing shape,
theme-driven shape swap, a `RowTemplate`-driven catalog rebuild),
every outline-mode `Port` resolved against that shape needs to
re-resolve, and every Connector touching those ports needs to
re-route. The `PortResolver` cache keys on the Geometry's reference
identity, so a *new* Geometry is a cache miss — fine. But the cache
itself never evicts; over a long session it could pin retired
Geometry instances via the Map. Need either: (a) `WeakRef`-keyed
entries with periodic sweep, (b) explicit `PortResolver.invalidate(
geometry)` API the host calls on Geometry change, or (c) accept the
leak in v1 and revisit when a long-session demo surfaces the cost.

### 7.2. Source / target node reactivity — coupling

The Connector subscribes to its source / target node's `X` / `Y` /
`ArrangedRect` via PropertyChangedListener. This couples Connector
to the node-VM property shape (assumes `XKey` / `YKey` exist on
whatever Model the endpoint references). Three options:

  - **(a) Direct subscription on `'X'` / `'Y'` strings.** Simplest.
    Connector hardcodes those names; any node-VM that uses different
    coords doesn't trigger re-routes. Works today because
    `DiagramNode` already defines `XKey` / `YKey`.
  - **(b) `INodeWithBounds` interface.** Connector duck-types on a
    `Bounds: Rect` getter + `OnBoundsChanged` event. Node-VMs that
    don't implement it don't get re-routes. Cleaner contract, more
    boilerplate.
  - **(c) Diagram-coordinated.** Diagram listens for all DiagramNode
    moves and tells affected connectors to re-route. Connector never
    subscribes directly. Lowest coupling, most indirection.

Recommendation: start with (a). Lift to (b) if a non-DiagramNode
"node" surfaces.

### 7.3. Unified selection — nodes + connectors in one Selector?

Today `Selector._selectedContainers` is a `Set<Visual>` of
DiagramNode containers. Extending it to also hold Connector visuals
is mechanically easy but semantically loaded:

  - `Selector.SelectedItem` / `SelectedItems` currently exposes the
    *items* (NodeVMs), not the containers. Connectors are not items
    — they're a parallel collection. What does `SelectedItems`
    expose when the selection mixes nodes and connectors?
  - `Selector.SelectionChanged` fires with added / removed `items`.
    Mixed-kind events need a kind discriminator or a split API.

Options: (i) extend `Selector` with a `KindResolver` callback that
maps a container to its source item collection — `SelectedItems`
returns a heterogenous mix. (ii) Subclass `Selector` for Diagram
into a `MultiKindSelector` that exposes `SelectedNodes` and
`SelectedConnectors` separately. (iii) Keep two completely separate
selection states on Diagram and let the consumer query both.

Recommendation: (ii) — explicit two-channel API on Diagram. Marquee
behavior fills both per a per-container kind check. Avoids reshaping
`Selector`'s contract for a Diagram-specific need.

### 7.4. Sub-frame re-route during drag — throttle?

A node drag fires `OnPointerMove` per pointer event (60-120 Hz on a
typical mouse, higher on a stylus). Each move re-routes every
touching connector. Orthogonal is cheap (constant work);
Bezier-with-many-waypoints can run into the ms range. Drag-create
hits the same path on its FreePoint update.

Three options: (i) accept it — measure first and throttle only if
profiling shows a bottleneck. (ii) coalesce to next requestAnimationFrame
(at most one re-route per paint frame regardless of pointer move
rate). (iii) coalesce per pointermove only when the route engine
flags itself as "expensive."

Recommendation: (ii) — rAF-coalesce all re-routes by default.
Bounded work per frame; sub-frame pointer moves don't matter
visually because the paint is per-frame anyway.

### 7.5. Port discovery UX — framework-drawn or consumer-authored?

While a drag-create or re-anchor gesture is active, hover-target
nodes should reveal their ports visually (small circles / squares
at each port position, snap-on-hover). Where do these visuals come
from?

  - **(a) Framework-drawn adorner.** Diagram reads each candidate
    node's `Ports` collection and draws a small framework-styled
    glyph at each port. Consumers don't author anything.
  - **(b) DataTemplate-authored.** The node's DataTemplate declares
    a `PortsTemplate` (a nested ItemsControl over its ports). Visible
    only when an attached `Diagram.IsPortDiscoveryActive` DP is set.
    Maximally flexible; more authoring burden.
  - **(c) Hybrid.** Framework-drawn default with an attached
    property `Diagram.PortGlyphTemplate` override.

Recommendation: (c). Default lights up port locations for free;
demos that want stylized port glyphs override.

### 7.6. Z-bump for selected node during drag

A node being dragged ideally renders *above* its connecting lines so
the selection ring isn't occluded. `DiagramLayersPanel` puts
connectors at layer 0 and nodes at layer 1, so a node is already
above connectors. But if the selection adorner is at layer 2 and the
node is at layer 1, the connector at layer 0 can hide a
connector-attaching glyph that the node's content paints itself.
Probably fine — but worth eyeballing once with a real demo before
locking the z-order.

### 7.7. Cap inset with dashed strokes

A connector with `StrokeDashArray` and `CapInset > 0` paints a
shorter polyline than the routed path. The dash pattern's phase is
unaffected at intermediate segments but the visible end-of-stroke
falls at whatever pattern position corresponds to `routedLength -
CapInset`. Standard graphics-tool behavior (Visio, Inkscape, Figma)
is to ignore the inset for dash purposes — pattern starts at the
true endpoint and reads inward. Mural's path renderer follows the
shortened polyline, so dashes near the cap end might appear
truncated. Confirm visually + pin in a test fixture so a future
refactor doesn't silently change it.

### 7.8. Routing with obstacles — explicitly deferred

Orthogonal v1 emits a clean L / Z from source to target without
considering other nodes. Real obstacle-avoidance (route around nodes
in the way) is large enough to be its own subsystem — A* / visibility
graph / Manhattan obstacle routing literature applies. Out of scope
until a demo motivates it. Document as a v2 follow-up.

### 7.9. Connector labels

Text on the connector (typically mid-line, optionally per-segment)
is a standard diagram-tool feature. Easy add: `LabelTemplate:
DataTemplate` DP on Connector + a midpoint-anchored ContentPresenter
managed by the cap pipeline. Defer until v2 unless the first demo
asks for it.

### 7.10. RouterRegistry teardown for tests

`RouterRegistry._routers` is process-global Map state populated by
side-effect module imports of the built-in routers. Test fixtures
that register custom routers can leak across test files unless they
clean up. Need either: (a) `RouterRegistry.unregister(name)` + test
discipline, (b) automatic test isolation through a per-test-context
fresh registry, or (c) accept the leak — built-ins always win, custom
registrations just pile up. (c) is fine for now; promote to (a) when
a real conflict surfaces.

### 7.11. Port count: static vs dynamic-with-connector-demand

A "Rectangle with `BoundingBoxPorts({ portsPerSide: 1 })`" has 4 ports
total. Twenty connectors touching that rectangle stack 5-deep on the
south edge (the closest port for many source positions). Two answers:

  - **(a) Static port count.** Provider returns N regardless of
    connector demand. Stacking is handled at render time: connectors
    that share a port fan out along the port's local edge segment
    (e.g. four south-edge connectors land at x = node.left + 0.2 ·
    width, 0.4 · width, 0.6 · width, 0.8 · width). Port positions
    stay fixed; only the *landing offset within a port's segment*
    varies with neighbor count.
  - **(b) Dynamic count.** Provider returns `max(default, connectorCount)`
    ports. Each connector gets its own dedicated port. Port positions
    move as connectors are added / removed.

Recommendation: **(a)**. Predictable port positions matter for layout
stability, snap-on-hover UX, and serialization round-trips. The
landing-offset mechanic stays local to the connector's source/target
resolution — provider stays simple. (b) destabilizes everything that
depends on a port's position being fixed.

The landing-offset itself needs a small data shape: per-(node, port)
the framework tracks an ordered list of attached connectors (by
identity) and assigns each one a fractional offset along the port's
edge / arc. Worth pinning in a test fixture.

### 7.12. When does `IPortProvider.GetPorts()` actually run?

Provider results depend on `Node.ArrangedRect` (always — for scaling
local coords to diagram-host coords) and on `Node.Geometry` (for
outline-mode providers). Per-frame re-computation is wasteful; never
re-computing breaks when the inputs change.

Cache strategy: NodeVM stores last-computed `Ports[]` plus the
`(provider identity, ArrangedRect, Geometry identity)` key it was
computed under. Invalidate when any of those change:

  - `PortProvider` DP change → invalidate.
  - `Geometry` DP change on the shape → invalidate. Reuses the same
    PropertyChangedListener channel as `PortResolver`'s arc-length
    cache (§ 7.1).
  - `ArrangedRect` change → invalidate, but only when `Width` /
    `Height` change. A pure translation (X / Y move with no resize)
    doesn't change shape-local port positions; the existing
    diagram-host conversion happens downstream in `PortResolver` and
    re-runs naturally on every route compute.

The arrange-cache invalidation is the subtle one. A naive
`OnArrangeChanged → invalidate` invalidates on every node drag,
defeating the cache for the common case. Need to compare prior vs
current `Width` / `Height` and skip on translate-only changes.

### 7.13. Mix `ExplicitPorts` + `PortProvider` in the same shape?

A node with 2 semantic named ports ("in", "out") plus 6 decorative
landing points generated by a provider. Today's sketch:
`ExplicitPorts ?? PortProvider` — one wins, the other is ignored. Two
ways to lift it:

  - **(a) Stay with one-or-the-other** (current). Simple, no
    name-collision question. Forces the consumer to author a
    `CustomPortProvider` that concatenates the two when they want the
    union.
  - **(b) Concat: explicit takes routing precedence on name match,
    provider fills gaps.** Two cases to define: (i) the explicit list
    declares `{Name: 'in'}` and the provider emits another port that
    *happens to land at the same position* — keep both, accept
    overlap. (ii) Explicit declares `{Name: 'in'}` and the provider
    emits a port also named `'in'` — explicit wins by name.

Recommendation: **(a) for v1**. Lift to (b) when a demo asks for it
— the migration is additive and won't break existing consumers
because today's read path already returns `ExplicitPorts` when set.

## 8. Explicitly out of scope

- **Obstacle-avoidance routing.** See § 7.8.
- **Connector labels.** See § 7.9.
- **Animated connectors** (the line "pulses" data-flow direction).
  Routing pipeline doesn't preclude it (Connector is a Visual, animations
  work), but no first-class API in v1.
- **Connector grouping** (a "bundle" of connectors that share a midpoint
  routing channel).
- **Smart-routing optimization** (re-routing all connectors as a global
  layout problem).
- **Persistence / serialization.** Connector / Endpoint / Port are all
  Models with DPs — they round-trip through any framework-level
  serialization that exists, no special handling needed.
- **Multi-source / multi-target connectors** (hyperedges). Standard
  binary connectors only.

## 9. Implementation sequence

Not a plan file (per [CLAUDE.md](../../CLAUDE.md)), just the natural
dependency order. Each row produces something useful + testable.

| Step | What lands | Verification |
|------|------------|--------------|
| 1 | `routing/router.ts` + `RouterRegistry` + `straight-router.ts` | `straight-router.test.ts` passes |
| 2 | `orthogonal-router.ts` | `orthogonal-router.test.ts` passes |
| 3 | `bezier-router.ts` | `bezier-router.test.ts` passes |
| 4 | `port.ts` + `PortResolver` (bbox mode only) | `port-bbox.test.ts` passes |
| 5 | `port.ts` outline-mode + arc-length cache | `port-outline.test.ts` passes |
| 5.5 | `port-providers/` directory + 5 built-in providers + `DefaultPortProvider` static on each Shape subclass | `port-providers.test.ts` passes; bbox + radial + outline + vertex + custom each pinned |
| 6 | `connector-endpoint.ts` + `connector.ts` skeleton (no caps, no edit) | `connector.test.ts` passes for static routes |
| 7 | `caps/cap-inset.ts` + cap pipeline in Connector + default cap templates in framework.resources.mu | `cap-inset.test.ts` passes |
| 8 | `diagram-layers-panel.ts` + Diagram changes (`Connectors` + `ConnectorTemplate` DPs, layered ItemsPanel) | diagram demo renders a hand-authored connector |
| 9 | Node-reactivity wiring on Connector — re-route on source/target move | demo-side smoke: drag a node, watch the connector follow |
| 10 | `connector-create-behavior.ts` — drag-create gesture | `connector-create.test.ts` passes |
| 11 | `connector-edit-adorner.ts` — endpoint + waypoint editing | `connector-edit.test.ts` passes |
| 12 | Unified selection on Diagram (per § 7.3 recommendation) + Delete key | demo-side smoke: marquee + Delete clears mixed selection |
| 13 | Diagram demo: extend `diagram-vm.mjs` with an edges collection; wire connectors; ship as the first consumer | demo build green + manual exercise |
