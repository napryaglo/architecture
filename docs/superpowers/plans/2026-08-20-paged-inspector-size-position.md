# Paged Diagram Inspector + Size/Position Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the diagram inspector into a multipage view (horizontal `NavigationRail`) whose page 1 is the existing shape-style control and page 2 is a PowerPoint-style Size & Position editor bound to the selected shape.

**Architecture:** All in `@pragmatic-lab/mural` framework. `Figure` gains `Rotation` + `BaseWidth/BaseHeight` DPs (rotation applied as a `RenderTransform` `RotateTransform`; both persisted in the shape serializer's `data` payload). A `SelectionGeometryMirror` collaborator on `Diagram` mirrors the single selected `Figure`'s geometry into writable `SelectedShape*` DPs (seed on selection/geometry change, write-back on edit). A new `SizePositionControl` holds the anchor/scale/lock conversions. `DiagramInspector` becomes a paged container (`Pages` + `SelectedPage`) rendered by a horizontally-restyled `NavigationRail` + `ContentPresenter`, with a `DataTemplate` per page-model type.

**Tech Stack:** TypeScript, Mural WPF-style framework (DPs via `Model.RegisterProperty`), `.template.mu` markup compiled by `npm run build:templates`, `node:test` runner via `tsx`.

**Spec:** `Mural/docs/superpowers/specs/2026-08-20-paged-inspector-size-position-design.md`

## Global Constraints

- **Home:** all code in `Mural/src/framework/diagram` (+ `src/compiler/symbol-table.ts`, `src/framework/index.ts`). Consumed by Plexus via a version bump; publish **only** to local Verdaccio `http://localhost:4873` (never public npm).
- **Units:** native pixels everywhere. No inches/DPI conversion.
- **Tests:** every test file lives in a `tests/` subfolder next to its source (e.g. `src/framework/diagram/tests/…`).
- **Enums:** a fixed set of named strings is a real `enum` with explicit string values; markup-facing enums are ALSO registered in `src/compiler/symbol-table.ts` (`ENUM_MEMBERS` + `DEFAULT_SYMBOLS`). No string-literal unions.
- **Every control has a default Style** in a `*.template.mu`; the ctor calls `applyDefaultStyle()` then reads DPs. No `resolveXxxTemplate` string lookups.
- **Render through templates:** visible chrome flows through `DataTemplate`/`Style`/`Binding` from `.mu`; no hardcoded chrome in renderer code.
- **No `node:fs`/`node:path`** in framework/renderer code.
- **Commit** only when the user asks; branch first if on `main`. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Scope (non-goals):** Text Box section (sub-project 2); rotation-aware selection/resize adorners; multi-select & connector geometry editing. Size/Position fields target a single selected `Figure` only.
- **Test commands:** single — `npx tsx --conditions=development --test <path>`; full — `npm test`; templates — `npm run build:templates`; typecheck — `npx tsc --noEmit`.

---

### Task 1: Figure geometry additions — Rotation + BaseWidth/BaseHeight

**Files:**
- Modify: `Mural/src/framework/diagram/figure.ts` (add DPs near line 160; factory seeding at `fromKind` ~244 and `fromSource` ~255; ctor ~340; `OnPropertyChanged`)
- Test: `Mural/src/framework/diagram/tests/figure-rotation.test.ts`

**Interfaces:**
- Produces: `Figure.RotationKey`, `Figure.BaseWidthKey`, `Figure.BaseHeightKey`; accessors `Rotation: number`, `BaseWidth: number`, `BaseHeight: number`. Rotation renders via a persistent `RotateTransform` on `RenderTransform` with `RenderTransformOrigin=(0.5,0.5)`.

- [ ] **Step 1: Write the failing test**

```ts
// figure-rotation.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { RotateTransform } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';

describe('Figure rotation + base size', () => {
    test('setting Rotation installs a RotateTransform with that angle and centered origin', () => {
        Application.current = null; new Application();
        const f = Figure.fromKind('rectangle', 0, 0, { width: 80, height: 40 });
        assert.equal(f.Rotation, 0);
        f.Rotation = 30;
        const t = f.RenderTransform;
        assert.ok(t instanceof RotateTransform, 'RenderTransform is a RotateTransform');
        assert.equal((t as RotateTransform).Angle, 30);
        assert.equal(f.RenderTransformOrigin.X, 0.5);
        assert.equal(f.RenderTransformOrigin.Y, 0.5);
    });
    test('BaseWidth/BaseHeight seed from the factory size', () => {
        Application.current = null; new Application();
        const f = Figure.fromKind('rectangle', 0, 0, { width: 120, height: 60 });
        assert.equal(f.BaseWidth, 120);
        assert.equal(f.BaseHeight, 60);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-rotation.test.ts`
Expected: FAIL (`f.Rotation` undefined / `BaseWidth` undefined).

- [ ] **Step 3: Implement the DPs, render-rotate, and seeding**

In `figure.ts`, add the import (extend the existing `visual-engine` import) with `RotateTransform` and ensure `Point` is available (already imported as a type — import the value):

```ts
// top of figure.ts — value import for Point + RotateTransform
import { type Geometry, type PathGeometry, Point, Pen, RotateTransform } from '../../visual-engine/index.js';
```

Add DPs alongside the existing `IdKey`/`IsSelectedKey` block (~line 160):

```ts
    // Visual rotation in degrees (clockwise). Applied as a RenderTransform only —
    // it does NOT affect layout/measure, so Width/Height stay the unrotated Size
    // (matches PowerPoint). Selection/resize adorners remain axis-aligned (a
    // documented follow-up). Two-way so the inspector can bind it.
    public static readonly RotationKey = Model.RegisterProperty<number>(
        Figure, 'Rotation', 0, MetaData.Render | MetaData.BindsTwoWayByDefault);

    // The shape's baseline size, seeded at creation. Scale % in the inspector is
    // size ÷ base × 100. Persisted so scale is stable across load.
    public static readonly BaseWidthKey = Model.RegisterProperty<number>(
        Figure, 'BaseWidth', Number.NaN, MetaData.None);
    public static readonly BaseHeightKey = Model.RegisterProperty<number>(
        Figure, 'BaseHeight', Number.NaN, MetaData.None);
```

Add accessors near the `Left`/`Top` accessors (~line 462):

```ts
    public get Rotation(): number { return this.get_property_value(Figure.RotationKey); }
    public set Rotation(v: number) { this.set_property_value(Figure.RotationKey, v); }
    public get BaseWidth(): number { return this.get_property_value(Figure.BaseWidthKey); }
    public set BaseWidth(v: number) { this.set_property_value(Figure.BaseWidthKey, v); }
    public get BaseHeight(): number { return this.get_property_value(Figure.BaseHeightKey); }
    public set BaseHeight(v: number) { this.set_property_value(Figure.BaseHeightKey, v); }
```

Add a persistent transform field + apply method (place the field with the other private fields; method anywhere in the class):

```ts
    private _rotate: RotateTransform | undefined;

    private _applyRotation(): void
    {
        const angle = this.Rotation;
        if (this._rotate === undefined)
        {
            if (angle === 0) return;                 // stay transform-free until first rotate
            this._rotate = new RotateTransform();
            this.RenderTransformOrigin = new Point(0.5, 0.5);
            this.RenderTransform = this._rotate;
        }
        this._rotate.Angle = angle;                  // Angle is MetaData.Render → repaints
    }
```

Hook it in `OnPropertyChanged`. Figure already overrides `OnPropertyChanged` for label-field re-resolution (`FIELD_SOURCE_NAMES`). Add a branch (call `super` first, as the existing override does):

```ts
        if (descriptor.Name === 'Rotation') this._applyRotation();
```

Seed base size. In `fromKind`, after `f._setKindFromCatalog(kind, entry.unit());` and before `return f;`:

```ts
        f.BaseWidth  = f.Width;
        f.BaseHeight = f.Height;
```

In `fromSource`, after `f._rebuildGeometry();` and before `return f;`:

```ts
        f.BaseWidth  = f.Width;
        f.BaseHeight = f.Height;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/figure-rotation.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/figure.ts src/framework/diagram/tests/figure-rotation.test.ts
git commit -m "feat(figure): Rotation + BaseWidth/BaseHeight DPs with render-rotate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Persist rotation + base size in the shape serializer

**Files:**
- Modify: `Mural/src/framework/diagram/node-serializers-default.ts` (shape `serialize` ~line 152; `deserialize` ~line 188)
- Test: `Mural/src/framework/diagram/tests/shape-serialize-rotation.test.ts`

**Interfaces:**
- Consumes: `Figure.Rotation/BaseWidth/BaseHeight` (Task 1).
- Produces: shape `data` payload keys `rotation?`, `baseWidth?`, `baseHeight?`. `NodeBaseRecord` and `diagram-document.ts` are UNCHANGED (these ride in the type-specific `data`).

- [ ] **Step 1: Write the failing test**

```ts
// shape-serialize-rotation.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { defaultNodeSerializers } from '../node-serializers-default.js';

function shapeSerializer() {
    const s = defaultNodeSerializers().find(x => x.type === 'shape');
    assert.ok(s, 'shape serializer present');
    return s!;
}

describe('shape serialize rotation + base size', () => {
    test('round-trips rotation and base size', () => {
        Application.current = null; new Application();
        const f = Figure.fromKind('rectangle', 5, 6, { width: 120, height: 60 });
        f.Rotation = 45; f.Width = 240;   // scaled 2x from base 120
        const data = shapeSerializer().serialize(f);
        assert.equal(data.rotation, 45);
        assert.equal(data.baseWidth, 120);
        assert.equal(data.baseHeight, 60);
        const back = shapeSerializer().deserialize(data, { id: 'n1', left: 5, top: 6, w: 240, h: 60 }) as Figure;
        assert.equal(back.Rotation, 45);
        assert.equal(back.BaseWidth, 120);
        assert.equal(back.BaseHeight, 60);
    });
    test('legacy record (no rotation/base) loads as rotation 0, base = size', () => {
        Application.current = null; new Application();
        const back = shapeSerializer().deserialize({ kind: 'rectangle' }, { id: 'n2', left: 0, top: 0, w: 80, h: 40 }) as Figure;
        assert.equal(back.Rotation, 0);
        assert.equal(back.BaseWidth, 80);
        assert.equal(back.BaseHeight, 40);
    });
});
```

> Note: confirm the exported factory name (`defaultNodeSerializers`) by opening `node-serializers-default.ts`; if the export differs (e.g. `DEFAULT_NODE_SERIALIZERS`), use that name in the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/shape-serialize-rotation.test.ts`
Expected: FAIL (`data.rotation` undefined).

- [ ] **Step 3: Implement serialize/deserialize additions**

In `node-serializers-default.ts` shape `serialize`, after the stroke block and before `return out;`:

```ts
        if (fig.Rotation !== 0) out.rotation = fig.Rotation;
        if (!Number.isNaN(fig.BaseWidth))  out.baseWidth  = fig.BaseWidth;
        if (!Number.isNaN(fig.BaseHeight)) out.baseHeight = fig.BaseHeight;
```

In shape `deserialize`, after the Fill/Stroke restoration and before `return fig;`:

```ts
        if (typeof data.rotation   === 'number') fig.Rotation   = data.rotation;
        if (typeof data.baseWidth  === 'number') fig.BaseWidth  = data.baseWidth;
        if (typeof data.baseHeight === 'number') fig.BaseHeight = data.baseHeight;
```

(The `fromKind`/`fromSource` calls already seed `BaseWidth/BaseHeight` from `base.w/base.h`, so the legacy path yields base = size for free.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/shape-serialize-rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/node-serializers-default.ts src/framework/diagram/tests/shape-serialize-rotation.test.ts
git commit -m "feat(diagram): persist shape rotation + base size in serializer payload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: PositionAnchor enum + symbol-table registration

**Files:**
- Create: `Mural/src/framework/diagram/position-anchor.ts`
- Modify: `Mural/src/compiler/symbol-table.ts` (`DEFAULT_SYMBOLS`/`ENTRIES` ~line 215; `ENUM_MEMBERS` ~line 537), `Mural/src/framework/index.ts` (export)
- Test: `Mural/src/framework/diagram/tests/position-anchor.test.ts`

**Interfaces:**
- Produces: `enum PositionAnchor { TopLeftCorner = 'TopLeftCorner', Center = 'Center' }`, registered for markup.

- [ ] **Step 1: Write the failing test**

```ts
// position-anchor.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PositionAnchor } from '../position-anchor.js';
import { ENUM_MEMBERS } from '../../../compiler/symbol-table.js';

describe('PositionAnchor', () => {
    test('has the two PowerPoint "From" anchors', () => {
        assert.equal(PositionAnchor.TopLeftCorner, 'TopLeftCorner');
        assert.equal(PositionAnchor.Center, 'Center');
    });
    test('is registered as a markup enum', () => {
        const members = ENUM_MEMBERS.get('PositionAnchor');
        assert.ok(members, 'PositionAnchor registered in ENUM_MEMBERS');
        assert.ok(members!.has('TopLeftCorner') && members!.has('Center'));
    });
});
```

> Confirm `ENUM_MEMBERS` is exported from `symbol-table.ts`; if it is not, export it (add `export` to its declaration) as part of this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/position-anchor.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the enum + register it**

`position-anchor.ts`:

```ts
// The "From" reference corner for a shape's Horizontal/Vertical position, matching
// PowerPoint's Format-Shape > Position "From" dropdown (two options).
export enum PositionAnchor
{
    TopLeftCorner = 'TopLeftCorner',
    Center        = 'Center',
}
```

In `symbol-table.ts`, add to the entries list (next to `['Orientation', …]`):

```ts
    ['PositionAnchor', '@pragmatic-lab/mural/framework/diagram/position-anchor.js'],
```

and to `ENUM_MEMBERS` (next to `['Orientation', …]`):

```ts
    ['PositionAnchor', new Set(['TopLeftCorner', 'Center'])],
```

Export from `framework/index.ts`:

```ts
export { PositionAnchor } from './diagram/position-anchor.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/position-anchor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/position-anchor.ts src/compiler/symbol-table.ts src/framework/index.ts src/framework/diagram/tests/position-anchor.test.ts
git commit -m "feat(diagram): PositionAnchor enum (+ markup registration)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Diagram SelectedShape* geometry DPs + SelectionGeometryMirror

**Files:**
- Create: `Mural/src/framework/diagram/collaborators/selection-geometry-mirror.ts`
- Modify: `Mural/src/framework/diagram/diagram.ts` (register DPs near the `SelectionCount`/`SelectionFormat*` block ~line 188/426; construct the mirror where `FormatMirror` is constructed — search `new FormatMirror`)
- Test: `Mural/src/framework/diagram/tests/selection-geometry-mirror.test.ts`

**Interfaces:**
- Consumes: `Figure.Left/Top/Width/Height/Rotation/BaseWidth/BaseHeight` (Task 1); `Diagram.SelectedItems`, `Diagram.AddSelectionChangedListener` (Selector base — confirm exact names in `diagram.ts`/`selector.ts`).
- Produces on `Diagram`: read-only `HasSelectedShapeKey`; read-write `SelectedShapeLeftKey`, `SelectedShapeTopKey`, `SelectedShapeWidthKey`, `SelectedShapeHeightKey`, `SelectedShapeRotationKey`; read-only `SelectedShapeBaseWidthKey`, `SelectedShapeBaseHeightKey`. Accessors of the same names.

- [ ] **Step 1: Write the failing test**

```ts
// selection-geometry-mirror.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ObservableCollection, ItemsPanelTemplate, Size } from '../../../runtime/index.js';
import { Border } from '../../../basic/index.js';
import { PaginatedCanvas } from '../../../basic/panels/paginated-canvas.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';

function mount(): { diagram: Diagram; a: Figure; b: Figure } {
    initTestApp();
    const a = Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); a.Id = 'a';
    const b = Figure.fromKind('rectangle', 200, 60, { width: 80, height: 40 }); b.Id = 'b';
    const coll = new ObservableCollection<Figure>(); coll.Add(a); coll.Add(b);
    const diagram = new Diagram();
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new PaginatedCanvas());
    diagram.ItemsSource = coll;
    const surface = new Border(); surface.SetChild(diagram);
    surface.Measure(new Size(800, 600)); surface.Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return { diagram, a, b };
}

