# M2 — Shapes on the VM Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development — fresh implementer per task, review between.

**Goal:** Freeform shapes become `ShapeNodeVM`s rendered by a `[DataType=ShapeNodeVM]` DataTemplate in the M1 container; `CreateNode`/`Combine`/`Delete` operate on VMs; resize rescales geometry through the container→VM binding.

**Architecture:** `ShapeNodeVM extends NodeViewModel` ports `Figure`'s geometry logic. The container hosts its DataTemplate (M1). The intrinsic `PART_Shape` stays inert for VM shapes.

**Tech Stack:** mural framework (TypeScript), node:test, `.mu`.

## Global Constraints

- Test files live in a `tests/` subfolder next to their source.
- Real TS enums; no string-literal unions. No `../src` cross-package imports.
- The `diagram-distribute-newarch` suite stays green EXCEPT its two group cases, which
  are `test.skip`ped with a `TODO(M4: groups on VM engine)` comment (groups are M4).
- Reference for the geometry port: `src/framework/diagram/figure.ts`
  (`fromKind`, `_setKindFromCatalog`, `_rebuildGeometry`, `_source`, `Geometry`/`Fill`/
  `Stroke`, `DEFAULT_FILL`, `OnPropertyChanged` Width/Height branch).

---

### Task 1: `ShapeNodeVM` geometry class

**Files:**
- Create: `src/framework/diagram/shape-node-vm.ts`
- Test: `src/framework/diagram/tests/shape-node-vm.test.ts`

**Interfaces — Produces:**
- `class ShapeNodeVM extends NodeViewModel` with DPs `Kind:string`, `Geometry:PathGeometry|undefined`, `Fill:Brush|undefined`, `Stroke:Pen|undefined`; private `_source`; `static fromKind(kind,left,top,opts?)`, `static fromSource(source,left,top,opts?)`, `_getSource()`. Satisfies `CombinableShape` (`Geometry`/`Left`/`Top`).

- [ ] **Step 1: Write failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShapeNodeVM } from '../shape-node-vm.js';

test('fromKind builds source + scaled geometry and rescales on size change', () => {
    const vm = ShapeNodeVM.fromKind('rectangle', 10, 20, { width: 40, height: 30 });
    assert.equal(vm.Kind, 'rectangle');
    assert.equal(vm.Left, 10);
    assert.equal(vm.Top, 20);
    assert.ok(vm.Geometry !== undefined, 'geometry built');
    assert.ok(vm._getSource() !== undefined, 'unit-1 source cached');
    const before = vm.Geometry;
    vm.Width = 80;                    // size change rebuilds geometry
    assert.notEqual(vm.Geometry, before, 'geometry rescaled on width change');
});

test('satisfies CombinableShape (Geometry/Left/Top present)', () => {
    const vm = ShapeNodeVM.fromKind('ellipse', 5, 6);
    assert.equal(typeof vm.Left, 'number');
    assert.equal(typeof vm.Top, 'number');
    assert.ok('Geometry' in vm);
});
```

- [ ] **Step 2: Run, verify FAIL** (module not found).

- [ ] **Step 3: Implement** — port `Figure`'s geometry logic onto `NodeViewModel`. Read
`figure.ts` for the exact bodies of `fromKind` / `_setKindFromCatalog` /
`_rebuildGeometry` and the `DEFAULT_FILL` / default `Stroke` (`new Pen(DEFAULT_STROKE_BRUSH,
DiagramSettings.ShapeStrokeWidth())`). Structure:

```ts
import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { Brush, Color, Pen, SolidColorBrush, type PathGeometry } from '../../visual-engine/index.js';
import { SHAPE_CATALOG_MAP, scaleGeometry } from './shape-catalog.js';
import { DiagramSettings } from './diagram-settings.js';
import { NodeViewModel } from './node-view-model.js';

const DEFAULT_FILL         = new SolidColorBrush(Color.FromHex('#bfdbfe'));
const DEFAULT_STROKE_BRUSH = new SolidColorBrush(Color.FromHex('#1976d2'));

export interface ShapeFromKindOptions   { readonly width?: number; readonly height?: number; }
export interface ShapeFromSourceOptions { readonly width?: number; readonly height?: number; readonly kind?: string; }

