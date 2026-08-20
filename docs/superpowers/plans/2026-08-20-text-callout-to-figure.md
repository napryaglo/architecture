# Slice #1: Text & Callout → Figure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparent the text-box and callout diagram nodes from `NodeViewModel` view-models onto `Figure`, retiring `TextNodeVM`/`CalloutNodeVM`, so these nodes are self-hosting Figures like geometric shapes.

**Architecture:** `TextNode extends Figure` and `Callout extends TextNode`. They are *shapeless* Figures (no silhouette `_source`), so they fall through the `'shape'` serializer to their own `'text'`/`'callout'` serializers; their box + leader are drawn by their own control templates (Style→Template), reusing Figure's native `ShapeText`, GrowShape auto-fit, `{field}` resolution, and in-place edit. Because they are Figures, the Diagram treats them as their own containers (no wrapper). Leader geometry is unchanged — it duck-types on `ILeaderTarget` (`Left/Top/Width/Height`).

**Tech Stack:** TypeScript (Mural framework), `.mu` markup templates, `node:test` runner.

**Spec:** `docs/superpowers/specs/2026-08-20-container-owned-geometry-design.md` (slice #1 section).

## Global Constraints

- **No store / no format change in this slice.** Text/Callout Figures serialize geometry inline via the existing base record + `placeNode`, exactly as today. The `id → visual` store and v3 format are slice #2.
- **Shapeless Figures.** `TextNode`/`Callout` never set `_source`; `_getSource()` stays `undefined` so the `'shape'` serializer (which requires `_getSource() !== undefined`) does not claim them. No change to `'shape'.matches` is needed.
- **Render through templates.** The box (Border with Fill/Stroke) and the leader (a `Shape` bound to `LeaderGeometry`) live in the control templates, not in renderer code. Every control has a default Style ([CLAUDE.md](../../../CLAUDE.md)).
- **Enums over string-literal unions.** Any fixed value set is a TS `enum`; markup-facing symbols register in `src/compiler/symbol-table.ts` (`DEFAULT_SYMBOLS`/`ENUM_MEMBERS`).
- **Every test file lives in a `tests/` subfolder** next to the source it exercises.
- **Names:** `TextNode` and `Callout`. (If the reviewer prefers plain `Text`, rename before Task 1 — `Text` has no class collision but is generic.)
- **Publish:** none in this slice — Plexus does not consume these types (only a stale comment references them). Mural republish is deferred to a later slice.

## File Structure

- Create `src/framework/diagram/text-node.ts` — `TextNode extends Figure`.
- Create `src/framework/diagram/callout.ts` — `Callout extends TextNode` + `ILeaderTarget` (moved from callout-node-vm.ts).
- Modify `src/framework/diagram/diagram.template.mu` — add `Style[TargetType=TextNode]` + `Style[TargetType=Callout]` control templates; remove the old `DataTemplate[DataType=TextNodeVM]`/`[DataType=CalloutNodeVM]`.
- Modify `src/compiler/symbol-table.ts` — add `TextNode`/`Callout` symbols; remove `TextNodeVM`/`CalloutNodeVM`.
- Modify `src/framework/diagram/node-serializers-default.ts` — `'text'`/`'callout'` serializers build the new Figures.
- Modify `src/framework/diagram/diagram-document.ts` — swap `TextNodeVM`/`CalloutNodeVM` types/imports/`instanceof` to `TextNode`/`Callout`.
- Modify `src/framework/index.ts` — export `TextNode`, `Callout`, `ILeaderTarget`; drop the VM exports.
- Delete `src/framework/diagram/text-node-vm.ts`, `src/framework/diagram/callout-node-vm.ts`.
- Migrate their tests under `src/framework/diagram/tests/` (see Tasks 4–5).

---

### Task 1: `TextNode extends Figure` + control template

**Files:**
- Create: `src/framework/diagram/text-node.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (add `Style[TargetType=TextNode]`)
- Modify: `src/compiler/symbol-table.ts` (add `TextNode` symbol)
- Test: `src/framework/diagram/tests/text-node.test.ts`

**Interfaces:**
- Consumes: `Figure` (`Text: ShapeText`, `Left/Top/Width/Height`, `Fill`, `Stroke`, `_applyAutoFit`, `resolveEditTarget`, `applyDefaultStyle`), `ShapeText`, `TextAutoFit`, `Element.DefaultStyleKeyKey`.
- Produces: `class TextNode extends Figure` — a shapeless Figure with GrowShape auto-fit and text-box Fill/Stroke defaults; default size 120×44; renders via `Style[TargetType=TextNode]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/text-node.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { TextAutoFit } from '../shape-text.js';
import { TextNode } from '../text-node.js';

function make(): TextNode { Application.current = null; new Application(); return new TextNode(); }

describe('TextNode', () => {
    test('is a shapeless Figure (no silhouette source)', () => {
        const t = make();
        assert.ok(t instanceof Figure);
        assert.equal(t._getSource(), undefined);
    });
    test('defaults: 120x44, empty label, GrowShape autofit', () => {
        const t = make();
        assert.equal(t.Width, 120);
        assert.equal(t.Height, 44);
        assert.equal(t.Text.Content, '');
        assert.equal(t.Text.AutoFit, TextAutoFit.GrowShape);
    });
    test('LabelText proxies Text.Content', () => {
        const t = make();
        t.LabelText = 'hi';
        assert.equal(t.Text.Content, 'hi');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/framework/diagram/tests/text-node.test.ts`
Expected: FAIL — `Cannot find module '../text-node.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/framework/diagram/text-node.ts`. `Figure` already owns `Text` (a `ShapeText`), `_applyAutoFit`, field resolution, Fill/Stroke and the edit path — so `TextNode` only sets the text-box defaults and its own default style key:

```ts
import { Model, Element } from '../../runtime/index.js';
import { Brush, Color, Pen, SolidColorBrush } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { TextAutoFit } from './shape-text.js';

// Match the legacy TextNodeVM visual: transparent fill + slate outline.
const TEXT_NODE_FILL: Brush = new SolidColorBrush(Color.FromHex('#00000000'));
const TEXT_NODE_STROKE = new Pen(new SolidColorBrush(Color.FromHex('#94a3b8')), 1);
const TEXT_NODE_DEFAULT_W = 120;
const TEXT_NODE_DEFAULT_H = 44;

// A text-box node: a shapeless Figure whose ShapeText grows the box to fit.
// Box + label are drawn by Style[TargetType=TextNode]; geometry, auto-fit,
// {field} resolution and in-place edit are Figure-native.
export class TextNode extends Figure
{
    static { Model.OverrideMetadata(TextNode, Element.DefaultStyleKeyKey, { default_value: TextNode }); }

    constructor()
    {
        super();
        this.Text.AutoFit = TextAutoFit.GrowShape;
        this.Fill   = TEXT_NODE_FILL;
        this.Stroke = new Pen(TEXT_NODE_STROKE.Brush, TEXT_NODE_STROKE.Thickness);
        this.Width  = TEXT_NODE_DEFAULT_W;
        this.Height = TEXT_NODE_DEFAULT_H;
        this.applyDefaultStyle();
    }
}
```

> Verify against `figure.ts`: confirm the `Figure` constructor already installs `this.Text` and wires `_applyAutoFit`/`_refreshLabelFields` (it does, per lines 369/384-388), so `this.Text.AutoFit = …` in the subclass ctor triggers a re-fit. If `Figure` already calls `applyDefaultStyle()`, the extra call is a safe no-op; keep it so the subclass style resolves.

Add the markup symbol in `src/compiler/symbol-table.ts` `DEFAULT_SYMBOLS` (near the existing `TextNodeVM` entry, line ~221):

```ts
['TextNode', '@pragmatic-lab/mural/framework/diagram/text-node.js'],
```

Add the control template in `src/framework/diagram/diagram.template.mu` — model it on the existing `DataTemplate[DataType=TextNodeVM]` (Border + label host), but as a `Style`/`Template` for the control, using `PART_LabelHost` as a `Border` that `Figure.OnApplyTemplate` fills with `this.Text` (Figure does `labelHost.SetChild(this.Text)`; do NOT bind `Content=$Text`):

```mu
Template x:key="DefaultTextNode" [ TargetType = TextNode ] {
    Border [ Fill = $$Fill, Stroke = $$Stroke ] {
        Border x:name="PART_LabelHost"
    }
}
Style [ TargetType = TextNode ] {
    Template = @DefaultTextNode;
}
```

> Verify PART names against `figure.ts` `OnApplyTemplate`/`GetTemplateChild('PART_LabelHost')` (line ~379) and the default Figure template (diagram.template.mu line ~14). If the Figure template also needs `PART_Content`, include it. `$$` binds the template to the TextNode's own DPs.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/framework/diagram/tests/text-node.test.ts`
Expected: PASS (3 tests).
Then: `npm run build:templates` — templates compile with the new `TextNode` symbol.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/text-node.ts src/framework/diagram/diagram.template.mu src/compiler/symbol-table.ts src/framework/diagram/tests/text-node.test.ts
git commit -m "feat(diagram): TextNode — a shapeless Figure text box (alongside TextNodeVM)"
```

---

### Task 2: `Callout extends TextNode` + leader template

**Files:**
- Create: `src/framework/diagram/callout.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (add `Style[TargetType=Callout]`)
- Modify: `src/compiler/symbol-table.ts` (add `Callout` symbol)
- Test: `src/framework/diagram/tests/callout.test.ts`

**Interfaces:**
- Consumes: `TextNode` (Task 1), `Figure` geometry, `resolveKey` (`../../runtime/model-internals.js`), `pathGeometryFromSvgD`/`PathGeometry`/`Point`.
- Produces: `class Callout extends TextNode` with `LeaderTargetNode: ILeaderTarget | undefined`, read-only `LeaderGeometry: PathGeometry | undefined`, `LeaderTargetId: string | undefined`, `Detach(): void`. `export interface ILeaderTarget` (moved here from callout-node-vm.ts).

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/callout.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import { Callout } from '../callout.js';

function scene(): { c: Callout; target: Figure } {
    Application.current = null; new Application();
    const c = new Callout(); c.Left = 0; c.Top = 0; c.Width = 100; c.Height = 40;
    const target = Figure.fromKind('rectangle', 300, 200, { width: 80, height: 60 });
    return { c, target };
}

describe('Callout', () => {
    test('is a TextNode (hence a Figure)', () => {
        const { c } = scene();
        assert.ok(c instanceof Figure);
    });
    test('LeaderGeometry undefined with no target', () => {
        const { c } = scene();
        assert.equal(c.LeaderGeometry, undefined);
    });
    test('LeaderGeometry defined after setting a target; LeaderTargetId is target Id', () => {
        const { c, target } = scene(); target.Id = 'tgt';
        c.LeaderTargetNode = target;
        assert.ok(c.LeaderGeometry !== undefined);
        assert.equal(c.LeaderTargetId, 'tgt');
    });
    test('LeaderGeometry recomputes when the target moves', () => {
        const { c, target } = scene();
        c.LeaderTargetNode = target;
        const before = c.LeaderGeometry;
        target.Left = 500;
        assert.notEqual(c.LeaderGeometry, before);
    });
    test('Detach stops tracking: later target moves do not recompute', () => {
        const { c, target } = scene();
        c.LeaderTargetNode = target;
        c.Detach();
        const after = c.LeaderGeometry;
        target.Left = 999;
        assert.equal(c.LeaderGeometry, after);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/framework/diagram/tests/callout.test.ts`
Expected: FAIL — `Cannot find module '../callout.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/framework/diagram/callout.ts` by porting the leader logic **verbatim** from `callout-node-vm.ts` (`ILeaderTarget`, `boxEdgeToward`, `LeaderTargetNodeKey`, `LeaderGeometryKey`, `_retrackTarget`, `_updateLeader`, `Detach`, `OnPropertyChanged`), changing only the base class to `TextNode` and the own-bounds change detection to Figure's geometry keys. The leader math is unchanged — it reads `this.Left/Top/Width/Height` (now Figure-native) and duck-types the target via `ILeaderTarget`.

```ts
import { MetaData, Model, type PropertyDescriptor } from '../../runtime/index.js';
import { resolveKey } from '../../runtime/model-internals.js';
import { pathGeometryFromSvgD, type PathGeometry, Point } from '../../visual-engine/index.js';
import { Figure } from './figure.js';
import { TextNode } from './text-node.js';

const TARGET_TRACK: readonly string[] = ['Left', 'Top', 'Width', 'Height'];

export interface ILeaderTarget extends Model {
    readonly Id?: string;
    Left: number; Top: number; Width: number; Height: number;
}

function boxEdgeToward(x: number, y: number, w: number, h: number, target: Point): Point {
    // … port verbatim from callout-node-vm.ts lines 27-38 …
    const cx = x + w / 2, cy = y + h / 2;
    const dx = target.X - cx, dy = target.Y - cy;
    if (dx === 0 && dy === 0) return new Point(cx, cy);
    let t = Number.POSITIVE_INFINITY;
    if (dx > 0) t = Math.min(t, (x + w - cx) / dx);
    if (dx < 0) t = Math.min(t, (x - cx) / dx);
    if (dy > 0) t = Math.min(t, (y + h - cy) / dy);
    if (dy < 0) t = Math.min(t, (y - cy) / dy);
    return new Point(cx + t * dx, cy + t * dy);
}

export class Callout extends TextNode {
    public static readonly LeaderTargetNodeKey = Model.RegisterProperty<ILeaderTarget | undefined>(
        Callout, 'LeaderTargetNode', undefined, MetaData.None);
    public static readonly LeaderGeometryKey = Model.RegisterProperty<PathGeometry | undefined>(
        Callout, 'LeaderGeometry', undefined, MetaData.None);

    private _trackedTarget: ILeaderTarget | undefined = undefined;
    private readonly _onTargetMoved = (): void => { this._updateLeader(); };

    public get LeaderTargetNode(): ILeaderTarget | undefined { return this.get_property_value(Callout.LeaderTargetNodeKey); }
    public set LeaderTargetNode(v: ILeaderTarget | undefined) { this.set_property_value(Callout.LeaderTargetNodeKey, v); }
    public get LeaderTargetId(): string | undefined { return this.get_property_value(Callout.LeaderTargetNodeKey)?.Id; }
    public get LeaderGeometry(): PathGeometry | undefined { return this.get_property_value(Callout.LeaderGeometryKey); }

    public Detach(): void {
        const prev = this._trackedTarget;
        if (prev !== undefined) {
            for (const n of TARGET_TRACK) prev.RemovePropertyChangedListener(resolveKey(prev, undefined, n), this._onTargetMoved);
            this._trackedTarget = undefined;
        }
    }

    protected override OnPropertyChanged(d: PropertyDescriptor, o: unknown, n: unknown): void {
        super.OnPropertyChanged(d, o, n);
        if (d === Callout.LeaderTargetNodeKey.descriptor) { this._retrackTarget(); this._updateLeader(); }
        else if (d === Figure.LeftKey.descriptor || d === Figure.TopKey.descriptor
              || d.Name === 'Width' || d.Name === 'Height') { this._updateLeader(); }
    }

    private _retrackTarget(): void { /* … port verbatim (lines 147-169), using resolveKey … */ }
    private _updateLeader(): void { /* … port verbatim (lines 172-196): boxEdgeToward + local-coord conversion … */ }
}
```

> Port `_retrackTarget` and `_updateLeader` verbatim from `callout-node-vm.ts` (only the class/keys names change). In `OnPropertyChanged`, own-bounds keys are now `Figure.LeftKey`/`Figure.TopKey` (Width/Height stay name-matched via Visual). Confirm `Figure.LeftKey`/`Figure.TopKey` exist (they do).

Add the symbol in `symbol-table.ts` `DEFAULT_SYMBOLS`:

```ts
['Callout', '@pragmatic-lab/mural/framework/diagram/callout.js'],
```

Add the control template in `diagram.template.mu` — the TextNode box plus a leader `Shape` bound to the Callout's `LeaderGeometry` (modeled on the old `DataTemplate[DataType=CalloutNodeVM]`, lines 62-95):

```mu
Template x:key="DefaultCallout" [ TargetType = Callout ] {
    Canvas {
        Border [ Fill = $$Fill, Stroke = $$Stroke ] {
            Border x:name="PART_LabelHost"
        }
        Shape [ Geometry = $$LeaderGeometry, Stroke = (#64748bff, 1.5), IsHitTestVisible = false ]
    }
}
Style [ TargetType = Callout ] {
    Template = @DefaultCallout;
}
```

> Confirm the leader `Shape`/`Stroke` pen syntax against the current callout template. Keep `PART_LabelHost` a `Border` so Figure's `OnApplyTemplate` populates it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/framework/diagram/tests/callout.test.ts`
Expected: PASS (5 tests).
Then: `npm run build:templates`.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/callout.ts src/framework/diagram/diagram.template.mu src/compiler/symbol-table.ts src/framework/diagram/tests/callout.test.ts
git commit -m "feat(diagram): Callout — a Figure with a leader line (alongside CalloutNodeVM)"
```

---

### Task 3: Swap the `'callout'` serializer + document refs to `Callout`; delete `CalloutNodeVM`

**Files:**
- Modify: `src/framework/diagram/node-serializers-default.ts` (`'callout'` serializer)
- Modify: `src/framework/diagram/diagram-document.ts` (imports, `byId`/`pendingLeaders` types, `instanceof CalloutNodeVM`, delete-cascade `Detach`)
- Modify: `src/framework/index.ts` (export `Callout`, `ILeaderTarget` from callout.js)
- Delete: `src/framework/diagram/callout-node-vm.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (remove `DataTemplate[DataType=CalloutNodeVM]`)
- Modify: `src/compiler/symbol-table.ts` (remove `CalloutNodeVM`)
- Test: migrate `src/framework/diagram/tests/m4-callout-node-vm.test.ts`, `m4-callout-autogrow.test.ts`, `m4-callout-delete-detach.test.ts` → `Callout`

**Interfaces:**
- Consumes: `Callout`, `ILeaderTarget` (Task 2).
- Produces: `'callout'` serializer builds a `Callout`; document callout paths reference `Callout`.

- [ ] **Step 1: Update the callout tests to `Callout` (they become the failing tests)**

In `m4-callout-node-vm.test.ts`, `m4-callout-autogrow.test.ts`, `m4-callout-delete-detach.test.ts`: replace `import { CalloutNodeVM } from '../callout-node-vm.js'` → `import { Callout } from '../callout.js'`, `new CalloutNodeVM()` → `new Callout()`, `instanceof CalloutNodeVM` → `instanceof Callout`. Geometry setters (`.Left/.Top/.Width/.Height`) are unchanged (Figure has them). Leave assertions otherwise intact.

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/framework/diagram/tests/m4-callout-node-vm.test.ts`
Expected: FAIL — `callout-node-vm.js` still imported elsewhere / `Callout` behaviors not yet wired through the document.

- [ ] **Step 3: Implement the swap**

In `node-serializers-default.ts` `'callout'` serializer: `matches(node) => node instanceof Callout`; `serialize` reads `Callout.Text`/`LeaderTargetId` (same shape); `deserialize(data, base)` → `const callout = new Callout(); placeNode(callout, base); callout.Id = base.id; …`. Import `Callout` instead of `CalloutNodeVM`.

In `diagram-document.ts`: swap the import to `./callout.js`; change `byId` value type and `pendingLeaders`/`instanceof CalloutNodeVM`/`Detach()` cascade + `LeaderTargetNode` typing to `Callout`/`ILeaderTarget`. Update the leader second-pass cast to `import('./callout.js').ILeaderTarget`.

In `src/framework/index.ts`: `export { Callout, type ILeaderTarget } from './diagram/callout.js';` (drop the CalloutNodeVM export).

Remove `DataTemplate[DataType=CalloutNodeVM]` from `diagram.template.mu` and the `CalloutNodeVM` symbol from `symbol-table.ts`. Delete `src/framework/diagram/callout-node-vm.ts`.

- [ ] **Step 4: Run the callout tests + typecheck**

Run: `node --import tsx --test src/framework/diagram/tests/m4-callout-node-vm.test.ts src/framework/diagram/tests/m4-callout-autogrow.test.ts src/framework/diagram/tests/m4-callout-delete-detach.test.ts`
Expected: PASS.
Run: `npm run typecheck` — no dangling `CalloutNodeVM` references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(diagram): serialize/wire callouts as Callout Figures; delete CalloutNodeVM"
```

---

### Task 4: Swap the `'text'` serializer + document refs to `TextNode`; delete `TextNodeVM`

**Files:**
- Modify: `src/framework/diagram/node-serializers-default.ts` (`'text'` serializer)
- Modify: `src/framework/diagram/diagram-document.ts` (imports, `byId` type, any `instanceof TextNodeVM`)
- Modify: `src/framework/index.ts` (export `TextNode`; drop `TextNodeVM`)
- Delete: `src/framework/diagram/text-node-vm.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (remove `DataTemplate[DataType=TextNodeVM]`)
- Modify: `src/compiler/symbol-table.ts` (remove `TextNodeVM`)
- Test: migrate `m4-text-node-vm.test.ts`, `m4-textvm-autogrow.test.ts`, `m4-text-edit.test.ts`, `m4-text-callout-serialize.test.ts` → `TextNode`/`Callout`

**Interfaces:**
- Consumes: `TextNode` (Task 1), `Callout` (Task 3).
- Produces: `'text'` serializer builds a `TextNode`; no remaining `TextNodeVM` references.

- [ ] **Step 1: Update the text tests to `TextNode` (failing tests)**

Replace `TextNodeVM` → `TextNode` (import from `../text-node.js`, `new TextNode()`, `instanceof TextNode`) across the four test files. In `m4-text-callout-serialize.test.ts`, drop the two **legacy** tests (`legacy {kind:"text"}` / `legacy {kind:"callout"}` load) — the clean break removes legacy inference; keep the v2 typed round-trip tests, retargeted to `TextNode`/`Callout`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test src/framework/diagram/tests/m4-text-node-vm.test.ts`
Expected: FAIL — `text-node-vm.js` gone / `'text'` serializer still builds a VM.

- [ ] **Step 3: Implement the swap**

`'text'` serializer: `matches(node) => node instanceof TextNode && !(node instanceof Callout)`; `deserialize` → `const vm = new TextNode(); placeNode(vm, base); vm.Id = base.id; …`. Import `TextNode`/`Callout`; drop `TextNodeVM`/`CalloutNodeVM` imports.

In `diagram-document.ts`: swap import to `./text-node.js`; update `byId` union to `Figure` (all node types are now Figures — simplify `Figure | TextNode | Callout` to `Figure` where the union was only these) and any `instanceof TextNodeVM`.

In `src/framework/index.ts`: `export { TextNode } from './diagram/text-node.js';` (drop `TextNodeVM`).

Remove `DataTemplate[DataType=TextNodeVM]` from `diagram.template.mu` and the `TextNodeVM` symbol from `symbol-table.ts`. Delete `src/framework/diagram/text-node-vm.ts`.

- [ ] **Step 4: Run the text tests + typecheck**

Run: `node --import tsx --test src/framework/diagram/tests/m4-text-node-vm.test.ts src/framework/diagram/tests/m4-textvm-autogrow.test.ts src/framework/diagram/tests/m4-text-edit.test.ts src/framework/diagram/tests/m4-text-callout-serialize.test.ts`
Expected: PASS.
Run: `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(diagram): serialize/wire text nodes as TextNode Figures; delete TextNodeVM"
```

---

### Task 5: Full verification + cleanup

**Files:**
- Modify: any remaining references surfaced by grep (e.g. the stale Plexus comment is out of scope; Mural-only here).

- [ ] **Step 1: Grep for stragglers**

Run: `grep -rn "TextNodeVM\|CalloutNodeVM\|text-node-vm\|callout-node-vm" src` — expect **no** matches (outside deleted files). Fix any remaining import/type/`instanceof`.

- [ ] **Step 2: Full typecheck + templates + suite**

Run: `npm run typecheck` — clean.
Run: `npm run build:templates` — compiles (no `TextNodeVM`/`CalloutNodeVM` symbols).
Run: `npm test` — full suite green (text/callout node behavior, serialization round-trip, diagram rendering).

- [ ] **Step 3: Sanity-render check**

Confirm a `TextNode` and a `Callout` build + arrange through their templates (a render test mirroring `diagram-inspector-render.test.ts`: `findDataTemplateForType`/style resolution → `Measure`/`Arrange`), and that a `Callout` still shows a leader after a serialize/reload wires its target by id.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(diagram): finish Text/Callout → Figure migration; suite green"
```

---

## Self-review notes

- **Spec coverage:** slice #1 = Text/Callout become Figures (Tasks 1–4), VM classes retired (Tasks 3–4), no store/format change (constraint), leader unchanged (Task 2), tests migrated (Tasks 3–5). ✔
- **Ordering / green boundaries:** new classes added alongside the VMs (T1–T2), then callout swapped+deleted before text (T3 before T4) because `CalloutNodeVM extends TextNodeVM` — deleting `TextNodeVM` first would break the still-present callout VM. ✔
- **Type consistency:** `TextNode`/`Callout`/`ILeaderTarget` names used consistently; `placeNode` signature (`Figure | NodeViewModel`) still accepts `TextNode`/`Callout` (they are Figures). ✔
- **Open verification points flagged inline** (Figure ctor `applyDefaultStyle`, `PART_LabelHost` shape, leader Shape pen syntax) — the implementer confirms against `figure.ts`/`diagram.template.mu` in the relevant task rather than guessing.