describe('SelectionGeometryMirror', () => {
    test('single selection mirrors the shape geometry; HasSelectedShape true', () => {
        const { diagram, a } = mount();
        diagram.SelectSingle(a);      // use the Diagram's real single-select entry (confirm name)
        assert.equal(diagram.HasSelectedShape, true);
        assert.equal(diagram.SelectedShapeLeft, 10);
        assert.equal(diagram.SelectedShapeWidth, 100);
        assert.equal(diagram.SelectedShapeBaseWidth, 100);
    });
    test('writing a SelectedShape DP updates the shape', () => {
        const { diagram, a } = mount();
        diagram.SelectSingle(a);
        diagram.SelectedShapeWidth = 160;
        assert.equal(a.Width, 160);
        diagram.SelectedShapeRotation = 30;
        assert.equal(a.Rotation, 30);
    });
    test('dragging the shape re-seeds the DP (live tracking)', () => {
        const { diagram, a } = mount();
        diagram.SelectSingle(a);
        a.Left = 77;
        assert.equal(diagram.SelectedShapeLeft, 77);
    });
    test('zero or multi selection => HasSelectedShape false, writes ignored', () => {
        const { diagram, a, b } = mount();
        diagram.SelectSingle(a); diagram.AddToSelection(b);   // confirm multi-select entry
        assert.equal(diagram.HasSelectedShape, false);
        diagram.SelectedShapeWidth = 999;
        assert.equal(a.Width, 100);
    });
});
```

> Before implementing, open `diagram.ts`/`selector.ts` and confirm the exact selection API used by the tests: the single-select entry (e.g. `SelectSingle`/`Select`), the additive entry (`AddToSelection`/`SelectItem`), the selected-items accessor (`SelectedItems`), and the change hook (`AddSelectionChangedListener`). Adjust the test + mirror to the real names. Mirror the `FormatMirror` construction/ownership exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/selection-geometry-mirror.test.ts`
Expected: FAIL (`HasSelectedShape` undefined).