export class ShapeNodeVM extends NodeViewModel
{
    public static readonly KindKey     = Model.RegisterProperty<string>(ShapeNodeVM, 'Kind', '', MetaData.None);
    public static readonly GeometryKey = Model.RegisterProperty<PathGeometry | undefined>(ShapeNodeVM, 'Geometry', undefined, MetaData.None);
    public static readonly FillKey     = Model.RegisterProperty<Brush | undefined>(ShapeNodeVM, 'Fill', DEFAULT_FILL, MetaData.None);
    public static readonly StrokeKey   = Model.RegisterProperty<Pen | undefined>(ShapeNodeVM, 'Stroke', undefined, MetaData.None);

    private _source: PathGeometry | undefined = undefined;

    constructor()
    {
        super();
        this.set_property_value(ShapeNodeVM.StrokeKey, new Pen(DEFAULT_STROKE_BRUSH, DiagramSettings.ShapeStrokeWidth()));
    }

    public static fromKind(kind: string, left: number, top: number, opts?: ShapeFromKindOptions): ShapeNodeVM
    {
        const entry = SHAPE_CATALOG_MAP.get(kind);
        if (entry === undefined) throw new Error(`ShapeNodeVM.fromKind: unknown kind '${kind}'`);
        const vm = new ShapeNodeVM();
        vm.Left = left; vm.Top = top;
        vm.Width  = opts?.width  ?? DiagramSettings.ShapeDefaultSize();
        vm.Height = opts?.height ?? DiagramSettings.ShapeDefaultSize();
        vm.set_property_value(ShapeNodeVM.KindKey, kind);
        vm._source = entry.unit();
        vm._rebuildGeometry();
        return vm;
    }

    public static fromSource(source: PathGeometry, left: number, top: number, opts?: ShapeFromSourceOptions): ShapeNodeVM
    {
        const vm = new ShapeNodeVM();
        vm.Left = left; vm.Top = top;
        vm.Width  = opts?.width  ?? DiagramSettings.ShapeDefaultSize();
        vm.Height = opts?.height ?? DiagramSettings.ShapeDefaultSize();
        if (opts?.kind !== undefined) vm.set_property_value(ShapeNodeVM.KindKey, opts.kind);
        vm._source = source;
        vm._rebuildGeometry();
        return vm;
    }

    public get Kind(): string { return this.get_property_value(ShapeNodeVM.KindKey); }
    public get Geometry(): PathGeometry | undefined { return this.get_property_value(ShapeNodeVM.GeometryKey); }
    public get Fill(): Brush | undefined { return this.get_property_value(ShapeNodeVM.FillKey); }
    public set Fill(v: Brush | undefined) { this.set_property_value(ShapeNodeVM.FillKey, v); }
    public get Stroke(): Pen | undefined { return this.get_property_value(ShapeNodeVM.StrokeKey); }
    public set Stroke(v: Pen | undefined) { this.set_property_value(ShapeNodeVM.StrokeKey, v); }

    public _getSource(): PathGeometry | undefined { return this._source; }

