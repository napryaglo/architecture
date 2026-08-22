# VM-Backed Container Realization Seam (Mural) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a content view-model (`NodeViewModel`) opt into being realized as a **container** — a `ContainerFigure` subclass whose header shows the VM's own content (icon+label tile) with a clipped child host below — so a Plexus arch node (e.g. a `location`) can visually hold other arch nodes.

**Architecture:** Add `ContentContainerFigure extends ContainerFigure` (from sub-project 1) — same child-host / drop-candidate / placement behavior, but its header hosts `PART_Content` (a `ContentPresenter` that renders the bound VM via its DataTemplate) instead of a `ShapeText` title. The `Diagram`'s `GetContainerForItemOverride` mints a `ContentContainerFigure` (rather than a plain `Figure`) when the item VM duck-types `IsContainer === true`, mirroring the existing `PortProvider` opt-in; `bindContainer` skips `SizeToContent` for it (a container sizes to its box, not its header). The generic `ContainerFigure` is untouched — it remains the visual-only, `ShapeText`-titled container.

**Tech Stack:** TypeScript, Mural framework (`src/framework/diagram`), node:test via tsx, `.mu` control templates.

**Spec:** `Plexus/docs/superpowers/specs/2026-08-23-arch-model-backed-containment-design.md` (§2 "Mural realization seam" — this plan implements the Mural half; the Plexus half is a separate plan built after this is published to Verdaccio).

## Global Constraints

- Every control MUST have a default Style; a control's template is a `ControlTemplate` on its default Style block in a `*.template.mu`, resolved via `applyDefaultStyle()` (see `Mural/CLAUDE.md`). A new `TargetType` symbol must be added to `src/compiler/symbol-table.ts`.
- Fixed sets of named values are real TypeScript `enum`s (n/a here — no new option sets).
- Every test file lives in a `tests/` subfolder next to the code it exercises.
- Cross-class internals: named-interface cast, never bracket access.
- `.mu` templates compile to `build/**` (gitignored) via `pretest`→`build:templates` (`tsx src/tooling/build-control-templates.ts`); after editing a `.mu`, run that before template-dependent single-file tests. Single file: `npx tsx --conditions=development --test src/framework/diagram/tests/<file>.test.ts`. Full suite: `npm test`.
- Commit after each task; messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT publish to Verdaccio or bump anything here — publishing is a later, user-gated step. Mural-only, headless + framework-integration tests.

## Grounding (verified 2026-08-23)

