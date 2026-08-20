# Slice #2: Node-Visual Store + Two-Section Serialization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split diagram serialization into two sections — `nodes` (content) and `visuals` (geometry keyed by id) — routed through a document-owned `id → visual` store, and make `NodeSerializer.deserialize` geometry-free.

**Architecture:** A `NodeVisualStore` (a plain `id → NodeVisual` map owned by `DiagramDocument`) is the serialization boundary. `_serialize` populates it by walking the Figure nodes (`SyncFromNodes`) then emits `{ version: 3, nodes, visuals }`; `_deserialize` seeds it from `visuals`, builds content-only nodes via `serializer.deserialize(data)`, and applies each node's visual record. Every serializable node is a Figure (post slice #1) that owns its geometry, so the store is save-derived / load-applied — no live container write-back (that is slice #3, where geometry leaves the nodes; serialize/deserialize stay stable because they already talk to the store).

**Tech Stack:** TypeScript (Mural framework), `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-20-container-owned-geometry-design.md` (End-state → Serialization; slice #2). This plan refines the spec: the *live write-back* half of the store is deferred to slice #3; slice #2 delivers the format + store-as-boundary.

## Global Constraints

- **Clean break — no legacy reader.** Remove the V1 flat-format branch from `_deserialize`. Save always writes v3. Existing `.diagram` fixtures are updated in this plan (Task 3); real Plexus files migrate in slice #3.
- **Geometry-free serializer contract.** `deserialize(data): Figure | NodeViewModel` (drop the `base` param). Serializers never touch Left/Top/Width/Height/Rotation/Base; the document applies geometry from the store after construction. Delete `placeNode`. The `'shape'` serializer drops `rotation`/`baseWidth`/`baseHeight` from its `data` (they live in the visual record now).
- **The visual record** is `{ left, top, w, h, rotation?, baseWidth?, baseHeight?, sizeToContent?, userSized? }`. Base fields always present; the rest omitted when default (rotation 0, base NaN, flags false) — mirrors the current omit-when-default idiom.
- **Enums over string-literal unions**; **tests in `tests/` subfolders**; **no publish** (slice accumulates on `feat/container-owned-geometry`).

## File Structure

- Create `src/framework/diagram/node-visual-store.ts` — `NodeVisual` interface + `NodeVisualStore` class.
- Modify `src/framework/diagram/node-serialization.ts` — `NodeSerializer.deserialize(data)` signature; delete `NodeBaseRecord` usage from the contract (keep the type if still referenced, else remove).
- Modify `src/framework/diagram/node-serializers-default.ts` — 3 serializers drop `base`/`placeNode`; `'shape'` drops rotation/base from `data`; delete `placeNode`.
- Modify `src/framework/diagram/diagram-document.ts` — own a `NodeVisualStore`; `_serialize`/`_deserialize` → v3; remove legacy branch; drop the `SerializedNode` V1 fields.
- Modify serialization tests (Task 3).

---

### Task 1: `NodeVisualStore` + `NodeVisual`

**Files:**
- Create: `src/framework/diagram/node-visual-store.ts`
- Test: `src/framework/diagram/tests/node-visual-store.test.ts`

**Interfaces:**
- Consumes: `Figure` (`Left/Top/Width/Height/Rotation/BaseWidth/BaseHeight/SizeToContent/UserSized`).
- Produces:
  - `interface NodeVisual { left: number; top: number; w: number; h: number; rotation?: number; baseWidth?: number; baseHeight?: number; sizeToContent?: boolean; userSized?: boolean; }`
  - `class NodeVisualStore` with `Get(id): NodeVisual | undefined`, `Set(id, v)`, `Remove(id)`, `Clear()`, `Seed(map: Record<string, NodeVisual>)`, `Snapshot(): Record<string, NodeVisual>`, `Read(node: Figure): NodeVisual` (build a record from a node's geometry, omit-when-default), `Apply(v: NodeVisual, node: Figure)` (write a record onto a node).

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/node-visual-store.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { NodeVisualStore } from '../node-visual-store.js';

function fig(): Figure { Application.current = null; new Application(); return Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); }

describe('NodeVisualStore', () => {
    test('Read captures geometry; rotation/flags omitted when default', () => {
        const f = fig();
        const v = new NodeVisualStore().Read(f);
        assert.deepEqual(v, { left: 10, top: 20, w: 100, h: 50, baseWidth: 100, baseHeight: 100 });
    });
    test('Read includes rotation + flags when set', () => {
        const f = fig(); f.Rotation = 30; f.UserSized = true;
        const v = new NodeVisualStore().Read(f);
        assert.equal(v.rotation, 30);
        assert.equal(v.userSized, true);
    });
    test('Apply writes a record onto a node', () => {
        const f = fig();
        new NodeVisualStore().Apply({ left: 5, top: 6, w: 70, h: 40, rotation: 15 }, f);
        assert.equal(f.Left, 5); assert.equal(f.Top, 6);
        assert.equal(f.Width, 70); assert.equal(f.Height, 40);
        assert.equal(f.Rotation, 15);
    });
    test('Seed → Snapshot round-trips the map', () => {
        const s = new NodeVisualStore();
        const map = { a: { left: 1, top: 2, w: 3, h: 4 } };
        s.Seed(map);
        assert.deepEqual(s.Snapshot(), map);
        assert.deepEqual(s.Get('a'), map.a);
    });
});
```

- [ ] **Step 2: Run → fails** (`Cannot find module '../node-visual-store.js'`).

Run: `npx tsx --conditions=development --test --test-force-exit src/framework/diagram/tests/node-visual-store.test.ts`

- [ ] **Step 3: Implement `node-visual-store.ts`**

`Read`: `left=node.Left, top=node.Top, w=node.Width, h=node.Height`; add `rotation` if `!== 0`; `baseWidth`/`baseHeight` if `!Number.isNaN`; `sizeToContent`/`userSized` if truthy. `Apply`: set the base four always; set rotation/base/flags only when the field is present. `Seed` copies the map; `Snapshot` returns a shallow clone. Store keyed by string id in a `Map`.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/node-visual-store.ts src/framework/diagram/tests/node-visual-store.test.ts
git commit -m "feat(diagram): NodeVisualStore + NodeVisual record (geometry <-> id map)"
```

---

### Task 2: v3 two-section serialization + geometry-free serializer contract

**Files:**
- Modify: `src/framework/diagram/node-serialization.ts` (contract), `src/framework/diagram/node-serializers-default.ts` (3 serializers + delete `placeNode`), `src/framework/diagram/diagram-document.ts` (`_serialize`/`_deserialize`, own the store, remove legacy).
- Test: `src/framework/diagram/tests/v3-serialize.test.ts` (new round-trip).

**Interfaces:**
- Consumes: `NodeVisualStore` (Task 1).
- Produces: on-disk `{ version: 3, nodes: [{id, type, data}], visuals: {id: NodeVisual}, connectors, nextId, metadata }`; `NodeSerializer.deserialize(data): Figure | NodeViewModel`.

- [ ] **Step 1: Write the failing round-trip test**

```ts
// src/framework/diagram/tests/v3-serialize.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { DiagramDocument, type DiagramStorage } from '../diagram-document.js';
import { Figure } from '../figure.js';

class Mem implements DiagramStorage {
    private m = new Map<string, string>();
    GetItem(k: string) { return this.m.get(k) ?? null; }
    SetItem(k: string, v: string) { this.m.set(k, v); }
}
function doc(s?: DiagramStorage) { Application.current = null; new Application(); return new DiagramDocument(s); }

describe('v3 two-section serialization', () => {
    test('save emits {version:3, nodes(content-only), visuals}', () => {
        const s = new Mem(); const d = doc(s);
        const f = Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); f.Id = 'n1'; f.Rotation = 45;
        d.Nodes.Add(f); d.Save();
        const raw = JSON.parse(s.GetItem('mural-diagram-state-v1')!);
        assert.equal(raw.version, 3);
        assert.equal(raw.nodes[0].id, 'n1');
        assert.equal(raw.nodes[0].left, undefined, 'no inline geometry on the node record');
        assert.equal(raw.visuals.n1.left, 10);
        assert.equal(raw.visuals.n1.rotation, 45);
    });
    test('round-trip restores geometry + rotation via the visuals section', () => {
        const s = new Mem(); const d = doc(s);
        const f = Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); f.Id = 'n1'; f.Rotation = 45;
        d.Nodes.Add(f); d.Save();
        const d2 = doc(s); d2.Storage = s; d2.Load();
        const r = d2.Nodes.Get(0)! as Figure;
        assert.equal(r.Left, 10); assert.equal(r.Width, 100); assert.equal(r.Rotation, 45);
    });
});
```

- [ ] **Step 2: Run → fails** (version undefined / geometry inline).

- [ ] **Step 3: Implement**

**`node-serialization.ts`:** change `deserialize(data: Record<string, unknown>): Figure | NodeViewModel` (drop `base`). Update the doc comment (no geometry). Keep `NodeBaseRecord` only if still used elsewhere; otherwise remove.

**`node-serializers-default.ts`:** each `deserialize(data)` drops the `base` param and the `placeNode(...)`/`fig.Id = base.id` placement — return the constructed node without geometry (the `'shape'` serializer builds via `Figure.fromKind(kind, 0, 0, {…})`/`fromSource` at origin; the document applies geometry + Id after). The `'shape'` `serialize` drops `rotation`/`baseWidth`/`baseHeight` from `data`. Delete the `placeNode` export. (Id assignment moves to the document — see below.)

**`diagram-document.ts`:**
- Add `private readonly _visuals = new NodeVisualStore();` (import it).
- `_serialize`: for each node with a serializer, push `{ type, id, data }` (no geometry) and `this._visuals.Set(id, this._visuals.Read(node as Figure))`; emit `{ version: 3, nodes, visuals: this._visuals.Snapshot(), connectors, nextId, metadata? }`. (Connectors block unchanged.)
- `_deserialize`: `this._visuals.Clear(); this._visuals.Seed(payload.visuals ?? {})`. For each node record: `const node = serializerByType(n.type)!.deserialize(n.data ?? {})`; `node.Id = n.id !== '' ? n.id : nextFreeId()`; `const v = this._visuals.Get(node.Id); if (v) this._visuals.Apply(v, node as Figure)`; then `Nodes.Add` + `byId.set`. **Remove the legacy V1 `else` branch entirely.** Keep the callout second-pass wiring (keys on id — unchanged).
- Update `SerializedNode` interface: drop the V1 flat geometry/kind fields; `{ type: string; data?: Record<string,unknown>; id: string }`. Add `visuals?: Record<string, NodeVisual>` + `version?: number` to `SerializedDiagram`.

- [ ] **Step 4: Run the round-trip test + typecheck**

Run: `npx tsx --conditions=development --test --test-force-exit src/framework/diagram/tests/v3-serialize.test.ts` → PASS.
Run: `npm run typecheck` → clean (fix any dangling `placeNode`/`base`/`NodeBaseRecord` references).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(diagram): v3 two-section serialization + geometry-free serializer contract"
```

---

### Task 3: Migrate existing serialization tests to v3

**Files (update):**
- `src/framework/diagram/tests/m3-node-serialize.test.ts`
- `src/framework/diagram/tests/m4-text-callout-serialize.test.ts`
- `src/framework/diagram/tests/shape-serialize-rotation.test.ts`
- `src/framework/diagram/tests/shape-node-format-roundtrip.test.ts`
- `src/framework/diagram/tests/m2-serialize-resize.test.ts`
- `src/framework/diagram/tests/shape-text.test.ts` (round-trip cases)

- [ ] **Step 1: Update the tests**

For DiagramDocument Save/Load round-trip tests: geometry now lands in `raw.visuals[id]` not `raw.nodes[i].{left,top,w,h}` — update any raw-JSON assertions. **Delete the legacy-load tests** (hand-written `{kind,left,top,…}` V1 payloads) — legacy is unsupported. For `shape-serialize-rotation.test.ts` (calls `serializerByType('shape').deserialize(data, base)` directly): switch to the new `deserialize(data)` + assert geometry via a `NodeVisualStore.Apply` or a DiagramDocument round-trip instead of the direct base placement. Rotation/base now assert against the `visuals` record, not `data`.

- [ ] **Step 2: Run each migrated file → PASS**

Run each with `npx tsx --conditions=development --test --test-force-exit <file>`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(diagram): migrate serialization tests to v3 two-section format"
```

---

### Task 4: Full verification

- [ ] **Step 1: Straggler grep** — `grep -rn "placeNode\|NodeBaseRecord\|\.deserialize(.*base" src` → none (or only intended).
- [ ] **Step 2: `npm run typecheck`** → clean; **`npm run build:templates`** → compiles.
- [ ] **Step 3: `npm test`** → full suite green.
- [ ] **Step 4: Commit** any final cleanup.

```bash
git add -A
git commit -m "chore(diagram): finish v3 serialization slice; suite green"
```

---

## Self-review notes

- **Spec coverage:** two-section v3 (Task 2), store as boundary (Tasks 1–2), geometry-free contract (Task 2), clean break (Task 2/3). Live write-back explicitly deferred to slice #3 (documented in Global Constraints). ✔
- **Ordering:** store first (T1, isolated), then the atomic format+contract change (T2, round-trip green), then test migration (T3). ✔
- **Type consistency:** `NodeVisual` shape identical across store, `_serialize`, `_deserialize`, and `SerializedDiagram.visuals`. `deserialize(data)` signature updated at the contract, all 3 serializers, and all 4 call sites in `_deserialize`. ✔
- **Risk:** `Id` assignment moves from the serializer (`fig.Id = base.id`) to the document (`node.Id = n.id`). Verified all three serializers set Id via base today; the document now owns it uniformly.
