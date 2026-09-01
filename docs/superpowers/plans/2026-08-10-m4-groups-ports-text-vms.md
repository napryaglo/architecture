# M4 — Groups + Ports + Text/Callout VMs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the node-model unification — groups hold VM members, VM shapes get named/side-port fidelity, and `TextShape`/`Callout` become `TextNodeVM`/`CalloutNodeVM` + DataTemplates — with the two M4-deferred group tests re-enabled and the suite at zero M4 skips.

**Architecture:** Three ordered, independently-green stages. **A. Groups** widens the existing `Group` control to accept `NodeViewModel` members (the VM only needs a `Parent` field; drag-elevation is already VM-aware by duck-typing). **B. Ports** extracts Figure's side-endpoint host into a shared collaborator both Figure and `ShapeNodeVM` compose, then broadens the connector's `instanceof Figure` port guards to a duck-typed host interface. **C. Text/Callout VMs** ports the two Figure-based text shapes to VMs + `[DataType]` templates, moving the leader from a Canvas-injected Shape to a template Shape bound to a `LeaderGeometry` DP and re-plumbing in-place edit.

**Tech Stack:** mural framework (TypeScript), `node:test`, `.mu` / `.template.mu`.

## Global Constraints

- **Test files live in a `tests/` subfolder next to source** (`src/framework/diagram/tests/`).
- **Real enums, never string-literal unions** — reference enum members at use sites.
- **No `../src` cross-package imports**; framework code imports within mural (`../../runtime/index.js`, `../../basic/index.js`, `./…`).
- **Markup-facing types** referenced in `.mu`/`.template.mu` must be registered in `src/compiler/symbol-table.ts` (as `ShapeNodeVM` is) and exported from the framework barrel (`src/framework/index.ts`).
- **Cross-class internals** reach-ins use a named interface + cast, never bracket access (per Mural CLAUDE.md).
- **Full suite green after every task**; the two M4 group skips are retired by end of Stage A; no new skips.
- **Consumers stay green** after each stage: the diagram demo (`demo/demos/diagram`) and `npm run typecheck:demos`.
- **Reference pattern:** `src/framework/diagram/shape-node-vm.ts` (VM DPs, `fromKind`/`fromSource`, `_rebuildGeometry`, `OnPropertyChanged` rescale) and its `[DataType=ShapeNodeVM]` template in `diagram.template.mu`.

---

## STAGE A — Groups on the VM engine

### Task A1: `NodeViewModel.Parent` + widen `Group` to accept VM members

**Files:**
- Modify: `src/framework/diagram/node-view-model.ts`
- Modify: `src/framework/diagram/group.ts`
- Test: `src/framework/diagram/tests/m4-group-vm-members.test.ts`

**Interfaces — Produces:**
- `NodeViewModel.Parent: Group | undefined` (plain field, mirrors `Figure.Parent`).
- `Group.Members: ObservableCollection<Figure | Group | NodeViewModel>`; `Group.EnumerateLeaves(): Iterable<Figure | NodeViewModel>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/m4-group-vm-members.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Group } from '../group.js';
import { ShapeNodeVM } from '../shape-node-vm.js';

function app(): void { Application.current = null; new Application(); }

describe('M4 Group — VM members', () => {
    test('bbox = union of VM members', () => {
        app();
        const a = ShapeNodeVM.fromKind('rectangle', 100, 100, { width: 40, height: 40 });
        const b = ShapeNodeVM.fromKind('rectangle', 200, 180, { width: 60, height: 20 });
        const g = new Group([a, b]);
        assert.equal(g.Left, 100, 'group Left = member-min X');
        assert.equal(g.Top, 100, 'group Top = member-min Y');
        assert.equal(g.Width, 160, 'union width = 260 - 100');
        assert.equal(g.Height, 100, 'union height = 200 - 100');
    });

    test('grouping sets each VM member Parent', () => {
        app();
        const a = ShapeNodeVM.fromKind('rectangle', 0, 0);
        const g = new Group([a]);
        assert.equal(a.Parent, g, 'member VM Parent points at the group');
    });

    test('Translate moves every VM member and tracks bbox', () => {
        app();
        const a = ShapeNodeVM.fromKind('rectangle', 100, 100, { width: 40, height: 40 });
        const b = ShapeNodeVM.fromKind('rectangle', 200, 100, { width: 40, height: 40 });
        const g = new Group([a, b]);
        g.Translate(50, 20);
        assert.equal(a.Left, 150); assert.equal(a.Top, 120);
        assert.equal(b.Left, 250); assert.equal(b.Top, 120);
        assert.equal(g.Left, 150, 'bbox Left follows members');
        assert.equal(g.Top, 120, 'bbox Top follows members');
    });

    test('member move re-fires bbox recompute', () => {
        app();
        const a = ShapeNodeVM.fromKind('rectangle', 100, 100, { width: 40, height: 40 });
        const g = new Group([a]);
        a.Left = 300;
        assert.equal(g.Left, 300, 'bbox tracks an individual member move');
    });

    test('EnumerateLeaves yields VM leaves through nesting', () => {
        app();
        const a = ShapeNodeVM.fromKind('rectangle', 0, 0);
        const b = ShapeNodeVM.fromKind('rectangle', 100, 0);
        const inner = new Group([b]);
        const outer = new Group([a, inner]);
        const leaves = [...outer.EnumerateLeaves()];
        assert.deepEqual(new Set(leaves), new Set([a, b]));
    });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx tsx --conditions=development --test "src/framework/diagram/tests/m4-group-vm-members.test.ts"`