- **Realization mint-point:** `Diagram.GetContainerForItemOverride(item): Visual` (`diagram.ts:1756-1766`) returns the item as-is if it's a `Figure`/`Group`; otherwise `const node = new Figure(); this.bindContainer(node, item); return node;`. This `new Figure()` is the seam.
- **`bindContainer(node, item)`** (`diagram.ts:~1855-1918`): sets `node.Content = item`; for a `NodeViewModel` also `node.Id = item.Id`, `node.SizeToContent = true`, transparent Fill/Stroke defaults, `node.PortProvider = (item as { PortProvider?: IPortProvider }).PortProvider` (the duck-typed opt-in to mirror), and fires `_fireContainerBound(node, item)`.
- **`NodeViewModel`** (`node-view-model.ts`): `Id` (DP), `Parent` (plain field). No container flag yet — the VM side of the opt-in (`IsContainer`) is read duck-typed by the Diagram, so nothing needs adding to `NodeViewModel` itself (a Plexus subclass exposes it).
- **`ContainerFigure`** (`container-figure.ts`): `extends Figure`; `static { OverrideMetadata(ContainerFigure, Element.DefaultStyleKeyKey, {default_value: ContainerFigure}) }`; ctor `GetTemplateChild('PART_ChildContainer')`; `ChildHost: Panel | undefined`; `IsDropCandidate` DP; `ContentOrigin = new Point(CONTAINER_PADDING, CONTAINER_TITLE_BAND + CONTAINER_PADDING)`. Constants `CONTAINER_TITLE_BAND=24`, `CONTAINER_PADDING=8`, `CONTAINER_DEFAULT_W=220`, `CONTAINER_DEFAULT_H=160`.
- **Content rendering:** `DefaultFigure` template (`diagram.template.mu:30-42`) has `ContentPresenter x:name="PART_Content" [Width=$$Width, Height=$$Height, IsHitTestVisible=false]`; `ContentControl.Content` (a `MuralBase` VM) auto-resolves its DataTemplate into `PART_Content`. `ContainerFigure` template (`diagram.template.mu:56-71`): `PART_Box` Border(Fill/Stroke) → Canvas → `PART_LabelHost` (Border, Height 24) + `PART_ChildContainer` (clipped Canvas at 8,32) + `when(IsDropCandidate){PART_Box.Fill=@SecondaryContainer}`.
- **Symbol table:** `ContainerFigure` is registered in `src/compiler/symbol-table.ts` (added in sub-project 1) mapping to `container-figure.js`. `ContentContainerFigure` must be added similarly.
- **Test harness:** `tests/m1-container-content.test.ts` and `tests/figure-size-to-content.test.ts` mount a VM `ObservableCollection` on a `Diagram` (register a `DataTemplate` for the VM type in `Application.current.Resources`), `layout(surface)`, then `diagram.Generator.ContainerFromItem(vm) as Figure` and assert. `tests/container-figure.test.ts` constructs `new ContainerFigure()` and asserts `ChildHost instanceof Panel` + `ContentOrigin`.

## File Structure

- `src/framework/diagram/content-container-figure.ts` — CREATE: `ContentContainerFigure extends ContainerFigure` (VM-content header; own default style key + ContentOrigin).
- `src/framework/diagram/diagram.template.mu` — MODIFY: add the `ContentContainerFigure` template (PART_Content header + PART_ChildContainer) + its Style.
- `src/compiler/symbol-table.ts` — MODIFY: register `ContentContainerFigure`.
- `src/framework/diagram/diagram.ts` — MODIFY: `GetContainerForItemOverride` mints `ContentContainerFigure` for `IsContainer` VMs; `bindContainer` skips `SizeToContent` for a `ContainerFigure`.
- Tests: co-located `tests/*.test.ts`.

---

### Task 1: `ContentContainerFigure` — a VM-content container header

**Files:**
- Create: `src/framework/diagram/content-container-figure.ts`
- Modify: `src/framework/diagram/diagram.template.mu` (new template + Style)
- Modify: `src/compiler/symbol-table.ts` (register the TargetType)
- Test: `src/framework/diagram/tests/content-container-figure.test.ts`

**Interfaces:**
- Consumes: `ContainerFigure` (ChildHost, IsDropCandidate, placement behavior), `CONTAINER_PADDING`; `Point`.
- Produces: `ContentContainerFigure extends ContainerFigure` with `ChildHost` (inherited, resolves `PART_ChildContainer`), an overridden `ContentOrigin = new Point(CONTAINER_PADDING, CONTAINER_HEADER_BAND + CONTAINER_PADDING)`, and `export const CONTAINER_HEADER_BAND = 56` (tall enough for an arch icon+label tile, vs the generic 24 title band). Its header hosts `PART_Content`.

- [ ] **Step 1: Write the failing test:**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Panel } from '../../../runtime/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { ContentContainerFigure, CONTAINER_HEADER_BAND } from '../content-container-figure.js';
import { CONTAINER_PADDING } from '../container-figure.js';
import { ContainerFigure } from '../container-figure.js';

test('ContentContainerFigure resolves a ChildHost and is a ContainerFigure', () => {
    initTestApp();
    const c = new ContentContainerFigure();
    assert.ok(c instanceof ContainerFigure, 'is-a ContainerFigure (inherits nesting/placement)');
    assert.ok(c.ChildHost instanceof Panel, 'PART_ChildContainer resolves to a Panel');
});

