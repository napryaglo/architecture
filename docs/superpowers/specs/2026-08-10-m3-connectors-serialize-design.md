# M3 — Connectors on the VM Engine + Generic Serialize

**Parent:** `2026-08-10-unified-node-viewmodel-engine-design.md` (§3, stage M3).
**Depends on:** M2 (shapes are `ShapeNodeVM`s; `Nodes` holds VMs + Figures).

**Goal:** (1) Connector endpoints reference the **node VM** (not the container Figure),
so routing clips to the VM's geometry and the delete cascade tracks VMs; (2) replace the
M2 interim serialize shim with a **generic per-VM (serialize, deserialize) registry** so
each node type round-trips itself and new types (P1's `ArchNodeVM`) plug in without
touching `DiagramDocument`.

## Background — what already works

- `ConnectorEndpoint.Node` is typed `Model` (deliberately, per its doc comment) and the
  resolver (`connector.ts` `resolveEndpoint`) reads the node duck-typed:
  `Left/Top/Width/Height` (bounds, path 5 geometric clip) and optional `Geometry`.
  `ShapeNodeVM` satisfies all of these, and its `Geometry` is the same local-space
  scaled path a `Figure` would produce — so **routing needs no change** once the
  endpoint points at the VM.
- The `DeleteNodes` connector cascade is `items.includes(endpoint.Node)` — **generic**;
  it starts working for VM shapes the moment endpoints reference VMs. No cascade edit.

## Design

### 1. Endpoints reference the node VM

`ConnectorCreateBehavior` builds endpoints from the container `Figure` under the cursor
(`new ConnectorEndpoint({ Node: figure, PortSide })`). The container's `DataContext` is
the node VM (M1 `bindContainer`). Resolve the endpoint's `Node` to the item:

```ts
function itemOf(figure: Figure): Model {
    const dc = figure.DataContext;
    return dc instanceof NodeViewModel ? dc : figure;   // text/callout stay Figures
}
// endpoint construction: Node: itemOf(sourceFigure) / itemOf(targetFigure)
```

- VM shapes → `Node` = the `ShapeNodeVM` (precise geometry clip, delete cascade,
  serialize-by-id all follow).
- Text/Callout (still Figures, no VM DataContext) → `Node` = the Figure (unchanged).

Do this at the single point endpoints are constructed in the behavior, so every consumer
receives VM-referencing endpoints.

### 2. Generic per-VM serialize registry

Replace the type-branched `_serialize`/`_deserialize` (the M2 interim shim) with a
registry keyed by a stable **type tag**:

```ts
export interface NodeSerializer<T> {
    readonly type: string;                              // stable tag, e.g. 'shape'
    matches(node: unknown): node is T;                  // instanceof check
    serialize(node: T): Record<string, unknown>;        // the type-specific `data`
    deserialize(data: Record<string, unknown>, base: NodeBaseRecord): T;  // rebuild
}
```
`DiagramDocument._serialize` writes one record per node:
`{ type, id, left, top, w, h, data }` (base fields from `NodeViewModel`/`Figure`
bounds; `data` from the matching serializer). `_deserialize` looks up the serializer by
`type` and rebuilds, then adds to `Nodes`. Connectors serialize/rehydrate endpoints by
node **id** exactly as today (`serializeEndpoint` already uses `node.Id`), resolving ids
against the rebuilt `byId` map (widened to the node union).

Registered in M3:
- `shape` → `ShapeNodeVM` (`data: { kind, d }`).
- `text` → `TextShape`, `callout` → `Callout` (Figures; `data` carries their extra
  fields — text block, leader target id). These keep the current behavior, just routed
  through the registry.

**Back-compat:** the loader reads a legacy record (no `type` field, the M2/older format)
by inferring the type from `kind` (`'text'`/`'callout'`/catalog-kind → shape), so old
`.diagram` scenes still load. New saves use the typed format.

The registry lives in `framework/diagram/node-serialization.ts`; `DiagramDocument`
imports the default registrations. P1 registers `arch` for `ArchNodeVM` the same way,
with no `DiagramDocument` edit.

## Testing

- **Connector → VM:** create a connector between two `CreateNode` shapes; assert each
  endpoint's `Node` is the `ShapeNodeVM` (not a Figure); the connector routes (has a
  resolved geometry/anchor); moving a VM re-routes it.
- **Delete cascade:** deleting a VM shape that has a connector drops the connector
  (`Connectors.Count` decremented) — no cascade code change, driven by the VM endpoint.
- **Text/Callout endpoints:** a connector to a `TextShape` still references the Figure.
- **Generic serialize round-trip:** a scene with a `ShapeNodeVM`, a `TextShape`, and a
  connector between them saves to the typed format and reloads — node types, bounds,
  and the connector's endpoints (by id) all restored.
- **Legacy load:** a hand-written legacy record (`{kind:'rectangle',…}`, no `type`)
  loads as a `ShapeNodeVM`.
- **Full suite** green (the two group cases remain M4-skipped); demo connectors work.

## Risks

- **`itemOf` at the right seam.** If endpoints are constructed in more than one place
  (drag-create vs. programmatic), all must route through `itemOf`, or some connectors
  reference containers and desync the delete cascade. Grep every `new ConnectorEndpoint`.
- **Serialize registry migration** must preserve the exact `text`/`callout` payloads
  (text block, leader) — regression tests for those must stay green.
- **Endpoint identity after load:** connectors resolve endpoints by node id; ensure
  every deserialized VM gets its `Id` set before connector rehydration (ordering).
- Ports fidelity (named/side ports for VM shapes) is still M4 — M3 relies on path-5
  geometric clip, which is bounds+geometry based and needs no ports.
