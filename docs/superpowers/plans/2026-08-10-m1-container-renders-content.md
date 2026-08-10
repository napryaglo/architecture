# M1 — Figure Container Renders Content — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) to implement task-by-task.

**Goal:** A node view-model in `Nodes` renders through its `[DataType]` DataTemplate inside a `Figure` container, position two-way bound to the VM; intrinsic shapes untouched.

**Architecture:** `Figure` becomes a container that can host `Content`; add a `ContentPresenter` to its default template; `bindContainer` installs two-way position bindings for `NodeViewModel` items.

**Tech Stack:** mural framework (TypeScript), node:test, `.mu` templates.

## Global Constraints

- Every test file lives in a `tests/` subfolder next to its source.
- Real TypeScript enums; no string-literal unions.
- No `../src` cross-package imports (in-package relative paths only).
- The Diagrammer demo + existing `diagram-distribute-newarch` suite stay green.

---

### Task 1: `NodeViewModel` position/size base

**Files:**
- Create: `src/framework/diagram/node-view-model.ts`
- Test: `src/framework/diagram/tests/node-view-model.test.ts`

**Interfaces:**
- Produces: `class NodeViewModel extends Model` with `Left`, `Top`, `Width`, `Height` number DPs + get/set, and static `*Key` descriptors.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeViewModel } from '../node-view-model.js';

test('NodeViewModel exposes Left/Top/Width/Height DPs with defaults', () => {
    const vm = new NodeViewModel();
    assert.equal(vm.Left, 0);
    assert.equal(vm.Top, 0);
    assert.ok(vm.Width > 0 && vm.Height > 0);
    vm.Left = 40; vm.Top = 25;
    assert.equal(vm.Left, 40);
    assert.equal(vm.Top, 25);
});
```

- [ ] **Step 2: Run it, verify it fails** (`node --test` on the file) — module not found.

- [ ] **Step 3: Implement**

```ts
import { MetaData, Model } from '../../runtime/index.js';
import { DiagramSettings } from './diagram-settings.js';

// Position/size contract every diagram node view-model satisfies. The Figure
// container two-way binds its Left/Top/Width/Height to these; the per-VM
// serializers (M3) read them. Node kinds (ShapeNodeVM, ArchNodeVM) extend this.
export class NodeViewModel extends Model
{
    public static readonly LeftKey   = Model.RegisterProperty<number>(NodeViewModel, 'Left',   0, MetaData.None);
    public static readonly TopKey    = Model.RegisterProperty<number>(NodeViewModel, 'Top',    0, MetaData.None);
    public static readonly WidthKey  = Model.RegisterProperty<number>(NodeViewModel, 'Width',  DiagramSettings.ShapeDefaultSize(), MetaData.None);
    public static readonly HeightKey = Model.RegisterProperty<number>(NodeViewModel, 'Height', DiagramSettings.ShapeDefaultSize(), MetaData.None);

    public get Left():   number { return this.get_property_value(NodeViewModel.LeftKey); }
    public set Left(v:   number) { this.set_property_value(NodeViewModel.LeftKey, v); }
    public get Top():    number { return this.get_property_value(NodeViewModel.TopKey); }
    public set Top(v:    number) { this.set_property_value(NodeViewModel.TopKey, v); }
    public get Width():  number { return this.get_property_value(NodeViewModel.WidthKey); }
    public set Width(v:  number) { this.set_property_value(NodeViewModel.WidthKey, v); }
    public get Height(): number { return this.get_property_value(NodeViewModel.HeightKey); }
    public set Height(v: number) { this.set_property_value(NodeViewModel.HeightKey, v); }
}
```

If `DiagramSettings` import forms a cycle, inline `80` as the default and note it.

- [ ] **Step 4: Run test, verify pass.**
- [ ] **Step 5: Commit** (`feat(diagram): NodeViewModel position/size base`).

---

### Task 2: `ContentPresenter` in the Figure container template

**Files:**
- Modify: `src/framework/diagram/diagram.template.mu` (`DefaultFigure`)
- Test: reuse existing `src/framework/tests/diagram-distribute-newarch.test.ts` (regression)

**Interfaces:**
- Produces: the `Figure` default template now has a `PART_Content` `ContentPresenter`, so `ContentControl.templateContentPresenter` is non-undefined and VM content slots.

- [ ] **Step 1: Add the ContentPresenter** to `DefaultFigure` inside the Canvas, between `PART_Shape` and `PART_LabelHost`:

```
ContentPresenter x:name="PART_Content" [ Width = $$Width, Height = $$Height, IsHitTestVisible = false ]
```

`IsHitTestVisible = false` so the hosted visual never steals the container's drag pointer.

- [ ] **Step 2: Run the regression suite**

Run: `node --test` on `diagram-distribute-newarch.test.ts`
Expected: PASS — intrinsic shapes (`CreateNode('rectangle')`) still render + distribute; adding an empty ContentPresenter is inert when `Content` is undefined.

- [ ] **Step 3: Commit** (`feat(diagram): host Content in Figure container template`).

---

### Task 3: Two-way position binding + VM render

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (`bindContainer`)
- Test: `src/framework/diagram/tests/m1-container-content.test.ts`

**Interfaces:**
- Consumes: `NodeViewModel` (Task 1), `PART_Content` presenter (Task 2).
- Produces: a `NodeViewModel` item wrapped in a container renders its DataTemplate and its position round-trips two-way.

- [ ] **Step 1: Write the failing test**

```ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Application, Model, Size, Visual, type MountableTarget } from '../../../runtime/index.js';
import { Border, ItemsPanelTemplate, TextBlock } from '../../../basic/index.js';
import { PaginatedCanvas } from '../../../basic/panels/paginated-canvas.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Diagram } from '../diagram.js';
import { DiagramDocument } from '../diagram-document.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';
import { SelectionMode } from '../../list/list-box.js';

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(): void {}
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}
class TestNodeVM extends NodeViewModel {}