test('ContentOrigin reserves the icon+label header band + padding', () => {
    initTestApp();
    const c = new ContentContainerFigure();
    assert.equal(c.ContentOrigin.X, CONTAINER_PADDING);
    assert.equal(c.ContentOrigin.Y, CONTAINER_HEADER_BAND + CONTAINER_PADDING);
});
```

- [ ] **Step 2: Run it, verify it fails** (module not found). Run: `npx tsx --conditions=development --test src/framework/diagram/tests/content-container-figure.test.ts`.

- [ ] **Step 3: Implement `content-container-figure.ts`** (mirror `container-figure.ts`'s default-style-key wiring):

```ts
import { MuralBase, Element } from '../../runtime/index.js';
import { Point } from '../../visual-engine/index.js';
import { ContainerFigure, CONTAINER_PADDING } from './container-figure.js';

// Header band tall enough to host an arch node's icon+label tile as the
// container's own identity (vs the generic ContainerFigure's 24px ShapeText
// title band). The child region sits below it.
export const CONTAINER_HEADER_BAND = 56;

// A VM-backed container: same nesting / clip / placement as ContainerFigure, but
// its header shows the bound VM's content (PART_Content → the VM's DataTemplate,
// e.g. an arch node's icon+label tile) instead of a ShapeText title. Minted by
// the Diagram for a VM that opts in via IsContainer.
export class ContentContainerFigure extends ContainerFigure
{
    static { MuralBase.OverrideMetadata(ContentContainerFigure, Element.DefaultStyleKeyKey, { default_value: ContentContainerFigure }); }