- [ ] **Step 3: Register the DPs on Diagram**

In `diagram.ts`, near the existing selection DPs:

```ts
    public static readonly HasSelectedShapeKey = Model.RegisterReadOnlyProperty<boolean>(
        Diagram, 'HasSelectedShape', false, MetaData.None);
    public static readonly SelectedShapeLeftKey = Model.RegisterProperty<number>(
        Diagram, 'SelectedShapeLeft', 0, MetaData.None);
    public static readonly SelectedShapeTopKey = Model.RegisterProperty<number>(
        Diagram, 'SelectedShapeTop', 0, MetaData.None);
    public static readonly SelectedShapeWidthKey = Model.RegisterProperty<number>(
        Diagram, 'SelectedShapeWidth', 0, MetaData.None);
    public static readonly SelectedShapeHeightKey = Model.RegisterProperty<number>(
        Diagram, 'SelectedShapeHeight', 0, MetaData.None);
    public static readonly SelectedShapeRotationKey = Model.RegisterProperty<number>(
        Diagram, 'SelectedShapeRotation', 0, MetaData.None);
    public static readonly SelectedShapeBaseWidthKey = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectedShapeBaseWidth', 0, MetaData.None);
    public static readonly SelectedShapeBaseHeightKey = Model.RegisterReadOnlyProperty<number>(
        Diagram, 'SelectedShapeBaseHeight', 0, MetaData.None);
```

Add accessors (getters for all; setters only for the read-write ones — `Left/Top/Width/Height/Rotation`; read-only ones expose a getter only):

```ts
    public get HasSelectedShape(): boolean { return this.get_property_value(Diagram.HasSelectedShapeKey); }
    public get SelectedShapeLeft(): number { return this.get_property_value(Diagram.SelectedShapeLeftKey); }
    public set SelectedShapeLeft(v: number) { this.set_property_value(Diagram.SelectedShapeLeftKey, v); }
    public get SelectedShapeTop(): number { return this.get_property_value(Diagram.SelectedShapeTopKey); }
    public set SelectedShapeTop(v: number) { this.set_property_value(Diagram.SelectedShapeTopKey, v); }
    public get SelectedShapeWidth(): number { return this.get_property_value(Diagram.SelectedShapeWidthKey); }
    public set SelectedShapeWidth(v: number) { this.set_property_value(Diagram.SelectedShapeWidthKey, v); }
    public get SelectedShapeHeight(): number { return this.get_property_value(Diagram.SelectedShapeHeightKey); }
    public set SelectedShapeHeight(v: number) { this.set_property_value(Diagram.SelectedShapeHeightKey, v); }
    public get SelectedShapeRotation(): number { return this.get_property_value(Diagram.SelectedShapeRotationKey); }
    public set SelectedShapeRotation(v: number) { this.set_property_value(Diagram.SelectedShapeRotationKey, v); }
    public get SelectedShapeBaseWidth(): number { return this.get_property_value(Diagram.SelectedShapeBaseWidthKey); }
    public get SelectedShapeBaseHeight(): number { return this.get_property_value(Diagram.SelectedShapeBaseHeightKey); }
```

The read-only DPs are written internally via `set_property_value_with_key` (see how `AlignmentGuidesKey`/`SelectionCount` are written in this file).

- [ ] **Step 4: Implement the mirror collaborator**

`selection-geometry-mirror.ts` (mirror the `FormatMirror` shape — ctor takes the diagram, subscribes to selection changes, gates reentrancy):