Expected: FAIL — `Group` constructor rejects `ShapeNodeVM` (type), `a.Parent` is not a property, `_listenMember` attaches Figure keys to a VM so the bbox recompute never fires.

- [ ] **Step 3: Implement**

In `node-view-model.ts`, add the back-ref field and a type-only Group import (VM only needs the type — avoids a runtime cycle since `group.ts` imports `Figure` and `NodeViewModel` values):
```ts
import type { Group } from './group.js';
// …inside class NodeViewModel, after the DP getters/setters:
    /** Enclosing group, or undefined when top-level. View-invisible
     *  structural metadata, so a plain field (mirrors Figure.Parent). */
    public Parent: Group | undefined = undefined;
```

In `group.ts`:
- Import the VM: `import { NodeViewModel } from './node-view-model.js';`
- Define the member union once and use it everywhere `Figure | Group` appears today (constructor param + `initialMembers`, `Members`, `_memberListeners` key, `_handleMembersChange` change type, `_listenMember` param, `_removeMember` param):
```ts
type GroupMember = Figure | Group | NodeViewModel;
```
  - `public readonly Members: ObservableCollection<GroupMember> = new ObservableCollection();`
  - `constructor(initialMembers?: readonly GroupMember[])` — body unchanged (it already does `m.Parent = this`; all three member types now carry `Parent`).
- `EnumerateLeaves(): Iterable<Figure | NodeViewModel>` — body unchanged (`m instanceof Group ? yield* recurse : yield m`).
- `_listenMember(m: GroupMember)`: the geometry DP **key objects** differ per type — extend the current `isGroup ? Group.* : Figure.*` pick to three-way:
```ts
private _listenMember(m: GroupMember): () => void
{
    const keys =
        m instanceof Group
            ? { l: Group.LeftKey, t: Group.TopKey, w: Group.WidthKey, h: Group.HeightKey }
            : m instanceof NodeViewModel
                ? { l: NodeViewModel.LeftKey, t: NodeViewModel.TopKey, w: NodeViewModel.WidthKey, h: NodeViewModel.HeightKey }
                : { l: Figure.LeftKey, t: Figure.TopKey, w: Figure.WidthKey, h: Figure.HeightKey };
    const handler = (): void => { if (this._shiftSuppressed) return; this._recomputeBounds(); };
    m.AddPropertyChangedListener(keys.l, handler);
    m.AddPropertyChangedListener(keys.t, handler);
    m.AddPropertyChangedListener(keys.w, handler);
    m.AddPropertyChangedListener(keys.h, handler);
    return (): void => {
        m.RemovePropertyChangedListener(keys.l, handler);
        m.RemovePropertyChangedListener(keys.t, handler);
        m.RemovePropertyChangedListener(keys.w, handler);
        m.RemovePropertyChangedListener(keys.h, handler);
    };
}
```
  - **Do NOT change `_shiftBy` or `_recomputeBounds`** — they use the `.Left/.Top/.Width/.Height` getters/setters, which all three member types expose, so they already translate/measure VM members correctly.

- [ ] **Step 4: Run, verify PASS**

Run: `npx tsx --conditions=development --test "src/framework/diagram/tests/m4-group-vm-members.test.ts"`
Then `npm run typecheck`. Both green.