    public override get ContentOrigin(): Point
    {
        return new Point(CONTAINER_PADDING, CONTAINER_HEADER_BAND + CONTAINER_PADDING);
    }
}
```

(The ctor is inherited from `ContainerFigure` — it already calls `super()` → `applyDefaultStyle()` and caches `GetTemplateChild('PART_ChildContainer')`. Because `DefaultStyleKeyKey` resolves to `ContentContainerFigure`, the new template below is applied, so `PART_ChildContainer` resolves from it.)

- [ ] **Step 4: Register the TargetType** in `src/compiler/symbol-table.ts` — add an entry mapping `'ContentContainerFigure'` to `'@pragmatic-lab/mural/framework/diagram/content-container-figure.js'`, mirroring the existing `ContainerFigure` entry (grep `ContainerFigure` in that file and copy its line shape).

- [ ] **Step 5: Add the template** to `diagram.template.mu` after the `ContainerFigure` Style block (`:71`). Header hosts `PART_Content`; child region sits below at `CONTAINER_PADDING`, `CONTAINER_HEADER_BAND + CONTAINER_PADDING` = `(8, 64)`:

```
Template x:key="DefaultContentContainerFigure" [ TargetType = ContentContainerFigure ] {
    Border x:name="PART_Box" [ Fill = $$Fill, Stroke = $$Stroke ] {
        Canvas {
            // Header: the bound VM's own tile (icon+label) as the container identity.
            ContentPresenter x:name="PART_Content"
                [ Canvas.Left = 8, Canvas.Top = 4, Width = $$Width, Height = 56,
                  IsHitTestVisible = false ]
            // Child region: clipped Canvas hosting nested Figures, below the header.
            Canvas x:name="PART_ChildContainer"
                [ Canvas.Left = 8, Canvas.Top = 64,
                  Width = $$Width, Height = $$Height, ClipToBounds = true ]
        }
    }
    when ( IsDropCandidate ) { PART_Box.Fill = @SecondaryContainer; }
}
Style [ TargetType = ContentContainerFigure ] {
    Template = @DefaultContentContainerFigure;
}
```

(Match the exact binding dialect to the sibling `DefaultContainerFigure` block — `$$Width`/`$$Height`, `Canvas.Left`/`Canvas.Top`, `x:name`, the `when(IsDropCandidate)` trigger. `56` == `CONTAINER_HEADER_BAND`; `64` == `CONTAINER_HEADER_BAND + CONTAINER_PADDING`; `8` == `CONTAINER_PADDING`. `PART_Content` is the `ContentPresenter` that renders the Figure's `Content` DP via the VM's DataTemplate, same mechanism as `DefaultFigure`.)

- [ ] **Step 6: Build templates + run the test.** Run `npx tsx src/tooling/build-control-templates.ts` (compiles the new `.mu` symbol), then the test file → PASS. If `build-control-templates` errors `unknown symbol 'ContentContainerFigure'`, the symbol-table entry (Step 4) is missing/misspelled.

- [ ] **Step 7: Commit** "feat(diagram): ContentContainerFigure — a VM-content container header".

---

### Task 2: VM opt-in — Diagram realizes an `IsContainer` VM as a `ContentContainerFigure`

**Files:**
- Modify: `src/framework/diagram/diagram.ts` (`GetContainerForItemOverride` + `bindContainer`)
- Test: `src/framework/diagram/tests/vm-container-realization.test.ts`

**Interfaces:**
- Consumes: `ContentContainerFigure` (Task 1); the existing `GetContainerForItemOverride` (`:1756`) + `bindContainer`.
- Produces: a VM whose duck-typed `IsContainer === true` realizes into a `ContentContainerFigure` (with a `ChildHost`, showing the VM content in its header, NOT `SizeToContent`); a normal VM still realizes into a plain `Figure`. The opt-in is read duck-typed (`(item as { IsContainer?: boolean }).IsContainer`), so no change to `NodeViewModel`.

- [ ] **Step 1: Write the failing test** (mirror `tests/m1-container-content.test.ts` harness — register a DataTemplate for the VM type, mount, layout, `Generator.ContainerFromItem`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application, MuralBase, MetaData, ObservableCollection, Size, Visual } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate, TextBlock, DataTemplate } from '../../../basic/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';
import { ContentContainerFigure } from '../content-container-figure.js';

// A VM that opts into a container host via the duck-typed IsContainer flag.
class ContainerVM extends NodeViewModel { public readonly IsContainer = true; }
class PlainVM     extends NodeViewModel {}

function mount(col: ObservableCollection<NodeViewModel>): { diagram: Diagram; surface: Border } {
    const diagram = new Diagram();
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    diagram.ItemsSource = col;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return { diagram, surface };
}

test('a VM with IsContainer realizes as a ContentContainerFigure with a child host', () => {
    initTestApp();
    Application.current!.Resources.Set(ContainerVM,
        new DataTemplate((_d) => { const b = new Border(); b.SetChild(new TextBlock('loc')); return b; }, ContainerVM));
    const vm = new ContainerVM(); vm.Id = 'c1';
    const col = new ObservableCollection<NodeViewModel>(); col.Add(vm);
    const { diagram } = mount(col);
    const container = diagram.Generator.ContainerFromItem(vm);
    assert.ok(container instanceof ContentContainerFigure, 'container-opting VM → ContentContainerFigure');
    assert.ok((container as ContentContainerFigure).ChildHost !== undefined, 'has a ChildHost');
    assert.equal((container as Figure).SizeToContent, false, 'a container is not a size-to-content tile');
    assert.equal((container as Figure).Id, 'c1', 'mirrors the VM Id');
});

test('a plain VM still realizes as a bare Figure (not a container)', () => {
    initTestApp();
    Application.current!.Resources.Set(PlainVM,
        new DataTemplate((_d) => { const b = new Border(); b.SetChild(new TextBlock('n')); return b; }, PlainVM));
    const vm = new PlainVM(); vm.Id = 'n1';
    const col = new ObservableCollection<NodeViewModel>(); col.Add(vm);
    const { diagram } = mount(col);
    const container = diagram.Generator.ContainerFromItem(vm);
    assert.ok(container instanceof Figure, 'still a Figure');
    assert.ok(!(container instanceof ContentContainerFigure), 'not a container');
    assert.equal((container as Figure).SizeToContent, true, 'plain VM stays a content tile');
});
```