    private _rebuildGeometry(): void
    {
        if (this._source === undefined) return;
        this.set_property_value(ShapeNodeVM.GeometryKey, scaleGeometry(this._source, this.Width, this.Height));
    }

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if ((descriptor.Name === 'Width' || descriptor.Name === 'Height') && this._source !== undefined) this._rebuildGeometry();
    }
}
```
Verify every import path + API (`Pen`, `Color.FromHex`, `SolidColorBrush`, `scaleGeometry`, `SHAPE_CATALOG_MAP`, `DiagramSettings.ShapeStrokeWidth`) against `figure.ts`, which imports the same. Match `figure.ts` exactly where it differs.

- [ ] **Step 4: Run tests, verify PASS. Run typecheck, clean.**
- [ ] **Step 5: Commit** (`feat(diagram): ShapeNodeVM geometry view-model`).

---

### Task 2: Shape DataTemplate

**Files:**
- Modify: `src/framework/diagram/diagram.template.mu`
- Test: `src/framework/diagram/tests/m2-shape-render.test.ts`

**Interfaces — Consumes:** `ShapeNodeVM` (Task 1), M1 container. **Produces:** a `[DataType=ShapeNodeVM]` template.

- [ ] **Step 1:** Add to the `Diagrams` resources block (near `DefaultFigure`), matching the `Shape` binding shape the `DefaultFigure`'s `PART_Shape` uses:
```
DataTemplate [ DataType = ShapeNodeVM ] {
    Shape [ Geometry = $Geometry, Fill = $Fill, Stroke = $Stroke, Width = $Width, Height = $Height ]
}
```
Add the `import ShapeNodeVM from "./shape-node-vm.js"` (or the `.mu` import form this file uses for TS types — grep the file for an existing `import` line and match it).

- [ ] **Step 2: Write test** — add a `ShapeNodeVM` (`ShapeNodeVM.fromKind('rectangle', 30, 20)`) to `doc.Nodes`, lay out (reuse the M1 test's build/layout pattern), get the container, assert a `Shape` (import from `basic`/`visual-engine` — find where `Shape` is exported) with a defined `Geometry` exists in the container subtree (via a `collectVisuals` walk), and no unresolved-template error TextBlock.

- [ ] **Step 3: Run** the new test (PASS) + `diagram-distribute-newarch` (still green — the intrinsic path is unchanged here). Typecheck clean.

- [ ] **Step 4: Commit** (`feat(diagram): ShapeNodeVM DataTemplate`).

---

### Task 3: `CreateNode`/`DeleteNodes` emit + handle VMs; migrate distribute tests

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`CreateNode`, `DeleteNodes`)
- Modify: `src/framework/tests/diagram-distribute-newarch.test.ts`

**Interfaces — Consumes:** `ShapeNodeVM`. **Produces:** `CreateNode` returns `ShapeNodeVM | null`.

- [ ] **Step 1: Migrate the regression test first** so it drives the change. In
`diagram-distribute-newarch.test.ts`: `CreateNode` now returns a `ShapeNodeVM`; the
Distribute/Align assertions on `.Left`/`.Top` still hold on the VM, but `.ArrangedRect`
must read the container: add a helper `const rect = (vm) => diagram.Generator.ContainerFromItem(vm)!.ArrangedRect;` and replace `b.ArrangedRect?.X` → `rect(b)?.X`, etc. `test.skip` the two group cases (`Dragging a Figure inside a Group…`, `AlignCenter with a Group…`) with a `// TODO(M4: groups on VM engine)` comment. Keep the `CombineUnion` case working IF it doesn't depend on groups (it combines two rectangles — leave it; Task 4 makes Combine emit VMs, so this may need `rect()` too — coordinate: if it fails after Task 3, it is fixed in Task 4).

- [ ] **Step 2: Run, verify the non-skipped distribute/align tests FAIL** (CreateNode still returns a Figure → `Generator.ContainerFromItem(figure)` returns the figure itself, whose ArrangedRect works — so the test may still pass. If so, the real failure appears after Step 3). Note the state.

- [ ] **Step 3: Implement** in `diagram-document.ts`:
```ts
// CreateNode:
public CreateNode(kind: string, x: number, y: number): ShapeNodeVM | null
{
    if (!SHAPE_CATALOG_MAP.has(kind)) return null;
    const vm = ShapeNodeVM.fromKind(kind, x, y);
    vm.Id = 'n' + this._nextId++;     // if NodeViewModel lacks Id, add an Id DP to NodeViewModel (see note)
    this.Nodes.Add(vm);
    this.Status = `Placed ${kind}. ${this.Nodes.Count} nodes.`;
    this._markDirty();
    return vm;
}
// DeleteNodes: broaden the instanceof guard to include NodeViewModel:
//   if (!(item instanceof Figure || item instanceof Group || item instanceof NodeViewModel)) continue;
```
**Id note:** `Nodes` needs a stable id per node for serialize/connectors. `NodeViewModel`
has no `Id` today. Add an `Id: string | undefined` DP to `NodeViewModel` (Task 1's file)
if not present — do this as part of this task, with a one-line test in the node-view-model
test. Import `ShapeNodeVM` + `NodeViewModel` into `diagram-document.ts`. `Nodes` is typed
`ObservableCollection<Figure | Group>` — widen to `Figure | Group | NodeViewModel` and fix
the resulting type errors at call sites minimally (prefer widening the element type over
casts).

- [ ] **Step 4: Run** distribute/align (non-skipped) — PASS via container ArrangedRect. Typecheck clean.
- [ ] **Step 5: Commit** (`feat(diagram): CreateNode emits ShapeNodeVM; Delete handles VMs`).

---

### Task 4: `CombineSelection` emits `ShapeNodeVM`

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`CombineSelection`)
- Test: `src/framework/diagram/tests/m2-combine-vm.test.ts`