- [ ] **Step 5: Commit**

```
feat(diagram): groups accept NodeViewModel members (Parent + key-aware listen)
```

---

### Task A2: wire Group/Ungroup Parent through the document + re-enable the 2 skipped tests

**Files:**
- Modify: `src/framework/diagram/diagram-document.ts` (`Group` ~526-550, `Ungroup` ~554-585, `_topLevel` ~806-813)
- Modify: `src/framework/tests/diagram-distribute-newarch.test.ts` (the two `test.skip`s ~241, ~292)
- Test: the two re-enabled tests above + new assertions in `m4-group-vm-members.test.ts` for ungroup.

**Interfaces — Consumes:** `NodeViewModel.Parent`, widened `Group.Members` (Task A1).

- [ ] **Step 1: Write / re-enable the failing tests**

In `diagram-distribute-newarch.test.ts`, change both `test.skip(` to `test(` (lines ~241 and ~292) and adapt each to drive the gesture through the **container** (VM members' pointer handlers live on the wrapping Figure, not the VM):

For *"Dragging a … inside a Group moves the entire group"* — replace the direct `a.OnPointerDown/OnPointerMove` calls with the container:
```ts
const fa = diagram.Generator.ContainerFromItem(a) as unknown as {
    OnPointerDown(a: unknown): void; OnPointerMove(a: unknown): void;
};
const argsDown = { Kind: 'PointerDown' as const, Source: fa, Visual: fa,
    HostX: 150, HostY: 150, PointerId: 0, Modifiers: ModifierKeys.None, Handled: false,
    CapturePointer: () => {}, ReleasePointerCapture: () => {} };
fa.OnPointerDown(argsDown);
fa.OnPointerMove({ ...argsDown, Kind: 'PointerMove' as const, HostX: 200, HostY: 170, Handled: false });
// assertions unchanged: a.Left===150, b.Left===350, c.Left===550, grp.Left===150
```
Keep the group-detection loop (`(n as { Members?: unknown }).Members !== undefined`) — it still finds the `Group`.

For *"AlignCenter … preserves intra-group spacing"* — select each leaf via its container:
```ts
const clk = (vm: unknown) =>
    diagram.HandleContainerClick(
        diagram.Generator.ContainerFromItem(vm) as unknown as Visual,
        ModifierKeys.Control);
diagram.HandleContainerClick(
    diagram.Generator.ContainerFromItem(standalone) as unknown as Visual, ModifierKeys.None);
clk(m1); clk(m2);
diagram.AlignCenterCommand?.Execute();
layout(surface);
assert.equal(m2.Left - m1.Left, preSpacing, 'intra-group spacing survives AlignCenter');
```

Add an ungroup assertion to `m4-group-vm-members.test.ts` (document-level — build a `DiagramDocument`, `CreateNode` two VMs, `Group` then `Ungroup`):
```ts
test('Ungroup clears member Parent and restores them to the root', () => {
    // app + DiagramDocument; const a = doc.CreateNode('rectangle',0,0)!, b = doc.CreateNode('rectangle',100,0)!;
    // doc.Group([a,b]); const grp = <the Group in doc.Nodes>;
    // doc.Ungroup([grp]);
    // assert a.Parent === undefined && b.Parent === undefined;
    // assert doc.Nodes still contains a and b and no longer contains grp.
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npx tsx --conditions=development --test "src/framework/tests/diagram-distribute-newarch.test.ts" "src/framework/diagram/tests/m4-group-vm-members.test.ts"`
Expected: FAIL — grouping VM shapes leaves `Parent` unset by the document path and/or `_topLevel` doesn't resolve a VM member to its group, so drag-elevation and ungroup misbehave.

- [ ] **Step 3: Implement**

In `diagram-document.ts`:
- `Group(items)`: the `Group` constructor already sets `m.Parent = this` for each member, so no extra Parent write is needed here — but confirm `selectedTopLevel(items)` and the members handed to `new Group(...)` are the VM items (not containers). Leave the insert-index + `Nodes.Add` logic unchanged.
- `Ungroup(items)`: where members are lifted out and re-parented, ensure the branch that sets `member.Parent = group.Parent` runs for `NodeViewModel` members too (it operates on `member.Parent`, which VMs now have — verify no `instanceof Figure` narrows it out; broaden if it does).
- `_topLevel(entity)` (~806-813): it walks the `Parent` chain gated on `instanceof Figure || instanceof Group`; add `|| entity instanceof NodeViewModel` (or duck-type on `'Parent' in entity`) so a VM member resolves up to its top-level `Group`.

- [ ] **Step 4: Run, verify PASS**

Run the two files from Step 2, then the group/selection regression:
`npx tsx --conditions=development --test "src/framework/**/tests/*group*.test.ts" "src/framework/**/tests/*distribute*.test.ts" "src/framework/**/tests/*select*.test.ts"`
Then `npm run typecheck`. All green; the two former skips now pass.

- [ ] **Step 5: Commit**

```
feat(diagram): group/ungroup + top-level resolution for VM members; re-enable group tests
```

---

## STAGE B — Port fidelity for VM shapes

### Task B1: extract Figure's side-endpoint host into a shared collaborator; give `ShapeNodeVM` ports

**Files:**
- Create: `src/framework/diagram/side-endpoint-host.ts`
- Modify: `src/framework/diagram/figure.ts` (delegate its `_sideEndpoints` registry + `GetSideSlot`/`GetSideEndpointCount`/`SlotIndexForPosition`/`_registerSideEndpoint`/`_unregisterSideEndpoint`/`_fireSideRebalance` to the collaborator, preserving behavior)
- Modify: `src/framework/diagram/shape-node-vm.ts` (compose the same collaborator; add a `Ports` getter)
- Test: `src/framework/diagram/tests/m4-vm-ports.test.ts`

**Interfaces — Produces:**
```ts
// side-endpoint-host.ts
export interface ISideEndpointHost {
    readonly Ports: readonly Port[];
    GetSideSlot(ep: ConnectorEndpoint, side: ResolvedPortSide): { index: number; count: number } | undefined;
    GetSideEndpointCount(side: ResolvedPortSide): number;
    SlotIndexForPosition(side: ResolvedPortSide, cursor: Point): number | undefined;
    _registerSideEndpoint(side: ResolvedPortSide, ep: ConnectorEndpoint, owner: unknown, rebalance: () => void): void;
    _unregisterSideEndpoint(side: ResolvedPortSide, ep: ConnectorEndpoint): void;
}
// SideEndpointRegistry: the reusable implementation of the _sideEndpoints map +
// register/unregister/slot/rebalance logic, holding no Figure-specific state.
export class SideEndpointRegistry { /* … methods above, minus Ports … */ }
```
`ShapeNodeVM` gains `get Ports(): readonly Port[]` resolving per-kind defaults through the same path Figure uses (`this.ExplicitPorts ?? (this.PortProvider ?? resolveDefaultPortProvider(this)).GetPorts(this)`), keyed by `Kind`.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/m4-vm-ports.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { ShapeNodeVM } from '../shape-node-vm.js';

function app(): void { Application.current = null; new Application(); }

describe('M4 ShapeNodeVM ports', () => {
    test('Ports resolves per-kind defaults (non-empty)', () => {
        app();
        const vm = ShapeNodeVM.fromKind('rectangle', 0, 0, { width: 80, height: 60 });
        assert.ok(vm.Ports.length > 0, 'a rectangle VM exposes default ports');
    });

    test('side-endpoint registration reports slot index + count', () => {
        app();
        const vm = ShapeNodeVM.fromKind('rectangle', 0, 0, { width: 80, height: 60 });
        const host = vm as unknown as import('../side-endpoint-host.js').ISideEndpointHost;
        const side = /* PortSide.East resolved */ ;   // use the same ResolvedPortSide the resolver uses
        const ep1 = {} as never, ep2 = {} as never;   // opaque endpoints; identity only
        host._registerSideEndpoint(side, ep1, vm, () => {});
        host._registerSideEndpoint(side, ep2, vm, () => {});
        assert.deepEqual(host.GetSideSlot(ep1, side), { index: 0, count: 2 });
        assert.deepEqual(host.GetSideSlot(ep2, side), { index: 1, count: 2 });
        assert.equal(host.GetSideEndpointCount(side), 2);
    });
});
```
(Resolve `side` using the real `ResolvedPortSide` value the resolver passes — read `figure.ts`/`port.ts` for the concrete type; the test asserts insertion-order slots.)

- [ ] **Step 2: Run, verify FAIL** — `ShapeNodeVM` has no `Ports`/`_registerSideEndpoint`.

- [ ] **Step 3: Implement**
  - Move Figure's `_sideEndpoints` map, `_sideRebalanceCallbacks`, `_sideEndpointOwners`, `_fireSideRebalance`, `_registerSideEndpoint`, `_unregisterSideEndpoint`, `GetSideSlot`, `GetSideEndpointCount`, `SlotIndexForPosition` into `SideEndpointRegistry` (they reference only endpoints + sides + the host's `ArrangedRect`/bounds — pass bounds in where `SlotIndexForPosition` needs them). Keep Figure's public methods, delegating to a held `private readonly _sideHost = new SideEndpointRegistry(...)`. Behavior must be identical — the existing connector/side-slot tests are the guard.
  - In `ShapeNodeVM`, hold the same `SideEndpointRegistry`, expose the `ISideEndpointHost` surface by delegation, and add the `Ports` getter (per-kind via `resolveDefaultPortProvider`). `ShapeNodeVM` already has `Left/Top/Width/Height` (bounds) and `Geometry` (outline ports).
  - `SlotIndexForPosition` and the slot geometry read the host rect — supply it from the host (`Figure.ArrangedRect` / a VM bounds rect built from `Left/Top/Width/Height`).

- [ ] **Step 4: Run, verify PASS** — the new test + the full connector/port regression (`connector.test.ts`, `diagram-document-connectors.test.ts`, `port-outline.test.ts`, `m3-connector-vm.test.ts`) green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
refactor(diagram): shared SideEndpointRegistry; ShapeNodeVM exposes ports
```

---

### Task B2: broaden the connector port guards from `instanceof Figure` to the host interface

**Files:**
- Modify: `src/framework/diagram/connector.ts` (`endpointSideSlot` ~1280, `bakeSideIfBare` ~1305, **and every other `instanceof Figure` gate on the side-endpoint/port path** — grep them)
- Test: `src/framework/diagram/tests/m4-vm-port-routing.test.ts`

**Interfaces — Consumes:** `ISideEndpointHost` (Task B1).

- [ ] **Step 1: Write the failing test**

```ts
// Build a diagram (mirror m3-connector-vm harness). Two ShapeNodeVMs a,b.
// Create a connector a→b with an explicit East PortSide on the source endpoint.
test('a VM-shape endpoint with an explicit side anchors at the side port, not the clipped bbox', () => {
    // after layout + connector resolve: the source anchor sits on a's East edge
    // at the side-slot position (single slot => mid-edge), NOT a geometric-clip point.
});
test('two connectors sharing a VM side distribute across slots', () => {
    // two connectors, both East on `a`; assert their source anchors differ (slot 0 vs slot 1).
});
```
(Read `m3-connector-vm.test.ts` for the exact harness — `initTestApp`, Diagram, surface, layout — and how it inspects a resolved endpoint's anchor.)

- [ ] **Step 2: Run, verify FAIL** — VM endpoints fall through `endpointSideSlot`'s `!(ep.Node instanceof Figure)` guard to geometric clip; both connectors resolve to the same clipped point.

- [ ] **Step 3: Implement**
  - Replace `if (!(ep.Node instanceof Figure)) return undefined;` in `endpointSideSlot` (and the mirror in `bakeSideIfBare`) with a duck-typed host check:
```ts
function asSideSlotHost(node: unknown): ISideEndpointHost | undefined {
    return node !== undefined && typeof (node as { GetSideSlot?: unknown }).GetSideSlot === 'function'
        ? (node as ISideEndpointHost) : undefined;
}
// guard becomes:  const host = asSideSlotHost(ep.Node); if (host === undefined) return undefined;
// then call host.GetSideSlot(...) instead of (ep.Node as Figure).GetSideSlot(...)
```
  - Grep `connector.ts` for **all** `instanceof Figure` on the side-endpoint / registration path (e.g. where `_registerSideEndpoint`/`_unregisterSideEndpoint` are called) and broaden those to `asSideSlotHost(...)` too, so VM endpoints both register and resolve. Leave `instanceof Figure` guards that gate genuinely Figure-only visual concerns untouched.

- [ ] **Step 4: Run, verify PASS** — the two new tests + the full connector regression green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
feat(diagram): VM shapes honor named/side ports (duck-typed side-slot host)
```

---

## STAGE C — Text/Callout become VMs

### Task C1: `TextNodeVM` + `[DataType=TextNodeVM]` template + registration

**Files:**
- Create: `src/framework/diagram/text-node-vm.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (add the DataTemplate)
- Modify: `src/compiler/symbol-table.ts` (register `TextNodeVM`), `src/framework/index.ts` (export it)
- Test: `src/framework/diagram/tests/m4-text-node-vm.test.ts`

**Interfaces — Produces:** `class TextNodeVM extends NodeViewModel` with `Text: ShapeText` (AutoFit=GrowShape), `Fill`/`Stroke` DPs, default 120×44; a `LabelText` convenience get/set proxying `Text.Content`.

- [ ] **Step 1: Write the failing test**

```ts
// src/framework/diagram/tests/m4-text-node-vm.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { TextNodeVM } from '../text-node-vm.js';

function app(): void { Application.current = null; new Application(); }

describe('M4 TextNodeVM', () => {
    test('defaults: 120x44, empty label, GrowShape autofit', () => {
        app();
        const vm = new TextNodeVM();
        assert.equal(vm.Width, 120); assert.equal(vm.Height, 44);
        assert.equal(vm.LabelText, '');
    });
    test('LabelText proxies Text.Content', () => {
        app();
        const vm = new TextNodeVM();
        vm.LabelText = 'note';
        assert.equal(vm.Text.Content, 'note');
    });
});
```
Add a render test in the M4 template harness (mirror `m2-shape-render.test.ts`): a `TextNodeVM` in a diagram materializes a container whose `[DataType=TextNodeVM]` template shows the label text (assert a `TextBlock`/label host carrying `LabelText`).

- [ ] **Step 2: Run, verify FAIL** — `TextNodeVM` does not exist.

- [ ] **Step 3: Implement**
  - `text-node-vm.ts`: `extends NodeViewModel`; construct a `ShapeText` (from `./shape-text.js`) with `AutoFit = TextAutoFit.GrowShape`; register `TextKey` (holds the ShapeText, `MetaData.None`), `FillKey`, `StrokeKey` DPs; default `Width=120`/`Height=44` in the constructor (override the NodeViewModel defaults); `get Text`, `get/set LabelText` (proxy `Text.Content`), `get/set Fill/Stroke`. Match `ShapeNodeVM`'s brush defaults idiom.
  - `diagram.template.mu`: add near the `ShapeNodeVM` DataTemplate:
```
DataTemplate [DataType = TextNodeVM] {
    // background + editable label host bound to the VM's Text
    // (follow the ShapeNodeVM template's single-$ data bindings)
}
```
    Draw a background (a `Border`/rectangle bound to `$Fill`/`$Stroke`, `$Width`/`$Height`) and a label host bound to `$Text` / `$LabelText`. Reuse the label-host control the Figure template uses for its `PART_LabelHost` so in-place edit (Task C2) can target it.
  - Register `['TextNodeVM', '@pragmatic-tech-ai/mural/framework/diagram/text-node-vm.js']` in `symbol-table.ts`; export from `src/framework/index.ts`.

- [ ] **Step 4: Run, verify PASS** — unit + render test green; `npm test` (pretest builds `.mu`) green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
feat(diagram): TextNodeVM + [DataType=TextNodeVM] template
```

---

### Task C2: re-plumb in-place text edit to the text VM

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (the double-click → `container.Text?.BeginEdit()` path ~1329)
- Modify: `src/framework/diagram/text-node-vm.ts` (expose a `BeginEdit()` entry that drives the VM's `Text`)
- Test: `src/framework/diagram/tests/m4-text-edit.test.ts`

**Interfaces — Consumes:** `TextNodeVM.Text` (C1). **Produces:** double-click on a text-VM container begins editing that VM's text; commit writes back to `TextNodeVM.Text.Content`.

- [ ] **Step 1: Write the failing test**

```ts
// Build a diagram with a TextNodeVM; obtain its container; drive the same
// double-click / edit-entry path the diagram uses; type + commit; assert
// the VM's LabelText updated.
test('double-click a TextNodeVM container edits the VM text; commit writes back', () => {
    // … after edit+commit: assert vm.LabelText === 'edited'
});
```
(Read the current edit wiring around `diagram.ts:1329` and `ShapeText.BeginEdit` to mirror how the existing Figure edit test drives commit.)

- [ ] **Step 2: Run, verify FAIL** — the container is the generic Figure whose own `Text` is empty, so the edit targets nothing / the VM text is unchanged.

- [ ] **Step 3: Implement**
  - Route the edit entry so that when the double-clicked container's content is a `TextNodeVM` (read `container.Content`/`DataContext` through a named interface, per the internals rule), edit targets the VM's `Text` (call a `TextNodeVM.BeginEdit()` that begins editing its `Text`, surfaced in the template's label host). Keep the existing Figure-`Text` path for any residual Figure nodes.
  - The exact seam depends on the current edit wiring (`container.Text?.BeginEdit()`); resolve it against that code — the contract is: double-click a text VM → its label host enters edit; commit updates `TextNodeVM.Text.Content`.

- [ ] **Step 4: Run, verify PASS** — the edit test + `shape-text.test.ts` regression green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
feat(diagram): in-place edit targets TextNodeVM text
```

---

### Task C3: `CalloutNodeVM` + template-driven leader

**Files:**
- Modify: `src/framework/diagram/text-node-vm.ts` (add `CalloutNodeVM extends TextNodeVM`) or Create `src/framework/diagram/callout-node-vm.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (`[DataType=CalloutNodeVM]` template with a leader `Shape`)
- Modify: `src/compiler/symbol-table.ts` / `src/framework/index.ts`
- Test: `src/framework/diagram/tests/m4-callout-node-vm.test.ts`

**Interfaces — Produces:** `CalloutNodeVM` with `LeaderTargetId: string | undefined`, a read-only `LeaderGeometry: PathGeometry | undefined` DP, and a `ResolveLeaderTarget(byId: (id) => NodeViewModel | Figure | undefined)` hook the document calls to bind the target.

- [ ] **Step 1: Write the failing test**

```ts
// Two nodes: a CalloutNodeVM c and a target ShapeNodeVM t. Wire c.LeaderTargetId = t.Id,
// resolve the target, layout. Assert c.LeaderGeometry is defined and its endpoint sits on
// t's box edge. Move t; assert LeaderGeometry re-computes toward t's new position.
test('callout draws a leader to its target and re-routes when the target moves', () => { /* … */ });
```

- [ ] **Step 2: Run, verify FAIL** — `CalloutNodeVM` does not exist.

- [ ] **Step 3: Implement**
  - `CalloutNodeVM extends TextNodeVM`: add `LeaderTargetIdKey` (string|undefined) and a read-only `LeaderGeometryKey` (PathGeometry|undefined). On target resolve, hold the target VM/Figure, subscribe to its `Left/Top/Width/Height` (via the right DP keys per type — reuse the `positionKeysOf` idea, or the target's public getters + a listener), and recompute `LeaderGeometry` via the existing `boxEdgeToward` math (port it from `text-shape.ts` ~136-147) whenever the callout's own bounds or the target's bounds change. Store the target as a reference resolved from `LeaderTargetId`, never serialize the reference (id only).
  - Template `[DataType=CalloutNodeVM]`: the `TextNodeVM` visual + a leader `Shape [ Geometry = $LeaderGeometry, IsHitTestVisible = false ]` (stroke per the current `CALLOUT_LEADER` pen).
  - Register + export as in C1.

- [ ] **Step 4: Run, verify PASS** — the leader test green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
feat(diagram): CalloutNodeVM with template-driven leader (id-referenced target)
```

---

### Task C4: swap the `text`/`callout` serializers to build VMs + update round-trip tests

**Files:**
- Modify: `src/framework/diagram/node-serializers-default.ts` (`text`/`callout` `matches`/`deserialize`)
- Modify: `src/framework/diagram/diagram-document.ts` (the callout-leader second pass — resolve by id to the VM)
- Modify: tests asserting `instanceof TextShape`/`Callout` (`m3-node-serialize.test.ts`, `shape-text.test.ts`, `text-shape.test.ts`, `field.test.ts` as applicable)
- Test: extend `m4-text-node-vm.test.ts` / `m4-callout-node-vm.test.ts` with round-trip cases

**Interfaces — Consumes:** `TextNodeVM`, `CalloutNodeVM` (C1/C3). Keeps the `{ text, leaderTargetId }` `data` payloads unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
test('typed round-trip: TextNodeVM + CalloutNodeVM reload as VMs', () => {
    // doc with a TextNodeVM + a CalloutNodeVM (leader → the text node); Save → Load into doc2;
    // assert doc2 nodes are instanceof TextNodeVM / CalloutNodeVM; label + leaderTarget restored by id.
});
test('legacy {kind:"text"|"callout"} scene loads as the VMs', () => {
    // hand-written legacy payload → Load → TextNodeVM / CalloutNodeVM.
});
```
Update the existing `m3-node-serialize.test.ts` text/callout assertions from `TextShape`/`Callout` to `TextNodeVM`/`CalloutNodeVM`.

- [ ] **Step 2: Run, verify FAIL** — serializers still build `new TextShape()` / `new Callout()`.

- [ ] **Step 3: Implement**
  - In `node-serializers-default.ts`: `text` `matches: node instanceof TextNodeVM && !(node instanceof CalloutNodeVM)`; `deserialize`: `new TextNodeVM()` + `placeNode` + `applySerializedText(vm.Text, data.text)`. `callout` `matches: node instanceof CalloutNodeVM`; `deserialize`: `new CalloutNodeVM()` + text; leader id stays in `data.leaderTargetId`. Serialize unchanged (`serializeShapeText(node.Text)`, `node.LeaderTargetId`).
  - In `diagram-document.ts`, the callout second pass (`pendingLeaders`): resolve `targetId` against the rebuilt `byId` map to a `TextNodeVM`/`ShapeNodeVM`/Figure and call the callout VM's target-resolve hook (C3), instead of setting a `LeaderTargetNode` Figure DP. Widen `byId`'s value type to include the VM types.
  - Update the touched `instanceof` assertions in the listed tests.

- [ ] **Step 4: Run, verify PASS** — new round-trips + all existing save/load regressions green; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```
feat(diagram): text/callout serialize as VMs; leader resolves by id
```

---

### Task C5: swap consumers off `TextShape`/`Callout`

**Files:**
- Modify: `demo/demos/diagram/diagram.mjs` (+ any `.mts` source) — `new TextShape()`→`new TextNodeVM()`, `new Callout()`→`new CalloutNodeVM()`, `LeaderTargetNode`→`LeaderTargetId`
- Modify: any `DiagramDocument` factory / `CreateNode('text')` path that produced `TextShape`/`Callout`
- Remove/retire: `TextShape`/`Callout` from `text-shape.ts` **only if** no references remain (grep first; leave the file if other code still needs the `ShapeText`/pen consts)
- Test: existing demo build + `npm run typecheck:demos`

- [ ] **Step 1:** Grep every `TextShape` / `Callout` / `LeaderTargetNode` reference across `demo/`, `src/`. List them.
- [ ] **Step 2:** Replace demo/consumer construction with the VM types; set leader via `LeaderTargetId = target.Id`.
- [ ] **Step 3:** If `text-shape.ts`'s `TextShape`/`Callout` classes are now unreferenced (serializers moved to VMs in C4), delete them; keep shared consts/helpers still imported elsewhere.
- [ ] **Step 4: Run** `npm run build:demos:ts` (or the demo build), `npm run typecheck:demos`, and `npm test` — all green.
- [ ] **Step 5: Commit**

```
refactor(diagram): consumers use TextNodeVM/CalloutNodeVM
```

---

## STAGE D — Gate

### Task D1: full suite + typecheck + demo gate

- [ ] **Step 1:** `npm test` — green; the two M4 group skips are **gone** (only the pre-existing baseline skips remain). Report the exact skip list.
- [ ] **Step 2:** `npm run typecheck` + `npm run typecheck:demos` — clean.
- [ ] **Step 3:** Confirm the diagram demo: group move + align (Stage A), connect with VM side-ports (Stage B), create + edit text and callouts (Stage C). Report any gap.

## Self-Review

- **Spec coverage:** Groups widen (A1/A2, re-enables both skips) ✓; per-kind port fidelity + guard broadening (B1/B2) ✓; TextNodeVM (C1), edit re-plumb (C2), CalloutNodeVM leader (C3), serializer swap + legacy (C4), consumer swap (C5) ✓; gate (D1) ✓. GroupViewModel explicitly out of scope, honored (A uses the widen path). ✓
- **Placeholders:** Stage A carries full code (files fully read). B/C give real test code + interfaces + exact file:line targets; the two genuinely code-dependent seams (Figure `GetSideSlot` internals extraction, the edit entry point) are flagged to resolve against the read code, with an explicit behavioral contract and regression guard — not hand-waved logic.
- **Type consistency:** `GroupMember = Figure | Group | NodeViewModel`; `NodeViewModel.Parent: Group | undefined`; `ISideEndpointHost` shared by Figure + ShapeNodeVM; `LeaderTargetId: string` (id, not ref); serializer `data` payloads unchanged from M3. ✓