- [ ] **Step 2: Run it, verify it fails** (the container-opting VM realizes as a plain `Figure` today → `instanceof ContentContainerFigure` is false).

- [ ] **Step 3: Implement.** In `GetContainerForItemOverride` (`diagram.ts:1756`), mint a `ContentContainerFigure` when the item opts in (import `ContentContainerFigure`):

```ts
    public override GetContainerForItemOverride(item: unknown): Visual
    {
        if (item instanceof Figure || item instanceof Group) return item;
        // A VM can opt into a container host (duck-typed, like PortProvider) — it
        // realizes as a ContentContainerFigure that holds children, its header
        // showing the VM's own content.
        const wantsContainer = (item as { IsContainer?: boolean }).IsContainer === true;
        const node: Figure = wantsContainer ? new ContentContainerFigure() : new Figure();
        this.bindContainer(node, item);
        return node;
    }
```

In `bindContainer`, gate the content-tile `SizeToContent` on the node NOT being a container (a container sizes to its box + auto-grow, not to its header content). Change the `node.SizeToContent = true` line (inside the `item instanceof NodeViewModel` block, `~:1905`):

```ts
                node.SizeToContent = !(node instanceof ContainerFigure);
```

(A `ContentContainerFigure` is-a `ContainerFigure`, so this leaves it `false`. The container keeps whatever geometry `ContainerBound`/`NodeVisualStore` seeds, or its default box — a fresh container with no stored size shows at the `Figure` default; the Plexus drop path seeds a size. No default-size change needed in Mural for the seam itself.)

- [ ] **Step 4: Run it, verify it passes; run the VM-realization test group** (`m1-container-content.test.ts`, `figure-size-to-content.test.ts`, `align-vm-nodes.test.ts`) for regressions.

- [ ] **Step 5: Commit** "feat(diagram): realize an IsContainer VM as a ContentContainerFigure".

---

## Self-Review

**Spec coverage (§2 Mural realization seam):** "VM-opt-in realization — Diagram consults a duck-typed flag and mints a ContainerFigure" → Task 2 (`IsContainer` → `ContentContainerFigure`). "Container header hosts VM content — PART_Content header + PART_ChildContainer below" → Task 1 (`ContentContainerFigure` template). The generic `ContainerFigure` (ShapeText title) is left untouched, as the spec's two-container-kinds table requires. The publish + Plexus bump are explicitly out of this plan (spec §4 sequencing — a later gated step).

**Placeholder scan:** every code step carries real code. Two "match the sibling exactly" directions (the `.mu` binding dialect in Task 1 Step 5; the symbol-table line shape in Task 1 Step 4) point at verified in-repo patterns (`DefaultContainerFigure`, the `ContainerFigure` symbol entry) — not logic gaps. `CONTAINER_HEADER_BAND = 56` and the header `Canvas.Top`/`Height` are concrete, tunable constants, not placeholders.

**Type consistency:** `ContentContainerFigure extends ContainerFigure` (Task 1) is the type minted in `GetContainerForItemOverride` and asserted in Task 2's tests. `CONTAINER_HEADER_BAND` (Task 1) feeds both `ContentOrigin` and the template's `64`/`56`. `IsContainer?: boolean` duck-type is read in Task 2 exactly as `PortProvider` is read in `bindContainer`. `node.SizeToContent = !(node instanceof ContainerFigure)` uses the base class so both `ContainerFigure` and `ContentContainerFigure` are excluded.

**Known follow-ups for the executor (not blockers):** exact `.mu` binding dialect + the `symbol-table.ts` entry shape (match the `ContainerFigure` siblings); whether the header `56`/`Canvas.Top=4` needs tuning once a real arch tile renders (visual polish, refine after the Plexus half consumes it); confirm `Panel`/`DataTemplate`/`TextBlock` import sources against the sibling tests (they vary between `runtime` and `basic` barrels).