```ts
import type { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';

// One-shape geometry bridge: reflects the single selected Figure's geometry into
// the Diagram's writable SelectedShape* DPs (seed on selection / live drag) and
// writes edits back to the Figure (guarded against the seed→edit→seed loop).
// Sibling of FormatMirror.
export class SelectionGeometryMirror
{
    private readonly _d: Diagram;
    private _target: Figure | undefined;
    private _seeding = false;
    private _figureUnsub: (() => void) | undefined;

    constructor(diagram: Diagram)
    {
        this._d = diagram;
        const D = diagram.constructor as typeof import('../diagram.js').Diagram;
        diagram.AddSelectionChangedListener(() => this._retarget());
        // Edits flowing IN from the inspector → write to the Figure.
        diagram.AddPropertyChangedListener(D.SelectedShapeLeftKey,     () => this._writeBack('Left'));
        diagram.AddPropertyChangedListener(D.SelectedShapeTopKey,      () => this._writeBack('Top'));
        diagram.AddPropertyChangedListener(D.SelectedShapeWidthKey,    () => this._writeBack('Width'));
        diagram.AddPropertyChangedListener(D.SelectedShapeHeightKey,   () => this._writeBack('Height'));
        diagram.AddPropertyChangedListener(D.SelectedShapeRotationKey, () => this._writeBack('Rotation'));
        this._retarget();
    }

    private _singleFigure(): Figure | undefined
    {
        const sel = this._d.SelectedItems;              // confirm accessor name
        const items = [...sel];
        if (items.length !== 1) return undefined;
        return items[0] instanceof Figure ? items[0] : undefined;
    }

    private _retarget(): void
    {
        this._figureUnsub?.(); this._figureUnsub = undefined;
        this._target = this._singleFigure();
        const D = this._d.constructor as typeof import('../diagram.js').Diagram;
        this._d.set_property_value_with_key(D.HasSelectedShapeKey, this._target !== undefined);
        if (this._target !== undefined)
        {
            const f = this._target;
            const seed = (): void => this._seed(f);
            const unsubs = (['Left','Top','Width','Height','Rotation','BaseWidth','BaseHeight'] as const)
                .map(n => { const k = this._figKey(f, n); f.AddPropertyChangedListener(k, seed); return () => f.RemovePropertyChangedListener(k, seed); });
            this._figureUnsub = () => unsubs.forEach(u => u());
            this._seed(f);
        }
    }

    private _figKey(f: Figure, name: 'Left'|'Top'|'Width'|'Height'|'Rotation'|'BaseWidth'|'BaseHeight'): unknown
    {
        const F = f.constructor as typeof Figure;
        // Width/Height live on Visual; the rest on Figure. Resolve by name.
        return ({ Left: F.LeftKey, Top: F.TopKey, Rotation: F.RotationKey,
                  BaseWidth: F.BaseWidthKey, BaseHeight: F.BaseHeightKey,
                  Width: (F as unknown as { WidthKey: unknown }).WidthKey,
                  Height: (F as unknown as { HeightKey: unknown }).HeightKey })[name];
    }

    private _seed(f: Figure): void
    {
        const D = this._d.constructor as typeof import('../diagram.js').Diagram;
        this._seeding = true;
        try {
            this._d.SelectedShapeLeft = f.Left;
            this._d.SelectedShapeTop = f.Top;
            this._d.SelectedShapeWidth = f.Width;
            this._d.SelectedShapeHeight = f.Height;
            this._d.SelectedShapeRotation = f.Rotation;
            this._d.set_property_value_with_key(D.SelectedShapeBaseWidthKey, Number.isNaN(f.BaseWidth) ? f.Width : f.BaseWidth);
            this._d.set_property_value_with_key(D.SelectedShapeBaseHeightKey, Number.isNaN(f.BaseHeight) ? f.Height : f.BaseHeight);
        } finally { this._seeding = false; }
    }

    private _writeBack(prop: 'Left'|'Top'|'Width'|'Height'|'Rotation'): void
    {
        if (this._seeding || this._target === undefined) return;
        const v = ({ Left: this._d.SelectedShapeLeft, Top: this._d.SelectedShapeTop,
                     Width: this._d.SelectedShapeWidth, Height: this._d.SelectedShapeHeight,
                     Rotation: this._d.SelectedShapeRotation })[prop];
        (this._target as unknown as Record<string, number>)[prop] = v;
    }
}
```

Construct it where `FormatMirror` is built in `diagram.ts` (search `new FormatMirror(`), e.g.:

```ts
        this._selectionGeometryMirror = new SelectionGeometryMirror(this);
```

with a matching private field declaration `private _selectionGeometryMirror?: SelectionGeometryMirror;` and the import.

> If `SelectedItems`/`AddSelectionChangedListener`/`set_property_value_with_key`/`AddPropertyChangedListener` names differ, match what `FormatMirror`/`diagram.ts` actually use (they were confirmed to exist for FormatMirror).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/selection-geometry-mirror.test.ts`
Expected: PASS (all four).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/framework/diagram/collaborators/selection-geometry-mirror.ts src/framework/diagram/diagram.ts src/framework/diagram/tests/selection-geometry-mirror.test.ts
git commit -m "feat(diagram): SelectedShape* geometry DPs mirrored to the selected Figure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: SizePositionControl — class + conversions

**Files:**
- Create: `Mural/src/framework/diagram/size-position-control.ts`
- Modify: `Mural/src/compiler/symbol-table.ts` (`DEFAULT_SYMBOLS` add the control), `Mural/src/framework/index.ts` (export)
- Test: `Mural/src/framework/diagram/tests/size-position-control.test.ts`

**Interfaces:**
- Consumes: `PositionAnchor` (Task 3).
- Produces: `SizePositionControl` (extends `TemplatedControl`) with raw DPs `Left/Top/Width/Height/Rotation/BaseWidth/BaseHeight/HasTarget` and derived DPs `HorizontalPosition/VerticalPosition/ScaleWidth/ScaleHeight/PositionFrom/LockAspectRatio`. Default `Style` supplied in Task 7's markup.

- [ ] **Step 1: Write the failing test**

```ts
// size-position-control.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { PositionAnchor } from '../position-anchor.js';
import { SizePositionControl } from '../size-position-control.js';

function make(): SizePositionControl {
    Application.current = null; new Application();
    const c = new SizePositionControl();
    c.BaseWidth = 100; c.BaseHeight = 50;
    c.Width = 200; c.Height = 100; c.Left = 10; c.Top = 20;
    return c;
}

