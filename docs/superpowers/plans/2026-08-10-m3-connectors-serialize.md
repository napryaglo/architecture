# M3 — Connectors on VM Engine + Generic Serialize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Connector endpoints reference the node VM (routing/delete-cascade/serialize follow); a generic per-VM serialize registry replaces the M2 interim shim.

**Architecture:** `endpoint.Node = itemOf(container)`; the resolver already routes VMs via geometric clip. A `NodeSerializer` registry dispatches `{type,id,left,top,w,h,data}` records; `shape`/`text`/`callout` registered now, `arch` (P1) later.

**Tech Stack:** mural framework (TypeScript), node:test, `.mu`.

## Global Constraints

- Test files in a `tests/` subfolder next to source. Real enums; no `../src` cross-package imports.
- Full suite green except the two M4-skipped group cases.
- **Port/side-slot guards stay `instanceof Figure`** (ports are M4). Only broaden guards that gate node **identity/serialize** (see Task 1).

---

### Task 1: Endpoints reference the node VM

**Files:**
- Modify: `src/framework/diagram/behaviors/connector-create-behavior.ts` (the `createEndpoint` at line ~139: `new ConnectorEndpoint({ Node: figure, PortSide: side })`)
- Modify: `src/framework/diagram/connector.ts` (`serializeEndpoint` is in `diagram-document.ts`; in `connector.ts` check the id-helper at line ~1122 `ep?.Node instanceof Figure ? ep.Node.Id : ''`)
- Modify: `src/framework/diagram/diagram-document.ts` (`serializeEndpoint` at line ~903: `if (node instanceof Figure && node.Id …)`)
- Test: `src/framework/diagram/tests/m3-connector-vm.test.ts`

**Interfaces — Produces:** `itemOf(figure): Model` resolving a container to its VM item.

- [ ] **Step 1: Write failing tests**

```ts
// Build a diagram (mirror m1/m2 test harness: initTestApp + Diagram + PaginatedCanvas + surface + layout).
// Create two shapes via doc.CreateNode('rectangle', ...) → ShapeNodeVMs a, b.
// Drive a connector-create gesture from a to b (or construct via the same createEndpoint seam the behavior uses).
test('a connector between VM shapes references the VMs as endpoint.Node', () => {
    // ... after the gesture, the created ConnectorCreatedArgs / Connector:
    assert.equal(connector.Source.Node, a);   // the ShapeNodeVM, not a Figure container
    assert.equal(connector.Target.Node, b);
});
test('deleting a connected VM drops the connector (cascade)', () => {
    // add the connector to doc.Connectors; DeleteNodes([a]); assert Connectors.Count decremented.
});
test('endpoint round-trips by node id when Node is a VM', () => {
    // Save then Load a scene with a connector between two ShapeNodeVMs;
    // assert the reloaded connector's endpoints resolve to the reloaded VMs (by id).
});
```
Look at existing connector tests (`diagram-document-connectors.test.ts`, connector-create tests) for how they drive `ConnectorCreateBehavior` / build connectors headlessly, and reuse that.