function build(): { diagram: Diagram; doc: DiagramDocument; surface: Border } {
    const doc = new DiagramDocument();
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel    = new ItemsPanelTemplate(() => new PaginatedCanvas());
    diagram.ReflectSelectionToItems = true;
    diagram.ItemsSource   = doc.Nodes;
    const surface = new Border();
    surface.SetChild(diagram);
    const t = new FakeTarget(); t.Content = surface;
    return { diagram, doc, surface };
}
function layout(s: Border): void {
    s.Measure(new Size(800, 600));
    s.Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
}
function registerTemplate(): void {
    Application.current!.Resources.Set(TestNodeVM, new DataTemplate((d) => {
        const b = new Border(); b.SetChild(new TextBlock('vm')); return b;
    }, TestNodeVM));
}
function containerFor(diagram: Diagram, vm: Model): Figure {
    const c = diagram.ItemContainerGenerator.ContainerFromItem(vm);
    assert.ok(c instanceof Figure, 'VM item should be wrapped in a Figure container');
    return c;
}

beforeEach(() => { initTestApp(); registerTemplate(); });

test('a NodeViewModel item renders its DataTemplate in the container', () => {
    const { diagram, doc, surface } = build();
    const vm = new TestNodeVM(); vm.Left = 30; vm.Top = 20;
    doc.Nodes.Add(vm);
    layout(surface);
    const fig = containerFor(diagram, vm);
    // The resolved content is the template's Border, not the red "can not resolve" error.
    const border = fig.GetTemplateChild('PART_Content')!.GetVisualChildren?.()?.[0];
    assert.ok(border instanceof Border, 'presenter hosts the DataTemplate Border');
});

test('container position binds two-way to the VM', () => {
    const { diagram, doc, surface } = build();
    const vm = new TestNodeVM(); vm.Left = 120; vm.Top = 40;
    doc.Nodes.Add(vm);
    layout(surface);
    const fig = containerFor(diagram, vm);
    assert.equal(fig.Left, 120);              // VM -> container
    fig.Left = 60;                            // container (drag) -> VM
    assert.equal(vm.Left, 60);
});

test('selection surfaces the VM, not the container', () => {
    const { diagram, doc, surface } = build();
    const vm = new TestNodeVM();
    doc.Nodes.Add(vm);
    layout(surface);
    const fig = containerFor(diagram, vm);
    diagram.HandleContainerClick(fig, 0 as never);
    assert.equal(diagram.SelectedItem, vm);
});
```

Adjust the presenter-child accessor (`PART_Content` child) to the actual `ContentPresenter` API discovered during Task 2 (e.g. its slotted `Content`/visual-child getter) — the assertion intent is "a Border, not the unresolved-template TextBlock".

- [ ] **Step 2: Run, verify failure** — position is 0 / content unresolved before `bindContainer` binds.

- [ ] **Step 3: Implement** — in `diagram.ts`, add the `Binding` import and extend `bindContainer`:

```ts
// at top: import { Binding, BindingMode } from '../../runtime/index.js';
// and:    import { NodeViewModel } from './node-view-model.js';

private bindContainer(node: Figure, item: unknown): void
{
    if (item instanceof Model)
    {
        node.Tag         = item;
        node.DataContext = item;
        node.Content     = item;
        if (item instanceof NodeViewModel)
        {
            node.set_property_value(Figure.LeftKey,   new Binding(item, 'Left',   BindingMode.TwoWay));
            node.set_property_value(Figure.TopKey,    new Binding(item, 'Top',    BindingMode.TwoWay));
            node.set_property_value(Figure.WidthKey,  new Binding(item, 'Width',  BindingMode.TwoWay));
            node.set_property_value(Figure.HeightKey, new Binding(item, 'Height', BindingMode.TwoWay));
        }
    }
    else
    {
        node.Tag         = undefined;
        node.DataContext = undefined;
        node.Content     = undefined;
    }
}
```

- [ ] **Step 4: Run the new test + the newarch regression, verify all pass.**
- [ ] **Step 5: Commit** (`feat(diagram): two-way position bind + render VM nodes`).

---

### Task 4: Suite + typecheck gate

- [ ] **Step 1:** Run the full mural test suite (`npm test`) — all green.
- [ ] **Step 2:** Run `npm run typecheck` (or the project's TS check) — clean.
- [ ] **Step 3:** If the `.mu` change needs compilation for tests, run the mural `.mu` compile and confirm no template errors.
- [ ] **Step 4:** Finishing-a-development-branch is deferred — M1 stays on the branch for M2+.

## Self-Review

- Spec coverage: NodeViewModel (Task 1), ContentPresenter host (Task 2), position two-way + render + selection (Task 3), regression (Tasks 2–3), suite gate (Task 4). ✓
- Placeholders: the presenter-child accessor in the render test is flagged to pin against the real `ContentPresenter` API during Task 2. No other placeholders.
- Types: `Figure.LeftKey/TopKey/WidthKey/HeightKey` exist; `NodeViewModel.{Left,Top,Width,Height}` match; `Binding(source, path, mode)` per `runtime/binding/binding.ts`.