describe('SizePositionControl conversions', () => {
    test('anchor TopLeftCorner: H/V position = Left/Top', () => {
        const c = make(); c.PositionFrom = PositionAnchor.TopLeftCorner;
        assert.equal(c.HorizontalPosition, 10);
        assert.equal(c.VerticalPosition, 20);
        c.HorizontalPosition = 40; assert.equal(c.Left, 40);
    });
    test('anchor Center: H/V position = Left+W/2, Top+H/2 and inverse', () => {
        const c = make(); c.PositionFrom = PositionAnchor.Center;
        assert.equal(c.HorizontalPosition, 10 + 200 / 2);   // 110
        assert.equal(c.VerticalPosition, 20 + 100 / 2);     // 70
        c.HorizontalPosition = 210; assert.equal(c.Left, 210 - 100);  // 110
    });
    test('scale = size / base * 100, and inverse sets size', () => {
        const c = make();
        assert.equal(c.ScaleWidth, 200);   // 200/100*100
        assert.equal(c.ScaleHeight, 200);  // 100/50*100
        c.ScaleWidth = 150; assert.equal(c.Width, 150);   // 100 * 150/100
    });
    test('lock aspect: editing Width scales Height by the same ratio', () => {
        const c = make(); c.LockAspectRatio = true;
        c.Width = 400;                       // was 200 → x2
        assert.equal(c.Height, 200);         // 100 → x2
    });
    test('zero base: scale shows 100 and scale edits are ignored', () => {
        const c = make(); c.BaseWidth = 0;
        assert.equal(c.ScaleWidth, 100);
        c.ScaleWidth = 300; assert.equal(c.Width, 200);   // unchanged
    });
    test('HasTarget defaults false', () => {
        Application.current = null; new Application();
        assert.equal(new SizePositionControl().HasTarget, false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/size-position-control.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the control**

`size-position-control.ts`:

```ts
import { MetaData, Model, Element, type PropertyDescriptor } from '../../runtime/index.js';
import { TemplatedControl } from '../base/templated-control.js';
import { PositionAnchor } from './position-anchor.js';

// The Size & Position editor's brain (view logic only). Raw DPs bind to the
// Diagram's SelectedShape* geometry; derived DPs (H/V position, Scale %) are
// kept in sync both ways with a reentrancy guard. LockAspectRatio is transient.
export class SizePositionControl extends TemplatedControl
{
    static {
        Model.OverrideMetadata(SizePositionControl, Element.DefaultStyleKeyKey, { default_value: SizePositionControl });
    }

    // ── raw (bound to SelectedShape*) ────────────────────────────────────
    public static readonly LeftKey       = Model.RegisterProperty<number>(SizePositionControl, 'Left', 0, MetaData.BindsTwoWayByDefault);
    public static readonly TopKey        = Model.RegisterProperty<number>(SizePositionControl, 'Top', 0, MetaData.BindsTwoWayByDefault);
    public static readonly WidthValueKey = Model.RegisterProperty<number>(SizePositionControl, 'WidthValue', 0, MetaData.BindsTwoWayByDefault);
    public static readonly HeightValueKey= Model.RegisterProperty<number>(SizePositionControl, 'HeightValue', 0, MetaData.BindsTwoWayByDefault);
    public static readonly RotationKey   = Model.RegisterProperty<number>(SizePositionControl, 'Rotation', 0, MetaData.BindsTwoWayByDefault);
    public static readonly BaseWidthKey  = Model.RegisterProperty<number>(SizePositionControl, 'BaseWidth', 0, MetaData.None);
    public static readonly BaseHeightKey = Model.RegisterProperty<number>(SizePositionControl, 'BaseHeight', 0, MetaData.None);
    public static readonly HasTargetKey  = Model.RegisterProperty<boolean>(SizePositionControl, 'HasTarget', false, MetaData.None);

    // ── derived (bound to the SpinEdit/ComboBox/Switch fields) ───────────
    public static readonly HorizontalPositionKey = Model.RegisterProperty<number>(SizePositionControl, 'HorizontalPosition', 0, MetaData.BindsTwoWayByDefault);
    public static readonly VerticalPositionKey   = Model.RegisterProperty<number>(SizePositionControl, 'VerticalPosition', 0, MetaData.BindsTwoWayByDefault);
    public static readonly ScaleWidthKey  = Model.RegisterProperty<number>(SizePositionControl, 'ScaleWidth', 100, MetaData.BindsTwoWayByDefault);
    public static readonly ScaleHeightKey = Model.RegisterProperty<number>(SizePositionControl, 'ScaleHeight', 100, MetaData.BindsTwoWayByDefault);
    public static readonly PositionFromKey = Model.RegisterProperty<PositionAnchor>(SizePositionControl, 'PositionFrom', PositionAnchor.TopLeftCorner, MetaData.BindsTwoWayByDefault);
    public static readonly LockAspectRatioKey = Model.RegisterProperty<boolean>(SizePositionControl, 'LockAspectRatio', false, MetaData.BindsTwoWayByDefault);

    private _syncing = false;

    constructor() { super(); this.applyDefaultStyle(); }

    // Note: Width/Height collide with Visual.Width/Height, so the raw size DPs are
    // named WidthValue/HeightValue. The tests use `.Width`/`.Height` sugar below.
    public get Width(): number { return this.get_property_value(SizePositionControl.WidthValueKey); }
    public set Width(v: number) { this.set_property_value(SizePositionControl.WidthValueKey, v); }
    public get Height(): number { return this.get_property_value(SizePositionControl.HeightValueKey); }
    public set Height(v: number) { this.set_property_value(SizePositionControl.HeightValueKey, v); }
    public get Left(): number { return this.get_property_value(SizePositionControl.LeftKey); }
    public set Left(v: number) { this.set_property_value(SizePositionControl.LeftKey, v); }
    public get Top(): number { return this.get_property_value(SizePositionControl.TopKey); }
    public set Top(v: number) { this.set_property_value(SizePositionControl.TopKey, v); }
    public get Rotation(): number { return this.get_property_value(SizePositionControl.RotationKey); }
    public set Rotation(v: number) { this.set_property_value(SizePositionControl.RotationKey, v); }
    public get BaseWidth(): number { return this.get_property_value(SizePositionControl.BaseWidthKey); }
    public set BaseWidth(v: number) { this.set_property_value(SizePositionControl.BaseWidthKey, v); }
    public get BaseHeight(): number { return this.get_property_value(SizePositionControl.BaseHeightKey); }
    public set BaseHeight(v: number) { this.set_property_value(SizePositionControl.BaseHeightKey, v); }
    public get HasTarget(): boolean { return this.get_property_value(SizePositionControl.HasTargetKey); }
    public set HasTarget(v: boolean) { this.set_property_value(SizePositionControl.HasTargetKey, v); }
    public get HorizontalPosition(): number { return this.get_property_value(SizePositionControl.HorizontalPositionKey); }
    public set HorizontalPosition(v: number) { this.set_property_value(SizePositionControl.HorizontalPositionKey, v); }
    public get VerticalPosition(): number { return this.get_property_value(SizePositionControl.VerticalPositionKey); }
    public set VerticalPosition(v: number) { this.set_property_value(SizePositionControl.VerticalPositionKey, v); }
    public get ScaleWidth(): number { return this.get_property_value(SizePositionControl.ScaleWidthKey); }
    public set ScaleWidth(v: number) { this.set_property_value(SizePositionControl.ScaleWidthKey, v); }
    public get ScaleHeight(): number { return this.get_property_value(SizePositionControl.ScaleHeightKey); }
    public set ScaleHeight(v: number) { this.set_property_value(SizePositionControl.ScaleHeightKey, v); }
    public get PositionFrom(): PositionAnchor { return this.get_property_value(SizePositionControl.PositionFromKey); }
    public set PositionFrom(v: PositionAnchor) { this.set_property_value(SizePositionControl.PositionFromKey, v); }
    public get LockAspectRatio(): boolean { return this.get_property_value(SizePositionControl.LockAspectRatioKey); }
    public set LockAspectRatio(v: boolean) { this.set_property_value(SizePositionControl.LockAspectRatioKey, v); }

    protected override OnPropertyChanged(d: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(d, oldValue, newValue);
        if (this._syncing) return;
        this._syncing = true;
        try {
            switch (d.Name) {
                case 'Left': case 'Top': case 'WidthValue': case 'HeightValue': case 'PositionFrom': case 'BaseWidth': case 'BaseHeight':
                    if (d.Name === 'WidthValue' && this.LockAspectRatio) this._linkHeight(oldValue as number, newValue as number);
                    if (d.Name === 'HeightValue' && this.LockAspectRatio) this._linkWidth(oldValue as number, newValue as number);
                    this._recomputeDerived();
                    break;
                case 'HorizontalPosition':
                    this.Left = this.PositionFrom === PositionAnchor.Center ? this.HorizontalPosition - this.Width / 2 : this.HorizontalPosition;
                    break;
                case 'VerticalPosition':
                    this.Top = this.PositionFrom === PositionAnchor.Center ? this.VerticalPosition - this.Height / 2 : this.VerticalPosition;
                    break;
                case 'ScaleWidth':
                    if (this.BaseWidth > 0) this.Width = this.BaseWidth * this.ScaleWidth / 100;
                    if (this.LockAspectRatio) this.ScaleHeight = this.ScaleWidth;
                    this._recomputeDerived();
                    break;
                case 'ScaleHeight':
                    if (this.BaseHeight > 0) this.Height = this.BaseHeight * this.ScaleHeight / 100;
                    if (this.LockAspectRatio) this.ScaleWidth = this.ScaleHeight;
                    this._recomputeDerived();
                    break;
            }
        } finally { this._syncing = false; }
    }

    private _linkHeight(oldW: number, newW: number): void {
        if (oldW > 0 && newW > 0) this.Height = this.Height * (newW / oldW);
    }
    private _linkWidth(oldH: number, newH: number): void {
        if (oldH > 0 && newH > 0) this.Width = this.Width * (newH / oldH);
    }
    private _recomputeDerived(): void {
        const centered = this.PositionFrom === PositionAnchor.Center;
        this.HorizontalPosition = centered ? this.Left + this.Width / 2 : this.Left;
        this.VerticalPosition   = centered ? this.Top + this.Height / 2 : this.Top;
        this.ScaleWidth  = this.BaseWidth  > 0 ? this.Width  / this.BaseWidth  * 100 : 100;
        this.ScaleHeight = this.BaseHeight > 0 ? this.Height / this.BaseHeight * 100 : 100;
    }
}
```

Register in `symbol-table.ts` `DEFAULT_SYMBOLS`/entries:

```ts
    ['SizePositionControl', '@pragmatic-lab/mural/framework/diagram/size-position-control.js'],
```

Export from `framework/index.ts`:

```ts
export { SizePositionControl } from './diagram/size-position-control.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/size-position-control.test.ts`
Expected: PASS (all six).

> If `applyDefaultStyle()` throws because the Style isn't registered yet (template lands in Task 7), guard the ctor to tolerate a missing default style the way other controls do, OR land Task 7's Style block first. Simplest: in this task, wrap `applyDefaultStyle()` — keep it, and if the test errors on missing style, add the minimal `Style [TargetType = SizePositionControl] { Template = @DefaultSizePositionControl; }` + a stub `Template` in Task 7 before running the full suite. The unit test above pokes DPs and does not require the template, so construct without measuring/rendering.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/framework/diagram/size-position-control.ts src/compiler/symbol-table.ts src/framework/index.ts src/framework/diagram/tests/size-position-control.test.ts
git commit -m "feat(diagram): SizePositionControl with anchor/scale/lock conversions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Inspector page models + DiagramInspector paging

**Files:**
- Create: `Mural/src/framework/diagram/inspector-pages.ts`
- Modify: `Mural/src/framework/diagram/diagram-inspector.ts`, `Mural/src/framework/index.ts` (export the page classes)
- Test: `Mural/src/framework/diagram/tests/diagram-inspector-pages.test.ts`

**Interfaces:**
- Produces: `InspectorPage` (abstract; `Title: string`, `View: Diagram | undefined`), `ShapeStylePage`, `SizePositionPage`. `DiagramInspector.PagesKey` (read-only `ObservableCollection<InspectorPage>`), `DiagramInspector.SelectedPageKey` (`InspectorPage | undefined`, two-way). `View` propagates to pages.

- [ ] **Step 1: Write the failing test**

```ts
// diagram-inspector-pages.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import { DiagramInspector } from '../diagram-inspector.js';
import { ShapeStylePage, SizePositionPage } from '../inspector-pages.js';

describe('DiagramInspector paging', () => {
    test('exposes Style + Size/Position pages, default selection = Style', () => {
        Application.current = null; new Application();
        const insp = new DiagramInspector();
        const pages = [...insp.Pages];
        assert.equal(pages.length, 2);
        assert.ok(pages[0] instanceof ShapeStylePage);
        assert.ok(pages[1] instanceof SizePositionPage);
        assert.equal(insp.SelectedPage, pages[0]);
        assert.equal(pages[0].Title, 'Style');
        assert.equal(pages[1].Title, 'Size & Position');
    });
    test('View propagates to the pages', () => {
        Application.current = null; new Application();
        const insp = new DiagramInspector();
        const d = new Diagram();
        insp.View = d;
        for (const p of insp.Pages) assert.equal(p.View, d);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/diagram-inspector-pages.test.ts`
Expected: FAIL (module/exports missing).

- [ ] **Step 3: Implement page models + paging**

`inspector-pages.ts`:

```ts
import { MetaData, Model } from '../../runtime/index.js';
import type { Diagram } from './diagram.js';

// A tab in the paged DiagramInspector. Both pages edit the SAME Diagram selection,
// so a page only carries a Title (for the rail) + View (the live Diagram); the
// page body binds through $View. The concrete subtype is the DataTemplate key.
export abstract class InspectorPage extends Model
{
    public static readonly TitleKey = Model.RegisterProperty<string>(InspectorPage, 'Title', '', MetaData.None);
    public static readonly ViewKey  = Model.RegisterProperty<Diagram | undefined>(InspectorPage, 'View', undefined, MetaData.None);

    protected constructor(title: string) { super(); this.set_property_value(InspectorPage.TitleKey, title); }

    public get Title(): string { return this.get_property_value(InspectorPage.TitleKey); }
    public get View(): Diagram | undefined { return this.get_property_value(InspectorPage.ViewKey); }
    public set View(v: Diagram | undefined) { this.set_property_value(InspectorPage.ViewKey, v); }
}

export class ShapeStylePage extends InspectorPage { constructor() { super('Style'); } }
export class SizePositionPage extends InspectorPage { constructor() { super('Size & Position'); } }
```

Rewrite `diagram-inspector.ts` to add paging (keep the existing `View` DP + ctor id/title):

```ts
import { MetaData, Model, ObservableCollection } from '../../runtime/index.js';
import { Inspector } from '../shell/services/inspector.js';
import type { Diagram } from './diagram.js';
import { InspectorPage, ShapeStylePage, SizePositionPage } from './inspector-pages.js';

export class DiagramInspector extends Inspector
{
    public static readonly ViewKey = Model.RegisterProperty<Diagram | undefined>(
        DiagramInspector, 'View', undefined, MetaData.None);
    public static readonly PagesKey = Model.RegisterReadOnlyProperty<ObservableCollection<InspectorPage>>(
        DiagramInspector, 'Pages', undefined as unknown as ObservableCollection<InspectorPage>, MetaData.None);
    public static readonly SelectedPageKey = Model.RegisterProperty<InspectorPage | undefined>(
        DiagramInspector, 'SelectedPage', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);

    constructor()
    {
        super('diagram-format', 'Format Shape');
        const pages = new ObservableCollection<InspectorPage>();
        pages.Add(new ShapeStylePage());
        pages.Add(new SizePositionPage());
        this.set_property_value_with_key(DiagramInspector.PagesKey, pages);
        this.set_property_value(DiagramInspector.SelectedPageKey, pages.At(0));   // confirm collection accessor
    }

    public get View(): Diagram | undefined { return this.get_property_value(DiagramInspector.ViewKey); }
    public set View(v: Diagram | undefined)
    {
        this.set_property_value(DiagramInspector.ViewKey, v);
        for (const p of this.Pages) p.View = v;
    }
    public get Pages(): ObservableCollection<InspectorPage> { return this.get_property_value(DiagramInspector.PagesKey); }
    public get SelectedPage(): InspectorPage | undefined { return this.get_property_value(DiagramInspector.SelectedPageKey); }
    public set SelectedPage(v: InspectorPage | undefined) { this.set_property_value(DiagramInspector.SelectedPageKey, v); }
}
```

Export the pages from `framework/index.ts`:

```ts
export { InspectorPage, ShapeStylePage, SizePositionPage } from './diagram/inspector-pages.js';
```

> Confirm `ObservableCollection`'s index accessor name (`.At(0)` vs `.Item(0)` vs `[0]`) and iteration; match the codebase.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/diagram-inspector-pages.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/framework/diagram/inspector-pages.ts src/framework/diagram/diagram-inspector.ts src/framework/index.ts src/framework/diagram/tests/diagram-inspector-pages.test.ts
git commit -m "feat(diagram): paged DiagramInspector (Style + Size/Position pages)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Inspector markup — horizontal NavigationRail + page templates + SizePositionControl Style

**Files:**
- Modify: `Mural/src/framework/diagram/diagram.template.mu` (replace the `DataTemplate [DataType = DiagramInspector]` block at ~306–335; add rail resources, page `DataTemplate`s, and the `SizePositionControl` default Style/Template)
- Test: `Mural/src/framework/diagram/tests/diagram-inspector-render.test.ts`

**Interfaces:**
- Consumes: `DiagramInspector.Pages/SelectedPage` (Task 6), `ShapeStylePage`/`SizePositionPage` (Task 6), `SizePositionControl` (Task 5), Diagram `SelectedShape*`/`HasSelectedShape` (Task 4), `PositionAnchor` (Task 3), `ShapeFormatControl` bindings (existing).

- [ ] **Step 1: Write the rewritten markup**

Replace the DiagramInspector template and add resources in `diagram.template.mu`:

```mu
// Horizontal rail item panel for the inspector pages.
ItemsPanelTemplate x:key="InspectorRailPanel" {
    StackPanel [ Orientation = Horizontal ]
}

// A text-tab NavigationItem (underline-on-selected), driven by the page Title.
Template x:key="InspectorRailItem" [ TargetType = NavigationItem ] {
    Border x:name="PART_Outer"
        [ Fill = #00000000, Stroke = Pen [ Brush = #00000000 ],
          BorderThickness = (0,0,0,2), Padding = (12,8,12,8) ] {
        TextBlock x:name="PART_Label"
            [ Style = @TitleSmall, Text = $Title,
              Foreground = @OnSurfaceVariant, VerticalAlignment = Center ]
    }
    when ( IsSelected ) { PART_Outer.Stroke = Pen [ Brush = @Primary ]; PART_Label.Foreground = @Primary; }
    when ( IsMouseOver ) { PART_Label.Foreground = @OnSurface; }
}

Style x:key="InspectorRail" [ TargetType = NavigationRail ] {
    Template   = @DefaultNavigationRail;   // reuse the base template; panel below overrides layout
    ItemsPanel = @InspectorRailPanel;
    ItemContainerStyle = Style [ TargetType = NavigationItem ] { Template = @InspectorRailItem; Label = $Title; };
}

// ── Paged inspector body ─────────────────────────────────────────────
DataTemplate [DataType = DiagramInspector] {
    DockPanel [ LastChildFill = true ] {
        NavigationRail
            [ DockPanel.Dock = Top,
              Style          = @InspectorRail,
              ItemsSource    = $Pages,
              SelectedItem   = $SelectedPage ]
        ContentPresenter [ Content = $SelectedPage, ReuseContentViews = true ]
    }
}

// Page 1 body — the existing ShapeFormatControl, now bound through $View.
DataTemplate [DataType = ShapeStylePage] {
    Border [ Padding = (12) ] {
        ScrollViewer [ IsAutoHideScrollBars = false, HorizontalScrollEnabled = false, DataContext = $View ] {
            ShapeFormatControl
                [ Fill              = $SelectionFormatFill,
                  Stroke            = $SelectionFormatStroke,
                  SourceCapTemplate = $SelectionFormatSourceCap,
                  TargetCapTemplate = $SelectionFormatTargetCap,
                  SourceCapScale    = $SelectionFormatSourceCapScale,
                  TargetCapScale    = $SelectionFormatTargetCapScale,
                  ShowCaps          = $SelectionIsConnector,
                  CapOptions        = $ConnectorCapOptions ]
        }
    }
}

// Page 2 body — Size & Position, bound through $View to the SelectedShape* DPs.
DataTemplate [DataType = SizePositionPage] {
    Border [ Padding = (12) ] {
        ScrollViewer [ IsAutoHideScrollBars = false, HorizontalScrollEnabled = false, DataContext = $View ] {
            SizePositionControl
                [ Left       = $SelectedShapeLeft,
                  Top        = $SelectedShapeTop,
                  WidthValue = $SelectedShapeWidth,
                  HeightValue= $SelectedShapeHeight,
                  Rotation   = $SelectedShapeRotation,
                  BaseWidth  = $SelectedShapeBaseWidth,
                  BaseHeight = $SelectedShapeBaseHeight,
                  HasTarget  = $HasSelectedShape ]
        }
    }
}

// SizePositionControl default Style/Template (two labelled sections).
Template x:key="DefaultSizePositionControl" [ TargetType = SizePositionControl ] {
    StackPanel [ Orientation = Vertical, IsEnabled = $HasTarget ] {
        TextBlock [ Style = @TitleSmall, Text = "Size", Margin = (0,0,0,6) ]
        Grid {
            ColumnDefinitions { ColumnDefinition [ Width = GridLength.Auto ] ColumnDefinition [ Width = GridLength.Star ] }
            RowDefinitions {
                RowDefinition [ Height = GridLength.Auto ] RowDefinition [ Height = GridLength.Auto ]
                RowDefinition [ Height = GridLength.Auto ] RowDefinition [ Height = GridLength.Auto ]
                RowDefinition [ Height = GridLength.Auto ] RowDefinition [ Height = GridLength.Auto ]
            }
            TextBlock [ Grid.Row = 0, Grid.Column = 0, Text = "Height",       Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 0, Grid.Column = 1, Value = $HeightValue, Minimum = 1, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            TextBlock [ Grid.Row = 1, Grid.Column = 0, Text = "Width",        Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 1, Grid.Column = 1, Value = $WidthValue,  Minimum = 1, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            TextBlock [ Grid.Row = 2, Grid.Column = 0, Text = "Rotation",     Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 2, Grid.Column = 1, Value = $Rotation, Minimum = -360, Maximum = 360, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            TextBlock [ Grid.Row = 3, Grid.Column = 0, Text = "Scale Height", Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 3, Grid.Column = 1, Value = $ScaleHeight, Minimum = 1, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            TextBlock [ Grid.Row = 4, Grid.Column = 0, Text = "Scale Width",  Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 4, Grid.Column = 1, Value = $ScaleWidth,  Minimum = 1, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            Switch    [ Grid.Row = 5, Grid.Column = 1, IsChecked = $LockAspectRatio, Content = "Lock aspect ratio" ]
        }
        TextBlock [ Style = @TitleSmall, Text = "Position", Margin = (0,12,0,6) ]
        Grid {
            ColumnDefinitions { ColumnDefinition [ Width = GridLength.Auto ] ColumnDefinition [ Width = GridLength.Star ] }
            RowDefinitions {
                RowDefinition [ Height = GridLength.Auto ] RowDefinition [ Height = GridLength.Auto ]
                RowDefinition [ Height = GridLength.Auto ] RowDefinition [ Height = GridLength.Auto ]
            }
            TextBlock [ Grid.Row = 0, Grid.Column = 0, Text = "Horizontal",   Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 0, Grid.Column = 1, Value = $HorizontalPosition, DecimalPlaces = 0, Margin = (0,0,0,6) ]
            ComboBox  [ Grid.Row = 1, Grid.Column = 1, SelectedItem = $PositionFrom, Margin = (0,0,0,6) ] {
                PositionAnchor.TopLeftCorner
                PositionAnchor.Center
            }
            TextBlock [ Grid.Row = 2, Grid.Column = 0, Text = "Vertical",     Style = @BodySmall, Width = 108, VerticalAlignment = Center, Margin = (0,0,8,6) ]
            SpinEdit  [ Grid.Row = 2, Grid.Column = 1, Value = $VerticalPosition, DecimalPlaces = 0, Margin = (0,0,0,6) ]
        }
    }
}

Style [ TargetType = SizePositionControl ] { Template = @DefaultSizePositionControl; }
```

> The `ComboBox` enum-items form (`PositionAnchor.TopLeftCorner` literals as items, `SelectedItem = $PositionFrom`) must match how other `.mu` combo boxes bind an enum. If the codebase has no precedent for enum literals as inline items, fall back to: `ItemsSource` = a static list exposed by the control (`FromOptions`) of `{Label, Value}` with an item template showing `$Label`, and `SelectedItem` two-way to a `SelectedFrom` DP that the control maps to `PositionFrom`. Pick whichever the existing `.mu` supports; keep the control's `PositionFrom` enum as the source of truth.

- [ ] **Step 2: Compile templates (this is the "does it build" gate)**

Run: `npm run build:templates`
Expected: success, no compile errors (unknown-symbol errors here mean a control/enum isn't registered — fix Task 3/Task 5 registration).

- [ ] **Step 3: Write a render test**

```ts
// diagram-inspector-render.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Size, Rect } from '../../../runtime/index.js';
import { Border } from '../../../basic/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { DiagramInspector } from '../diagram-inspector.js';
import { SizePositionPage } from '../inspector-pages.js';
import { findDataTemplateForType } from '../../base/content-control.js';   // confirm export path

describe('DiagramInspector render', () => {
    test('the SizePositionPage resolves a DataTemplate and builds', () => {
        initTestApp();
        const page = new SizePositionPage();
        const tpl = findDataTemplateForType(page.constructor, new Border());   // confirm signature
        assert.ok(tpl, 'SizePositionPage has a DataTemplate');
        const v = tpl!.Apply(page);
        assert.ok(v, 'template builds a visual');
    });
    test('the paged inspector template builds', () => {
        initTestApp();
        const insp = new DiagramInspector();
        const tpl = findDataTemplateForType(insp.constructor, new Border());
        assert.ok(tpl, 'DiagramInspector has a DataTemplate');
        const v = tpl!.Apply(insp);
        const host = new Border(); host.SetChild(v);
        host.Measure(new Size(320, 600)); host.Arrange({ X: 0, Y: 0, Width: 320, Height: 600 } as never);
        assert.ok(v, 'inspector builds + arranges');
    });
});
```

> `findDataTemplateForType` is referenced by `content-control.ts`; confirm its exact exported name/signature and adjust. If it is not exported, exercise the template through a `ContentControl` whose `Content` is set to the page and assert the presenter produced a child.

- [ ] **Step 4: Run the render test + full suite**

Run: `npx tsx --conditions=development --test src/framework/diagram/tests/diagram-inspector-render.test.ts`
Expected: PASS.
Run: `npm test`
Expected: full suite green (0 fail).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/diagram.template.mu src/framework/diagram/tests/diagram-inspector-render.test.ts
git commit -m "feat(diagram): paged inspector markup + Size/Position editor template

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Rollout — publish mural, bump Plexus, verify + live smoke

**Files:** none (build/release only).

- [ ] **Step 1: Full Mural suite + typecheck green**

Run: `npx tsc --noEmit && npm test`
Expected: exit 0; suite green.

- [ ] **Step 2: Bump + publish mural to Verdaccio**

```bash
npm version minor -m "chore: release mural %s (paged inspector + size/position)"
npm publish     # publishConfig registry = http://localhost:4873
```
Expected: `+ @pragmatic-lab/mural@<new>` to `http://localhost:4873`.

- [ ] **Step 3: Bump Plexus + run its suite**

```bash
cd ../Plexus
npm install @pragmatic-lab/mural@<new> --save --registry http://localhost:4873/
npm test
```
Expected: Plexus suite green (the inspector is framework-provided; no Plexus source change expected).

- [ ] **Step 4: Rebuild + live smoke**

```bash
npm run build
```
Then launch (Playwright/Electron per the project debug recipe), open `test_arch` → `diagram.diagram`, select a shape, open Format Shape, and verify: the horizontal rail shows **Style** / **Size & Position**; switching pages works; Size/Position shows the shape's px geometry; editing Width/Height/Rotation/Scale/Position updates the shape live; rotation renders; values persist across save/reload. Multi-select/no-selection disables the Size/Position fields.

- [ ] **Step 5: Commit the Plexus bump** (only when the user asks to commit/push)

```bash
git add package.json package-lock.json
git commit -m "chore: bump @pragmatic-lab/mural <new> (paged inspector + size/position)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** paging shell (T6/T7), Style page moved verbatim (T7), Size fields incl. Rotation + Scale + Lock (T5/T7), Position + From anchor (T3/T5/T7), native px (throughout), Rotation model + render (T1) + persistence (T2), writable primary-selection geometry (T4), single-selection gating (T4 `HasSelectedShape` → `HasTarget` → `IsEnabled`), backward-compatible persistence (T2), rollout (T8). Picture-only fields + Text Box excluded per spec.
- **Type consistency:** the control's raw size DPs are `WidthValue`/`HeightValue` (to avoid colliding with `Visual.Width/Height`), bound in markup as `WidthValue = $SelectedShapeWidth`; the `.Width`/`.Height` accessors are sugar used only by tests. Diagram DPs `SelectedShape*` match between T4 (producer) and T7 (consumer). Page types `ShapeStylePage`/`SizePositionPage` match between T6 and T7.
- **Confirm-before-coding anchors** (flagged inline where a real symbol name must be verified against the codebase): the Diagram selection API names (`SelectedItems`, `AddSelectionChangedListener`, single/multi-select entry points), `ObservableCollection` index accessor, `findDataTemplateForType` export, `defaultNodeSerializers` export name, the `.mu` enum-combobox binding form, and the `FormatMirror` construction site. Each is a named lookup, not a guess — resolve it from the cited file before writing the step's code.