- [ ] **Step 2: Run, verify FAIL** (endpoints reference the Figure container; VM endpoints don't serialize).

- [ ] **Step 3: Implement**
  - In `connector-create-behavior.ts`, add and use `itemOf`:
    ```ts
    import { NodeViewModel } from '../node-view-model.js';
    import type { Model } from '../../../runtime/index.js';
    function itemOf(figure: Figure): Model {
        const dc = figure.DataContext;
        return dc instanceof NodeViewModel ? dc : figure;
    }
    // createEndpoint: new ConnectorEndpoint({ Node: itemOf(figure), PortSide: side })
    ```
  - In `diagram-document.ts` `serializeEndpoint`: broaden the guard from `node instanceof Figure` to `(node instanceof Figure || node instanceof NodeViewModel)` (both expose `Id`). Import `NodeViewModel`.
  - In `connector.ts` line ~1122 id-helper: if it is used for endpoint **identity** (serialize/tracking key), broaden `ep.Node instanceof Figure` to also allow `NodeViewModel` (grep its callers first). **Do NOT** touch the side-slot guards at ~1274/~1299 — those correctly stay Figure-only (ports are M4; VM nodes fall back to geometric clip).

- [ ] **Step 4: Run** the new tests + the full connector regression (`diagram-document-connectors.test.ts`, connector-create/resolve tests) — green. Typecheck clean.
- [ ] **Step 5: Commit** (`feat(diagram): connector endpoints reference node VMs`).

---

### Task 2: Generic per-VM serialize registry

**Files:**
- Create: `src/framework/diagram/node-serialization.ts`
- Modify: `src/framework/diagram/diagram-document.ts` (`_serialize`/`_deserialize` dispatch through the registry; keep `serializeEndpoint`/`rehydrateEndpoint`/connector code)
- Test: `src/framework/diagram/tests/m3-node-serialize.test.ts`

**Interfaces — Produces:**
```ts
export interface NodeBaseRecord { id: string; left: number; top: number; w: number; h: number; }
export interface SerializedNodeV2 extends NodeBaseRecord { type: string; data: Record<string, unknown>; }
export interface NodeSerializer {
    readonly type: string;
    matches(node: unknown): boolean;
    serialize(node: unknown): Record<string, unknown>;                       // the `data`
    deserialize(data: Record<string, unknown>, base: NodeBaseRecord): Figure | NodeViewModel;
}
export function registerNodeSerializer(s: NodeSerializer): void;
export function serializerFor(node: unknown): NodeSerializer | undefined;    // by matches()
export function serializerByType(type: string): NodeSerializer | undefined;
```

- [ ] **Step 1: Write failing tests**
```ts
test('typed round-trip: shape + text + connector', () => {
    // doc with a ShapeNodeVM ('rectangle') + a TextShape + a connector between them.
    // Save → the serialized nodes carry a `type` field ('shape' / 'text').
    // Load into doc2 → node types, bounds, and the connector (by id) restored.
});
test('legacy scene (no type field) still loads', () => {
    // Hand-write a legacy payload {nodes:[{id:'n1',kind:'rectangle',left:5,top:6,w:80,h:80,d:''}],...}
    // Load → doc has one ShapeNodeVM at (5,6).
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement**
  - `node-serialization.ts`: the registry (array + register/find-by-node/find-by-type). Register three serializers:
    - `shape` — `matches: n instanceof ShapeNodeVM`; `serialize: { kind, d: pathGeometryToSvgD(n._getSource()) }`; `deserialize: ShapeNodeVM.fromKind|fromSource(...)` from `data.kind`/`data.d` + `base` bounds, set `.Id = base.id`.
    - `text` — `matches: n instanceof TextShape`; `serialize`: `{ kind:'text', text: serializeShapeText(n.Text) }`; `deserialize`: `new TextShape()` + place + `applySerializedText`.
    - `callout` — `matches: n instanceof Callout`; `serialize`: `{ kind:'callout', text, leaderTargetId }`; `deserialize`: `new Callout()` + place (+ the leader target is wired in a second pass by the document, see below).
  - `diagram-document.ts` `_serialize`: for each node in `Nodes` (skip `Group`), `const s = serializerFor(node)`; push `{ type: s.type, id, left, top, w, h, data: s.serialize(node) }` (read base bounds from the node's `Id/Left/Top/Width/Height`). Keep the connectors block unchanged.
  - `_deserialize`: for each record — if `record.type` present, `serializerByType(record.type).deserialize(record.data, base)`; else **legacy fallback**: infer type from `record.kind` (`'text'`→text, `'callout'`→callout, else `'shape'`) and adapt the legacy flat fields into `data`. Set `.Id`, add to `Nodes`, populate `byId`. Keep the callout-leader second pass (read `data.leaderTargetId`) and the connector rehydration exactly as now.
  - Update the `SerializedDiagram`/`SerializedNode` types to the V2 node shape while keeping the loader tolerant of the legacy shape (a union or optional fields).

- [ ] **Step 4: Run** the new tests + ALL existing save/load regressions (`shape-text`, `text-shape`, `field`, `diagram-document*` serialize tests) — green. The M2 `m2-serialize-resize.test.ts` still round-trips. Typecheck clean.
- [ ] **Step 5: Commit** (`feat(diagram): generic per-VM node serialization registry`).

---

### Task 3: Suite + demo gate

- [ ] **Step 1:** Full `npm test` — green except the two M4-skipped group cases.
- [ ] **Step 2:** `npm run typecheck` + `npm run typecheck:demos` — clean.
- [ ] **Step 3:** Confirm demo connectors + save/load work (no group actions — M4 gap). Report skip list.

## Self-Review

- Spec coverage: endpoints→VM + serialize-endpoint broaden (T1), generic registry + legacy load (T2), gate (T3). ✓
- Placeholders: T1's connector-gesture harness + the line-1122 helper decision are flagged to resolve against the real code. T2's text/callout `data` payloads reuse the existing `serializeShapeText`/`applySerializedText`.
- Types: `serializeEndpoint` broadened to `Figure | NodeViewModel`; registry returns `Figure | NodeViewModel`; port/side guards untouched.