- [ ] **Step 1: Write failing test** — `CreateNode` two rectangles, `CombineSelection([a,b], GeometryCombineMode.Union)`; assert `Nodes` now contains one `ShapeNodeVM` and the two inputs are gone; the result has a defined `Geometry`.

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** — collect `ShapeNodeVM` leaves from `items` (skip Figure Groups — M4), `mergeShapes(leaves, mode)` (leaves satisfy `CombinableShape`), then:
```ts
const result = ShapeNodeVM.fromSource(merged.source, merged.x, merged.y, { width: merged.w, height: merged.h });
result.Id = 'n' + this._nextId++;
result.Fill = template.Fill;
if (template.Stroke !== undefined) { const P = template.Stroke.constructor as ...; result.Stroke = new P(template.Stroke.Brush, template.Stroke.Thickness); }
```
Replace inputs in `Nodes`; select the result.

- [ ] **Step 4: Run** new test + the newarch `CombineUnion` case (update to `rect()` if needed) — PASS. Typecheck clean.
- [ ] **Step 5: Commit** (`feat(diagram): CombineSelection emits ShapeNodeVM`).

---

### Task 5: Serialize interim + resize

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`_serialize`, `_deserialize`)
- Test: `src/framework/diagram/tests/m2-serialize-interim.test.ts`

- [ ] **Step 1: Write failing tests** — (a) Save then Load a `CreateNode('rectangle', 12, 34)` scene; the reloaded node is a `ShapeNodeVM` at (12,34) with the right `Kind`. (b) Resize: set the node's container `Figure.Width` and assert the `ShapeNodeVM.Geometry` rescaled (proves the container→VM→geometry chain).

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** — in `_serialize`, for a `ShapeNodeVM` node emit the same
`{id,kind,left,top,w,h,d}` record (read `vm.Kind`/`Left`/`Top`/`Width`/`Height`/
`_getSource()`→`pathGeometryToSvgD`). In `_deserialize`, build the node via
`ShapeNodeVM.fromKind`/`fromSource` (instead of `Figure.fromKind`/`fromSource`) so a
loaded scene is on the VM path. Keep Figure/Text/Callout branches for the not-yet-migrated
kinds. This is throwaway (M3 replaces it).

- [ ] **Step 4: Run** new tests + full serialize regression (any `diagram-document` save/load
tests) — green. Typecheck clean.
- [ ] **Step 5: Commit** (`feat(diagram): interim ShapeNodeVM serialize + resize chain`).

---

### Task 6: Suite + demo gate

- [ ] **Step 1:** Full mural `npm test` — green except the two intentionally-skipped group cases.
- [ ] **Step 2:** `npm run typecheck` — clean.
- [ ] **Step 3:** Compile the demo (`demo/demos/diagram`) if it has a build/typecheck; confirm no shape-path breakage (group/connector actions are the known M3/M4 gap).
- [ ] **Step 4:** Report skipped-test list + any demo gaps. Branch stays for M3.

## Self-Review

- Spec coverage: ShapeNodeVM (T1), template (T2), CreateNode/Delete + test migration (T3),
  Combine (T4), serialize interim + resize (T5), gate (T6). ✓
- Placeholders: the `Id` DP addition is specified inline in T3; the `Shape` import location
  is flagged for the implementer to resolve in T2. No code-step placeholders.
- Types: `CreateNode: ShapeNodeVM | null`; `Nodes` element type widened to include
  `NodeViewModel`; `mergeShapes` consumes `ShapeNodeVM` via `CombinableShape`.
