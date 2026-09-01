# Shape-node → self-painting Figure migration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make geometric shape nodes *be* self-painting `Figure`s (deleting `ShapeNodeVM`), so the node's hit region is its silhouette — fixing corner-of-bbox selection — and removing the Figure/VM duplication.

**Architecture:** A shape node stops being a `ShapeNodeVM` (data) rendered by a `Shape` inside a shapeless `Figure` container. Instead the `Figure` itself is the node, self-painting its silhouette with `HitTestGeometry` + children-only `ClipToBounds` (already built). Text/callout/arch nodes stay as VMs-in-containers. The on-disk `.diagram` record format is unchanged; only the runtime class a `'shape'` record deserializes to changes.

**Tech Stack:** TypeScript, Mural framework (`Figure`, `DiagramDocument`, node-serialization registry), `.template.mu` markup, node:test. Design: `docs/superpowers/specs/2026-08-19-shape-node-figure-migration-design.md`.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to its source.
- Enums over string-literal unions; no `type X = 'a'|'b'`.
- Renderer/framework must not import `node:fs` / `node:path`.
- Mural tests: `npm test`; single file: `npx tsx --conditions=development --test <path>`.
- Framework templates build to gitignored `build/` via `npm run build:templates`; demos (tracked `.mu.js`) via `npm run build:demos`. After editing `diagram.template.mu`, run `npm run build:templates`.
- Ports for migrated shapes are **bounding-box for all** (no geometry-specific providers).
- On-disk `.diagram` record format for `type:'shape'` (`kind`/`d`/`fill`/`stroke`/`strokeWidth`) is **unchanged** — existing files must still load.
- Commit/publish only when the user asks. Publishing `@pragmatic-tech-ai/mural` targets local Verdaccio only.

---

### Task 1: Figure gains an inert `Kind` provenance tag + `fromSource` kind option

**Files:**
- Modify: `src/framework/diagram/figure.ts`
- Test: `src/framework/diagram/tests/figure-kind-provenance.test.ts` (create)

**Interfaces:**
- Consumes: existing `Figure.fromKind`, `Figure.fromSource`, `Figure._setKindFromCatalog`, `FigureFromSourceOptions`.
- Produces: `Figure.Kind: string | undefined` (read-only getter); `FigureFromSourceOptions` gains `kind?: string`; `fromKind`/`fromSource` store the kind. Drives no behavior — serialization provenance only.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/figure-kind-provenance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Figure } from '../figure.js';
import { SHAPE_CATALOG_MAP } from '../shape-catalog.js';

test('fromKind records the catalog kind as inert provenance', () => {
    const f = Figure.fromKind('diamond', 0, 0, { width: 40, height: 40 });
    assert.equal(f.Kind, 'diamond');
});

test('a bare Figure and a kindless fromSource have undefined Kind', () => {
    assert.equal(new Figure().Kind, undefined);
    const src = SHAPE_CATALOG_MAP.get('ellipse')!.unit();
    const f = Figure.fromSource(src, 0, 0, { width: 40, height: 40 });
    assert.equal(f.Kind, undefined);
});

test('fromSource carries an explicit kind option through', () => {
    const src = SHAPE_CATALOG_MAP.get('ellipse')!.unit();
    const f = Figure.fromSource(src, 0, 0, { width: 40, height: 40, kind: 'ellipse' });
    assert.equal(f.Kind, 'ellipse');
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-kind-provenance.test.ts`
Expected: FAIL (`Kind` is not a property; `kind` not on `FigureFromSourceOptions`).

- [ ] **Step 3: Implement**

In `figure.ts`, add a private field beside `_source`:

```ts
// Inert catalog-kind provenance tag: set by fromKind (and fromSource's kind
// option), read only by serialization. Drives NO behavior — ports are
// bbox-for-all and rendering is geometry-driven. Undefined for a bare Figure
// or a kindless fromSource.
private _kind: string | undefined = undefined;
```

Add the getter beside the `Geometry` getter:

```ts
public get Kind(): string | undefined { return this._kind; }
```

Store it in `_setKindFromCatalog` (currently drops it):

```ts
public _setKindFromCatalog(kind: string, source: PathGeometry): void
{
    this._kind = kind;
    this._source = source;
    this._rebuildGeometry();
}
```

Extend `FigureFromSourceOptions`:

```ts
export interface FigureFromSourceOptions
{
    readonly width?:  number;
    readonly height?: number;
    readonly kind?:   string;
}
```

In `fromSource`, store the option before `_rebuildGeometry`:

```ts
f._source = source;
f._kind   = options?.kind;
f._rebuildGeometry();
```

(`fromKind` already routes through `_setKindFromCatalog`, so it stores kind automatically.)

- [ ] **Step 4: Run it, verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-kind-provenance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/figure.ts src/framework/diagram/tests/figure-kind-provenance.test.ts
git commit -m "feat(figure): inert Kind provenance tag + fromSource kind option"
```

---

### Task 2: Cutover creation + serialization of shape nodes to Figure

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`CreateNode`, the combine-selected path, deserialize type-unions)
- Modify: `src/framework/diagram/node-serializers-default.ts` (the `'shape'` serializer)
- Modify: `src/framework/diagram/toolbox/shape-drop-factory.ts` (only if it names `ShapeNodeVM` — it does not; verify)
- Test: `src/framework/diagram/tests/shape-figure-cutover.test.ts` (create)

**Interfaces:**
- Consumes: `Figure.fromKind` / `Figure.fromSource` / `Figure.Kind` / `Figure._getSource` (Task 1); `Figure.Fill` / `Figure.Stroke` (Visual); `pathGeometryToSvgD` / `pathGeometryFromSvgD` / `solidHex` / `placeNode` (already in node-serializers-default.ts); `SHAPE_CATALOG_MAP`.
- Produces: `DiagramDocument.CreateNode(kind,x,y): Figure | null`; the combine path returns a `Figure`; the `'shape'` serializer matches/serializes/deserializes `Figure`. `ShapeNodeVM` still exists (dead) after this task; deleted in Task 3.

- [ ] **Step 1: Write the failing tests**

```ts
// src/framework/diagram/tests/shape-figure-cutover.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';
import { DiagramDocument } from '../diagram-document.js';
import { serializerFor, serializerByType } from '../node-serialization.js';
import '../node-serializers-default.js';   // side-effect: registers serializers

test('CreateNode produces a self-painting Figure shape node', () => {
    const doc = new DiagramDocument();
    const node = doc.CreateNode('diamond', 10, 20);
    assert.ok(node instanceof Figure, 'CreateNode returns a Figure');
    assert.equal(node!.Kind, 'diamond');
    assert.ok(node!._getSource() !== undefined, 'has a silhouette source');
    assert.ok(doc.Nodes.includes(node!), 'added to Nodes');
});

test('a created diamond confines picking to its silhouette', () => {
    const doc = new DiagramDocument();
    const f = doc.CreateNode('diamond', 0, 0)!;
    f.Width = 80; f.Height = 60;
    const seams = f as unknown as { buildClipGeometry(s: { Width: number; Height: number }): { Contains(p: Point): boolean } };
    const g = seams.buildClipGeometry({ Width: 80, Height: 60 });
    assert.ok(g.Contains(new Point(40, 30)), 'interior inside');
    assert.ok(!g.Contains(new Point(2, 2)), 'bbox corner outside the diamond');
});

test('the shape serializer round-trips a Figure', () => {
    const doc = new DiagramDocument();
    const f = doc.CreateNode('ellipse', 5, 6)!;
    f.Width = 50; f.Height = 30;
    const s = serializerFor(f);
    assert.ok(s !== undefined && s.type === 'shape', 'shape serializer matches a Figure');
    const data = s!.serialize(f);
    assert.equal(data.kind, 'ellipse');
    const back = s!.deserialize(data, { id: 'n9', left: 5, top: 6, w: 50, h: 30 });
    assert.ok(back instanceof Figure);
    assert.equal((back as Figure).Kind, 'ellipse');
    assert.equal(back.Id, 'n9');
});

test('back-compat: an old shape record (kind + d) loads into a Figure', () => {
    const s = serializerByType('shape')!;
    const back = s.deserialize({ kind: 'triangle', d: '' }, { id: 'n1', left: 0, top: 0, w: 40, h: 40 });
    assert.ok(back instanceof Figure);
    assert.equal((back as Figure).Kind, 'triangle');
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/shape-figure-cutover.test.ts`
Expected: FAIL (`CreateNode` returns `ShapeNodeVM`; serializer matches `ShapeNodeVM`, not `Figure`).

- [ ] **Step 3: Re-key the `'shape'` serializer**

In `node-serializers-default.ts`, replace the `ShapeNodeVM` import with `Figure`, and rewrite the serializer body (format unchanged):

```ts
import { Figure } from './figure.js';   // replaces: import { ShapeNodeVM } from './shape-node-vm.js';

registerNodeSerializer({
    type: 'shape',

    // A Figure in doc.Nodes is always a self-painting shape node (container
    // Figures that wrap a VM are transient and never enter Nodes). Guard on a
    // silhouette source as belt-and-suspenders.
    matches(node: unknown): boolean
    {
        return node instanceof Figure && node._getSource() !== undefined;
    },

    serialize(node: unknown): Record<string, unknown>
    {
        const fig = node as Figure;
        const source = fig._getSource();
        const out: Record<string, unknown> = {
            kind: fig.Kind ?? '',
            d:    source !== undefined ? pathGeometryToSvgD(source) : '',
        };
        const fillHex = solidHex(fig.Fill);
        if (fillHex !== undefined) out.fill = fillHex;
        const stroke = fig.Stroke;
        if (stroke !== undefined)
        {
            const strokeHex = solidHex(stroke.Brush);
            if (strokeHex !== undefined) out.stroke = strokeHex;
            out.strokeWidth = stroke.Thickness;
        }
        return out;
    },

    deserialize(data: Record<string, unknown>, base: NodeBaseRecord): Figure
    {
        const kind = typeof data.kind === 'string' ? data.kind : '';
        const d    = typeof data.d    === 'string' ? data.d    : '';
        let fig: Figure;
        if (kind !== '' && SHAPE_CATALOG_MAP.has(kind))
        {
            fig = Figure.fromKind(kind, base.left, base.top, { width: base.w, height: base.h });
        }
        else if (d.length > 0)
        {
            fig = Figure.fromSource(pathGeometryFromSvgD(d), base.left, base.top, {
                width:  base.w,
                height: base.h,
                kind:   kind !== '' ? kind : undefined,
            });
        }
        else
        {
            fig = Figure.fromKind('rectangle', base.left, base.top, { width: base.w, height: base.h });
        }
        fig.Id = base.id;
        if (typeof data.fill === 'string') fig.Fill = new SolidColorBrush(Color.FromHex(data.fill));
        const strokeHex   = typeof data.stroke      === 'string' ? data.stroke      : undefined;
        const strokeWidth = typeof data.strokeWidth === 'number' ? data.strokeWidth : undefined;
        if (strokeHex !== undefined || strokeWidth !== undefined)
        {
            const width = strokeWidth ?? fig.Stroke?.Thickness ?? 1;
            const brush = strokeHex !== undefined ? new SolidColorBrush(Color.FromHex(strokeHex)) : fig.Stroke?.Brush;
            fig.Stroke = new Pen(brush, width);
        }
        return fig;
    },
});
```

- [ ] **Step 4: Flip `CreateNode` and the combine path**

In `diagram-document.ts`, change `CreateNode` (near line 587):

```ts
public CreateNode(kind: string, x: number, y: number): Figure | null
{
    if (!SHAPE_CATALOG_MAP.has(kind)) return null;
    const node = Figure.fromKind(kind, x, y);
    node.Id = 'n' + this._nextId++;
    this.Nodes.Add(node);
    this._markDirty();
    return node;
}
```

In the combine-selected path (near line 798–816): collect `Figure` shape leaves (a `Figure` with `_getSource() !== undefined`) instead of `ShapeNodeVM`, and produce a `Figure`:

```ts
const leaves: Figure[] = [];
for (const item of /* current source */)
{
    if (item instanceof Figure && item._getSource() !== undefined) leaves.push(item);
}
// … merge geometry as before …
const result = Figure.fromSource(merged.source, merged.x, merged.y, {
    width:  merged.w,
    height: merged.h,
});
```

Update the deserialize type-unions in `diagram-document.ts` (lines ~940, 942, 967, 975, 1000, 1136) to drop `ShapeNodeVM` from the `Figure | ShapeNodeVM | TextNodeVM | CalloutNodeVM` unions → `Figure | TextNodeVM | CalloutNodeVM`. Remove the now-unused `import { ShapeNodeVM }` at line 17 (and the `instanceof ShapeNodeVM` at 805 is replaced by the `Figure` check above).

Verify `shape-drop-factory.ts` needs no change (it returns `context.Mutator.CreateNode(...)` as `unknown` — now a Figure; fine).

- [ ] **Step 5: Run the new tests + the serialization suite**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/shape-figure-cutover.test.ts`
Expected: PASS.
Then run the existing serialize/roundtrip tests that don't depend on the deleted class yet:
Run: `npx tsx --conditions=development --test src/framework/diagram/tests/m3-node-serialize.test.ts`
Expected: may FAIL where it constructs `ShapeNodeVM` directly — that is migrated in Task 4. Note failures; do not fix here.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/diagram-document.ts src/framework/diagram/node-serializers-default.ts src/framework/diagram/tests/shape-figure-cutover.test.ts
git commit -m "feat(diagram): shapes are self-painting Figures — CreateNode/combine/serializer cutover"
```

---

### Task 3: Delete `ShapeNodeVM`, its template, symbol, and barrel export

**Files:**
- Delete: `src/framework/diagram/shape-node-vm.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (remove `[DataType=ShapeNodeVM]` block + its comment)
- Modify: `src/compiler/symbol-table.ts` (remove the `ShapeNodeVM` entry, line ~219)
- Modify: `src/framework/index.ts` (remove the export, line ~206)
- Modify: comment-only references in `figure.ts`, `node-view-model.ts`, `node-serialization.ts`, `side-connectable-node-vm.ts`, `side-endpoint-host.ts`, `connector.ts` (update prose to not name the deleted class)

**Interfaces:**
- Consumes: Task 2 (nothing in production constructs `ShapeNodeVM` anymore).
- Produces: `ShapeNodeVM` no longer exists; the type-checker enumerates any straggler.

- [ ] **Step 1: Delete the class + template + symbol + export**

```bash
git rm src/framework/diagram/shape-node-vm.ts
```

In `diagram.template.mu`, delete the `// ── ShapeNodeVM …` comment block and the `DataTemplate [DataType = ShapeNodeVM] { Shape [ … ] }` block (lines ~40–48).
In `symbol-table.ts`, delete the `['ShapeNodeVM', '…/shape-node-vm.js'],` row (~219).
In `framework/index.ts`, delete `export { ShapeNodeVM } from './diagram/shape-node-vm.js';` (~206).

- [ ] **Step 2: Let the type-checker enumerate stragglers**

Run: `npm run typecheck`
Expected: errors only at the comment/type-union sites not yet touched, and in the Task-4 test files. Fix the **production** comment references (rephrase prose; no `ShapeNodeVM` token) in `figure.ts`, `node-view-model.ts`, `node-serialization.ts`, `side-connectable-node-vm.ts`, `side-endpoint-host.ts`, `connector.ts`. Leave test-file errors for Task 4.

- [ ] **Step 3: Rebuild templates**

Run: `npm run build:templates`
Expected: compiles with no `ShapeNodeVM` symbol reference.

- [ ] **Step 4: Verify production typecheck is clean (tests aside)**

Run: `npm run typecheck` — production `.ts` clean; remaining errors are only in `tests/**` that construct `ShapeNodeVM` (handled next).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(diagram): remove ShapeNodeVM class, template, symbol, export"
```

---

### Task 4: Migrate or prune the `ShapeNodeVM` test suite

**Files (test-only; ~18 files reference `ShapeNodeVM`):**
- Delete: `src/framework/diagram/tests/shape-node-vm.test.ts` (tested the deleted class directly — obsolete)
- Migrate to `Figure`: `tests/shape-node-format-roundtrip.test.ts`, `tests/m2-shape-render.test.ts`, `tests/m2-combine-vm.test.ts`, `tests/m2-serialize-resize.test.ts`, `tests/m3-node-serialize.test.ts`, `tests/m3-connector-vm.test.ts`, `tests/m-addnode.test.ts`, `tests/diagram-document-connectors.test.ts`, `tests/delete-node-connector-cascade.test.ts`, and the `m4-*` VM tests (`m4-side-connectable-node-vm`, `m4-vm-port-routing`, `m4-vm-ports`, `m4-group-vm-members`, `m4-callout-node-vm`), plus `framework/tests/items-control-incremental-projection.test.ts`, `diagram-position-after-insert.test.ts`, `diagram-align-distribute.test.ts`.

**Migration rule per file:** replace `ShapeNodeVM.fromKind(k, …)` / `.fromSource(s, …)` with `Figure.fromKind` / `Figure.fromSource`; replace `instanceof ShapeNodeVM` with `instanceof Figure` (guard `_getSource()` where "is it a shape" is meant); drop assertions on the deleted `Geometry` DP binding in favour of `_getSource()` / the geometry seams. Where a test only exercised the VM-container plumbing that no longer exists (e.g. `[DataType=ShapeNodeVM]` template projection), delete the obsolete case and note it in the commit body. `m4-*` tests that assert side-endpoint behavior should target `Figure` (which implements the same `ISideEndpointHost`). Do **not** touch `TextNodeVM`/`CalloutNodeVM`/`ArchNodeVM` tests.

- [ ] **Step 1: Migrate one file, run it green, repeat**

For each file above: edit per the rule, then
Run: `npx tsx --conditions=development --test <file>`
Expected: PASS. Work file-by-file; do not batch-edit blindly.

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: all green, 0 fail. No file references `ShapeNodeVM`.
Verify: `git grep -n ShapeNodeVM src/` returns nothing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(diagram): migrate ShapeNodeVM tests to self-painting Figure"
```

---

### Task 5: Finish the Mural branch

- [ ] **Step 1:** Run the full suite one last time: `npm test` → all green.
- [ ] **Step 2:** REQUIRED SUB-SKILL: use superpowers:finishing-a-development-branch to present merge/PR/keep options and execute the user's choice. Do not push or publish without the user asking.

---

### Task 6: Plexus rollout (cross-repo; needs publish + live smoke)

**Files:** `Plexus/` — `package.json` mural dep; any `ShapeNodeVM` reference (sweep).

- [ ] **Step 1:** Sweep Plexus: `git -C ../Plexus grep -n ShapeNodeVM src/` — expect the standalone-fallback path and possibly type imports. Update any `ShapeNodeVM` reference to `Figure` (the fallback `CreateNode` now returns a Figure; `ArchNodeVM` is untouched).
- [ ] **Step 2:** Publish mural to Verdaccio (only when the user asks): bump version, `npm publish` (prepublishOnly builds; targets localhost:4873).
- [ ] **Step 3:** Bump Plexus dep to the new mural, `npm install` from Verdaccio.
- [ ] **Step 4:** Run the Plexus suite: `npm test` (vitest) → green.
- [ ] **Step 5:** Live smoke (human): open a standalone diagram, drop a diamond/triangle, confirm clicking a bbox corner outside the shape does NOT select it, and that connectors/selection/save-reload still work.

---

## Self-review

- **Spec coverage:** creation (Task 2), serialization + back-compat (Task 2), deletion (Task 3), ports=bbox (inherited — Figure default, no code), Plexus (Task 6), mixed-model + connectors (no rewiring — verified in design). Kind-as-provenance (Task 1). All covered.
- **Placeholder scan:** none — every code step carries real code or a concrete per-file rule.
- **Type consistency:** `CreateNode: Figure | null`, serializer `deserialize: Figure`, `Figure.Kind: string | undefined`, `FigureFromSourceOptions.kind?: string` used consistently across tasks.
- **Ordering safety:** Task 2 keeps the tree green (created shapes both render and serialize; `ShapeNodeVM` remains as dead code until Task 3). Task 3 removes the class after nothing constructs it. Task 4 clears the test debt Task 3's typecheck surfaces.
