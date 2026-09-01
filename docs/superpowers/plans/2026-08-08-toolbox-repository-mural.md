# Toolbox Repository (mural framework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mural a generic `ToolboxRepository` subsystem — pages of droppable items, per-kind visual resolvers + drop factories resolved from the service provider, and one shared presenter Control — replacing `ToolboxShape` outright.

**Architecture:** A `ToolboxRepository` singleton in `Application.current.Services` holds `ToolboxPage`s of `ToolboxItem`s. Each item carries a lightweight `ToolboxVisualDescriptor` (`{ResolverKey, Key}`) and a `FactoryKey`. A shared `ToolboxVisualPresenter` (a `ContentControl`) resolves an item's descriptor through the registered `IToolboxVisualResolver` and re-hosts on a `changed` signal — so palette tile, canvas node, and preview never diverge. Drop carries the item id under one format; the router looks the item up and calls its `IToolboxDropFactory`. Mural ships a built-in Shapes page + shape resolver/factory, wired on first `Diagram` init.

**Tech Stack:** TypeScript, mural runtime (`Model`/DP, `ServiceProvider`/`ServiceKey`, `ObservableCollection`), mural framework (`Control`/`ContentControl`, `Diagram`, `Figure`), `.mu`/`.template.mu` markup compiled by the mural CLI, `node:test` + `node:assert` (framework tests).

## Global Constraints

- Package `@pragmatic-tech-ai/mural`; a change here needs a version bump + republish before Plexus (Spec B) can consume it. Do not bump/publish in this plan unless asked.
- **Enums, never string-literal unions.** `VisualContext` is a real enum with explicit string values (`Tile = 'tile'`, `Figure = 'figure'`).
- **Markup-facing DataTypes register** in `src/compiler/symbol-table.ts` (same list `ToolboxShape` is in today).
- **Every Control has a default Style.** `ToolboxVisualPresenter`'s `Template` is a `ControlTemplate` DP set in a `*.template.mu`; its ctor calls `applyDefaultStyle()`. No `Application.ResolveDefaultResource(stringKey)` / `resolveXxxTemplate` helpers.
- **No string-keyed resolution.** Resolvers/factories resolve through typed `ServiceKey`s from `Application.current.Services`, never a `kind`-string switch.
- **Every test file lives in a `tests/` subfolder** next to the code it exercises (e.g. `src/framework/diagram/toolbox/tests/…`).
- **Hard cutover.** `ToolboxShape`, `DiagramDocument.ToolboxShapes`, `TOOLBOX_NODE_KIND_FORMAT` are deleted. Single drag payload format `TOOLBOX_ITEM_FORMAT`.
- **Commit** at the end of each task. Do not push. Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Implementation notes (grounded APIs)

- **DP class idiom** (`Model`): `static readonly FooKey = Model.RegisterProperty<T>(Cls, 'Foo', <default>, MetaData.None)`, with `get Foo(): T { return this.get_property_value(Cls.FooKey); }` / `set Foo(v){ this.set_property_value(Cls.FooKey, v); }`. `RegisterProperty` args: `(ownerCtor, name, defaultValue, metadata)`.
- **Service provider:** `Application.current?.Services` is a `ServiceProvider`. `registerInstance(token, instance)`, `has(token)`, `get(token)`, `getRequired(token)`. `ServiceKey<T>` is constructed `new ServiceKey<T>('description')`.
- **ContentControl:** setting `Content` to a `Visual` slots it directly into the template's `ContentPresenter` (no DataTemplate dispatch). `Content` is `MetaData.Measure`. Import from `../base/content-control.js`.
- **Control default template:** ctor calls `this.applyDefaultStyle()`; the `Template` (a `ControlTemplate`) is declared in a sibling `*.template.mu` `Style` block targeting the control type. See `src/framework/tool-bar/tool-bar.template.mu` for the shape.
- **Lifecycle hooks** (on `Element`, which `Control` extends): `AddAttached(cb)` / `RemoveAttached(cb)` and `AddDetached(cb)` / `RemoveDetached(cb)` — use Attached to (re)subscribe, Detached to unsubscribe.
- **Drag payload:** `new DataObject().Set(FORMAT, value)`; `DragDropEffects.Copy`. Import `DataObject`, `DragDropEffects` from `../../runtime/index.js`.
- **Diagram wiring points:** `Diagram` ctor calls `this.applyDefaultStyle()` (~diagram.ts:892) — add the first-init call right after. The Mutator DP handler calls `attachStandardDiagramMutations(this, mutator)` (~diagram.ts:1117) — the drop routing to change lives in `attach-standard-mutations.ts`.
- **Shapes source:** `SHAPE_CATALOG` (array of `{ kind, label }`) and `SHAPE_CATALOG_MAP` in `src/framework/diagram/shape-catalog.ts`. `Figure.fromKind(kind, x, y, { width, height })` builds a shape Figure.
- **Existing drop path (to replace):** `canvas-drop-behavior.ts` gates `DragOver`/`Drop` on `TOOLBOX_NODE_KIND_FORMAT` and fires `Diagram._fireItemDropped({ Data, Position })`; `attach-standard-mutations.ts` `onDropped` reads the kind and calls `mutator.CreateNode`.

## File Structure

New (`src/framework/diagram/toolbox/`):
- `toolbox-visual-descriptor.ts` — `ToolboxVisualDescriptor` (plain class).
- `toolbox-visual-resolver.ts` — `VisualContext` enum + `IToolboxVisualResolver` interface.
- `toolbox-drop-factory.ts` — `IToolboxDropFactory` + `ToolboxDropContext` interfaces.
- `toolbox-item.ts` — `ToolboxItem` (Model).
- `toolbox-page.ts` — `ToolboxPage` (Model).
- `toolbox-repository.ts` — `ToolboxRepository` (Model) + `ToolboxRepositoryKey`.
- `toolbox-visual-presenter.ts` — `ToolboxVisualPresenter` (ContentControl).
- `toolbox-visual-presenter.template.mu` — its default Style/Template.
- `shape-visual-resolver.ts` — shape resolver + `ShapeVisualResolverKey`.
- `shape-drop-factory.ts` — shape factory + `ShapeDropFactoryKey`.
- `shape-toolbox-item.ts` — `ShapeToolboxItem`.
- `ensure-toolbox-defaults.ts` — `ensureToolboxDefaults(services)`.
- `tests/` — one test file per unit above.

Modified:
- `src/framework/diagram/behaviors/canvas-drop-behavior.ts` — `TOOLBOX_ITEM_FORMAT` replaces `TOOLBOX_NODE_KIND_FORMAT`.
- `src/framework/diagram/behaviors/attach-standard-mutations.ts` — `onDropped` → repo lookup + factory.
- `src/framework/diagram/diagram.ts` — call `ensureToolboxDefaults`; export swap.
- `src/framework/diagram/diagram-document.ts` — remove `ToolboxShapes` DP + ctor population.
- `src/framework/index.ts` — export new types; remove `ToolboxShape`.
- `src/compiler/symbol-table.ts` — register `ToolboxVisualPresenter` markup type; remove `ToolboxShape`.
- `demo/demos/diagram/diagram.mu`, `diagram.mjs`, `diagram.mu.js` — palette + drag migration.
- `docs/diagram-api-guide.md`, `docs/behaviors.md`, `current-backlog.md` — API text.

Deleted:
- `src/framework/diagram/toolbox-shape.ts`.

---

### Task 1: Descriptor + protocol contracts

**Files:**
- Create: `src/framework/diagram/toolbox/toolbox-visual-descriptor.ts`
- Create: `src/framework/diagram/toolbox/toolbox-visual-resolver.ts`
- Create: `src/framework/diagram/toolbox/toolbox-drop-factory.ts`
- Test: `src/framework/diagram/toolbox/tests/toolbox-visual-descriptor.test.ts`

**Interfaces:**
- Produces:
  - `class ToolboxVisualDescriptor { constructor(readonly ResolverKey: ServiceKey<IToolboxVisualResolver>, readonly Key: string) }`
  - `enum VisualContext { Tile = 'tile', Figure = 'figure' }`
  - `interface IToolboxVisualResolver { Resolve(d: ToolboxVisualDescriptor, c: VisualContext): Visual; AddChangedListener(cb: (key: string) => void): void; RemoveChangedListener(cb: (key: string) => void): void }`
  - `interface IToolboxDropFactory { CreateDropped(ctx: ToolboxDropContext): unknown | null }`
  - `interface ToolboxDropContext { readonly Item: ToolboxItem; readonly Descriptor: ToolboxVisualDescriptor; readonly Position: Point; readonly Diagram: Diagram; readonly Mutator: DiagramMutator }`

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/toolbox-visual-descriptor.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceKey } from '../../../../runtime/index.js';
import { ToolboxVisualDescriptor } from '../toolbox-visual-descriptor.js';
import { VisualContext, type IToolboxVisualResolver } from '../toolbox-visual-resolver.js';

test('descriptor carries its resolver key and handle', () => {
    const key = new ServiceKey<IToolboxVisualResolver>('test-resolver');
    const d = new ToolboxVisualDescriptor(key, 'shape:box');
    assert.equal(d.ResolverKey, key);
    assert.equal(d.Key, 'shape:box');
});

test('VisualContext values are stable strings', () => {
    assert.equal(VisualContext.Tile, 'tile');
    assert.equal(VisualContext.Figure, 'figure');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/framework/diagram/toolbox/tests/toolbox-visual-descriptor.test.ts`
Expected: FAIL — modules not found. (If the repo's test runner differs, use it; check `package.json` `test` script. The framework uses `node:test`; run a single file via the project's configured runner.)

- [ ] **Step 3: Write the contract files**

`toolbox-visual-descriptor.ts`:
```ts
import type { ServiceKey } from '../../../runtime/index.js';
import type { IToolboxVisualResolver } from './toolbox-visual-resolver.js';

// Lightweight, in-memory "what to draw" handle. Cheap to construct for
// every item; no Visual is built until a resolver is asked. Never
// serialized — a canvas node rebuilds its descriptor from a persisted key.
export class ToolboxVisualDescriptor
{
    constructor(
        public readonly ResolverKey: ServiceKey<IToolboxVisualResolver>,
        public readonly Key: string,
    ) {}
}
```

`toolbox-visual-resolver.ts`:
```ts
import type { Visual } from '../../../runtime/index.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';

// Which surface a visual is being resolved for.
export enum VisualContext
{
    Tile   = 'tile',
    Figure = 'figure',
}

// Turns a descriptor into a fresh Visual per call (a Visual can't live in
// two places), sized/chromed for the context. Returns a placeholder during
// the not-yet-loaded window and fires the changed signal (with the
// descriptor Key) when the real visual becomes available. Resolvers whose
// data is always ready never fire it.
export interface IToolboxVisualResolver
{
    Resolve(descriptor: ToolboxVisualDescriptor, context: VisualContext): Visual;
    AddChangedListener(cb: (key: string) => void): void;
    RemoveChangedListener(cb: (key: string) => void): void;
}
```

`toolbox-drop-factory.ts`:
```ts
import type { Point } from '../../../runtime/index.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';
import type { ToolboxItem } from './toolbox-item.js';
import type { Diagram } from '../diagram.js';
import type { DiagramMutator } from '../behaviors/attach-standard-mutations.js';

// Everything a factory needs to turn a dropped item into a canvas node.
export interface ToolboxDropContext
{
    readonly Item:       ToolboxItem;
    readonly Descriptor: ToolboxVisualDescriptor;
    readonly Position:   Point;   // canvas-local top-left (offset already applied)
    readonly Diagram:    Diagram;
    readonly Mutator:    DiagramMutator;
}

// Creates the selectable/movable node, mutating the document through the
// Mutator, and returns the created node (for selection) or null. May
// delegate the node's picture to the descriptor's resolver, or build
// intrinsic geometry directly (shapes).
export interface IToolboxDropFactory
{
    CreateDropped(context: ToolboxDropContext): unknown | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command as Step 2. Expected: PASS (2 tests). `Point`/`Visual`/`ServiceKey` import from `runtime/index.js` — confirm the barrel re-exports them (it does; `Point` and `Visual` are used across framework, `ServiceKey` is in `services/service-provider.ts` re-exported by runtime index).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/toolbox/
git commit -m "feat(toolbox): descriptor + resolver/factory contracts"
```

---

### Task 2: `ToolboxItem` + `TOOLBOX_ITEM_FORMAT`

**Files:**
- Create: `src/framework/diagram/toolbox/toolbox-item.ts`
- Modify: `src/framework/diagram/behaviors/canvas-drop-behavior.ts` (add `TOOLBOX_ITEM_FORMAT` export; keep the old constant for now — it is removed in Task 7)
- Test: `src/framework/diagram/toolbox/tests/toolbox-item.test.ts`

**Interfaces:**
- Consumes: `ToolboxVisualDescriptor` (Task 1), `IToolboxDropFactory` (Task 1).
- Produces:
  - `const TOOLBOX_ITEM_FORMAT = '@pragmatic-tech-ai/mural/toolbox-item'` (in canvas-drop-behavior.ts).
  - `class ToolboxItem extends Model` with DPs `Id: string`, `Label: string`, `Descriptor: ToolboxVisualDescriptor | undefined`, `BeginDragData: (() => { data: DataObject; effects: DragDropEffects }) | undefined`, and a plain `readonly FactoryKey: ServiceKey<IToolboxDropFactory>`. Ctor `(id, label, descriptor, factoryKey)`.

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/toolbox-item.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceKey } from '../../../../runtime/index.js';
import { ToolboxVisualDescriptor } from '../toolbox-visual-descriptor.js';
import { type IToolboxVisualResolver } from '../toolbox-visual-resolver.js';
import { type IToolboxDropFactory } from '../toolbox-drop-factory.js';
import { ToolboxItem } from '../toolbox-item.js';
import { TOOLBOX_ITEM_FORMAT } from '../../behaviors/canvas-drop-behavior.js';

function makeItem(): ToolboxItem {
    const rk = new ServiceKey<IToolboxVisualResolver>('r');
    const fk = new ServiceKey<IToolboxDropFactory>('f');
    return new ToolboxItem('shape:box', 'Box', new ToolboxVisualDescriptor(rk, 'box'), fk);
}

test('item exposes id/label/descriptor/factory', () => {
    const item = makeItem();
    assert.equal(item.Id, 'shape:box');
    assert.equal(item.Label, 'Box');
    assert.equal(item.Descriptor?.Key, 'box');
    assert.equal(item.FactoryKey.description, 'f');
});

test('BeginDragData carries the item id under TOOLBOX_ITEM_FORMAT', () => {
    const item = makeItem();
    const payload = item.BeginDragData!();
    assert.equal(payload.data.Get(TOOLBOX_ITEM_FORMAT), 'shape:box');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — `ToolboxItem` / `TOOLBOX_ITEM_FORMAT` not found.

- [ ] **Step 3: Add `TOOLBOX_ITEM_FORMAT`, then `ToolboxItem`**

In `canvas-drop-behavior.ts`, add below the existing `TOOLBOX_NODE_KIND_FORMAT` export:
```ts
// The single toolbox drag format: the payload carries the dropped item's
// id. The drop router looks the item up in the ToolboxRepository and calls
// its factory. Replaces TOOLBOX_NODE_KIND_FORMAT (removed in the cutover).
export const TOOLBOX_ITEM_FORMAT = '@pragmatic-tech-ai/mural/toolbox-item';
```

`toolbox-item.ts`:
```ts
import { DataObject, DragDropEffects, MetaData, Model, type ServiceKey } from '../../../runtime/index.js';
import { TOOLBOX_ITEM_FORMAT } from '../behaviors/canvas-drop-behavior.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';
import type { IToolboxDropFactory } from './toolbox-drop-factory.js';

// One droppable palette entry. Carries its visual descriptor (resolved by
// the palette tile / canvas node), a FactoryKey (the drop factory), and a
// BeginDragData callback the tile template wires to OnDragStart. Base class;
// app-specific kinds subclass but the base already carries all palette/drop
// needs. FactoryKey is a plain field, not a DP — it is read in TS on drop,
// never bound in markup.
export class ToolboxItem extends Model
{
    public static readonly IdKey = Model.RegisterProperty<string>(
        ToolboxItem, 'Id', '', MetaData.None);
    public static readonly LabelKey = Model.RegisterProperty<string>(
        ToolboxItem, 'Label', '', MetaData.None);
    public static readonly DescriptorKey = Model.RegisterProperty<ToolboxVisualDescriptor | undefined>(
        ToolboxItem, 'Descriptor', undefined, MetaData.None);
    public static readonly BeginDragDataKey = Model.RegisterProperty<(() => { data: DataObject; effects: DragDropEffects }) | undefined>(
        ToolboxItem, 'BeginDragData', undefined, MetaData.None);

    constructor(
        id: string,
        label: string,
        descriptor: ToolboxVisualDescriptor,
        public readonly FactoryKey: ServiceKey<IToolboxDropFactory>,
    )
    {
        super();
        this.set_property_value(ToolboxItem.IdKey, id);
        this.set_property_value(ToolboxItem.LabelKey, label);
        this.set_property_value(ToolboxItem.DescriptorKey, descriptor);
        this.set_property_value(ToolboxItem.BeginDragDataKey, () => ({
            data:    new DataObject().Set(TOOLBOX_ITEM_FORMAT, this.Id),
            effects: DragDropEffects.Copy,
        }));
    }

    public get Id():         string { return this.get_property_value(ToolboxItem.IdKey); }
    public get Label():      string { return this.get_property_value(ToolboxItem.LabelKey); }
    public get Descriptor(): ToolboxVisualDescriptor | undefined { return this.get_property_value(ToolboxItem.DescriptorKey); }
    public get BeginDragData(): (() => { data: DataObject; effects: DragDropEffects }) | undefined {
        return this.get_property_value(ToolboxItem.BeginDragDataKey);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the file. Expected: PASS (2 tests). If `DataObject.Get` returns `undefined`, confirm `.Set` returns the `DataObject` (it does — chainable) and the format string matches.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/toolbox/toolbox-item.ts src/framework/diagram/toolbox/tests/toolbox-item.test.ts src/framework/diagram/behaviors/canvas-drop-behavior.ts
git commit -m "feat(toolbox): ToolboxItem + TOOLBOX_ITEM_FORMAT"
```

---

### Task 3: `ToolboxPage` + `ToolboxRepository`

**Files:**
- Create: `src/framework/diagram/toolbox/toolbox-page.ts`
- Create: `src/framework/diagram/toolbox/toolbox-repository.ts`
- Test: `src/framework/diagram/toolbox/tests/toolbox-repository.test.ts`

**Interfaces:**
- Consumes: `ToolboxItem` (Task 2).
- Produces:
  - `class ToolboxPage extends Model` — DPs `Id: string`, `Title: string`, `Items: ObservableCollection<ToolboxItem>`. Ctor `(id, title)`.
  - `class ToolboxRepository extends Model` — DP `Pages: ObservableCollection<ToolboxPage>`; methods `EnsurePage(id, title): ToolboxPage`, `ItemById(id): ToolboxItem | undefined`, `RemovePage(id): void`, `Clear(): void`; `static readonly Key: ServiceKey<ToolboxRepository>`.

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/toolbox-repository.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceKey } from '../../../../runtime/index.js';
import { ToolboxVisualDescriptor } from '../toolbox-visual-descriptor.js';
import { type IToolboxVisualResolver } from '../toolbox-visual-resolver.js';
import { type IToolboxDropFactory } from '../toolbox-drop-factory.js';
import { ToolboxItem } from '../toolbox-item.js';
import { ToolboxRepository } from '../toolbox-repository.js';

function item(id: string): ToolboxItem {
    const rk = new ServiceKey<IToolboxVisualResolver>('r');
    const fk = new ServiceKey<IToolboxDropFactory>('f');
    return new ToolboxItem(id, id, new ToolboxVisualDescriptor(rk, id), fk);
}

test('EnsurePage is get-or-create', () => {
    const repo = new ToolboxRepository();
    const a = repo.EnsurePage('shapes', 'Shapes');
    const b = repo.EnsurePage('shapes', 'Shapes');
    assert.equal(a, b);
    assert.equal(repo.Pages.Count, 1);
});

test('ItemById finds an item across pages, miss returns undefined', () => {
    const repo = new ToolboxRepository();
    repo.EnsurePage('p1', 'P1').Items.Add(item('x'));
    repo.EnsurePage('p2', 'P2').Items.Add(item('y'));
    assert.equal(repo.ItemById('y')?.Id, 'y');
    assert.equal(repo.ItemById('missing'), undefined);
});

test('RemovePage and Clear', () => {
    const repo = new ToolboxRepository();
    repo.EnsurePage('p1', 'P1');
    repo.EnsurePage('p2', 'P2');
    repo.RemovePage('p1');
    assert.equal(repo.Pages.Count, 1);
    repo.Clear();
    assert.equal(repo.Pages.Count, 0);
});

test('repository has a stable service Key', () => {
    assert.ok(ToolboxRepository.Key instanceof ServiceKey);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — modules not found.

- [ ] **Step 3: Write the classes**

`toolbox-page.ts`:
```ts
import { MetaData, Model, ObservableCollection } from '../../../runtime/index.js';
import type { ToolboxItem } from './toolbox-item.js';

// One palette section: a titled, ordered set of items.
export class ToolboxPage extends Model
{
    public static readonly IdKey = Model.RegisterProperty<string>(
        ToolboxPage, 'Id', '', MetaData.None);
    public static readonly TitleKey = Model.RegisterProperty<string>(
        ToolboxPage, 'Title', '', MetaData.None);
    public static readonly ItemsKey = Model.RegisterProperty<ObservableCollection<ToolboxItem>>(
        ToolboxPage, 'Items', undefined as unknown as ObservableCollection<ToolboxItem>, MetaData.None);

    constructor(id: string, title: string)
    {
        super();
        this.set_property_value(ToolboxPage.IdKey, id);
        this.set_property_value(ToolboxPage.TitleKey, title);
        this.set_property_value(ToolboxPage.ItemsKey, new ObservableCollection<ToolboxItem>());
    }

    public get Id():    string { return this.get_property_value(ToolboxPage.IdKey); }
    public get Title(): string { return this.get_property_value(ToolboxPage.TitleKey); }
    public get Items(): ObservableCollection<ToolboxItem> { return this.get_property_value(ToolboxPage.ItemsKey); }
}
```

`toolbox-repository.ts`:
```ts
import { MetaData, Model, ObservableCollection, ServiceKey } from '../../../runtime/index.js';
import { ToolboxPage } from './toolbox-page.js';
import type { ToolboxItem } from './toolbox-item.js';

// The palette's structure — pages of items — held as a singleton in
// Application.current.Services. Pure structure: no visual-resolution or
// drop logic lives here. Populated by Diagram first-init (Shapes) and by
// apps (Plexus, Spec B).
export class ToolboxRepository extends Model
{
    public static readonly Key = new ServiceKey<ToolboxRepository>('ToolboxRepository');

    public static readonly PagesKey = Model.RegisterProperty<ObservableCollection<ToolboxPage>>(
        ToolboxRepository, 'Pages', undefined as unknown as ObservableCollection<ToolboxPage>, MetaData.None);

    constructor()
    {
        super();
        this.set_property_value(ToolboxRepository.PagesKey, new ObservableCollection<ToolboxPage>());
    }

    public get Pages(): ObservableCollection<ToolboxPage> { return this.get_property_value(ToolboxRepository.PagesKey); }

    // Get-or-create a page by id. A second call with the same id returns the
    // existing page (Title is not overwritten).
    public EnsurePage(id: string, title: string): ToolboxPage
    {
        for (let i = 0; i < this.Pages.Count; i++)
        {
            const p = this.Pages.Get(i)!;
            if (p.Id === id) return p;
        }
        const page = new ToolboxPage(id, title);
        this.Pages.Add(page);
        return page;
    }

    // First item across all pages whose Id matches, else undefined. The drop
    // router's lookup.
    public ItemById(id: string): ToolboxItem | undefined
    {
        for (let i = 0; i < this.Pages.Count; i++)
        {
            const items = this.Pages.Get(i)!.Items;
            for (let j = 0; j < items.Count; j++)
            {
                const it = items.Get(j)!;
                if (it.Id === id) return it;
            }
        }
        return undefined;
    }

    public RemovePage(id: string): void
    {
        for (let i = 0; i < this.Pages.Count; i++)
        {
            if (this.Pages.Get(i)!.Id === id) { this.Pages.RemoveAt(i); return; }
        }
    }

    public Clear(): void { this.Pages.Clear(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the file. Expected: PASS (4 tests). Confirm `ObservableCollection` exposes `Count`/`Get`/`Add`/`RemoveAt`/`Clear` (it does — used throughout `diagram-document.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/toolbox/toolbox-page.ts src/framework/diagram/toolbox/toolbox-repository.ts src/framework/diagram/toolbox/tests/toolbox-repository.test.ts
git commit -m "feat(toolbox): ToolboxPage + ToolboxRepository"
```

---

### Task 4: `ToolboxVisualPresenter` + default template

**Files:**
- Create: `src/framework/diagram/toolbox/toolbox-visual-presenter.ts`
- Create: `src/framework/diagram/toolbox/toolbox-visual-presenter.template.mu`
- Modify: `src/compiler/symbol-table.ts` (register `ToolboxVisualPresenter` as a markup type — mirror the `ToolboxShape` entry that exists today)
- Test: `src/framework/diagram/toolbox/tests/toolbox-visual-presenter.test.ts`

**Interfaces:**
- Consumes: `ToolboxVisualDescriptor` (Task 1), `VisualContext` + `IToolboxVisualResolver` (Task 1), `ContentControl`, `Application`.
- Produces: `class ToolboxVisualPresenter extends ContentControl` — DPs `Descriptor: ToolboxVisualDescriptor | undefined`, `Context: VisualContext` (default `Tile`). Resolves via `Application.current.Services.getRequired(Descriptor.ResolverKey)`, sets `Content` to the resolved `Visual`, subscribes to `changed` and re-hosts on `key === Descriptor.Key`. Subscribe on Attached, unsubscribe on Detached and on Descriptor change.

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/toolbox-visual-presenter.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ServiceKey, Visual } from '../../../../runtime/index.js';
import { Border } from '../../../../visual-engine/index.js';
import { ToolboxVisualDescriptor } from '../toolbox-visual-descriptor.js';
import { VisualContext, type IToolboxVisualResolver } from '../toolbox-visual-resolver.js';
import { ToolboxVisualPresenter } from '../toolbox-visual-presenter.js';

// A fake resolver: returns a placeholder Border until markReady(key), then
// returns a distinct "real" Border and fires changed.
class FakeResolver implements IToolboxVisualResolver {
    private readonly listeners = new Set<(k: string) => void>();
    private readonly ready = new Set<string>();
    public readonly placeholder = new Border();
    public readonly real = new Border();
    Resolve(d: ToolboxVisualDescriptor, _c: VisualContext): Visual {
        return this.ready.has(d.Key) ? this.real : this.placeholder;
    }
    AddChangedListener(cb: (k: string) => void): void { this.listeners.add(cb); }
    RemoveChangedListener(cb: (k: string) => void): void { this.listeners.delete(cb); }
    markReady(key: string): void { this.ready.add(key); for (const l of [...this.listeners]) l(key); }
    get listenerCount(): number { return this.listeners.size; }
}

function withApp(): { app: Application; prior: Application | null } {
    const prior = Application.current;
    const app = new Application();
    Application.current = app;
    return { app, prior };
}

test('presenter resolves to placeholder, then swaps to real on changed', () => {
    const { app, prior } = withApp();
    try {
        const resolverKey = new ServiceKey<IToolboxVisualResolver>('fake');
        const resolver = new FakeResolver();
        app.Services.registerInstance(resolverKey, resolver);

        const presenter = new ToolboxVisualPresenter();
        presenter.Context = VisualContext.Tile;
        presenter.Descriptor = new ToolboxVisualDescriptor(resolverKey, 'k1');
        // Simulate entering the visual tree so Attached fires the subscription.
        // (The container that hosts the presenter drives this in the app; here
        // we drive it directly — see note in Step 3 for the exact hook.)
        (presenter as unknown as { _forceAttachedForTest(): void })._forceAttachedForTest();

        assert.equal(presenter.Content, resolver.placeholder);
        resolver.markReady('k1');
        assert.equal(presenter.Content, resolver.real);
    } finally {
        Application.current = prior;
    }
});

test('presenter unsubscribes on detach (no leak)', () => {
    const { app, prior } = withApp();
    try {
        const resolverKey = new ServiceKey<IToolboxVisualResolver>('fake');
        const resolver = new FakeResolver();
        app.Services.registerInstance(resolverKey, resolver);

        const presenter = new ToolboxVisualPresenter();
        presenter.Descriptor = new ToolboxVisualDescriptor(resolverKey, 'k1');
        (presenter as unknown as { _forceAttachedForTest(): void })._forceAttachedForTest();
        assert.equal(resolver.listenerCount, 1);
        (presenter as unknown as { _forceDetachedForTest(): void })._forceDetachedForTest();
        assert.equal(resolver.listenerCount, 0);
    } finally {
        Application.current = prior;
    }
});
```

> Note: the two `_force…ForTest` shims exist because a headless test can't
> mount into a real window. Implement them as thin methods that invoke the
> same private subscribe/unsubscribe the Attached/Detached listeners call.
> They are test-only seams, greppable, and carry no production behavior.

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — `ToolboxVisualPresenter` not found.

- [ ] **Step 3: Write the presenter + template**

`toolbox-visual-presenter.ts`:
```ts
import { Application, MetaData, Model, type PropertyDescriptor } from '../../../runtime/index.js';
import { ContentControl } from '../../base/content-control.js';
import { VisualContext, type IToolboxVisualResolver } from './toolbox-visual-resolver.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';

// The one Control every toolbox surface routes its visual through, so
// "resolve + host + subscribe" lives in exactly one place. Keys on the
// descriptor (a canvas node / preview is not a ToolboxItem). Sets the
// resolved Visual as Content (ContentControl slots a Visual directly), and
// re-hosts in place when the resolver signals the real visual arrived.
export class ToolboxVisualPresenter extends ContentControl
{
    public static readonly DescriptorKey = Model.RegisterProperty<ToolboxVisualDescriptor | undefined>(
        ToolboxVisualPresenter, 'Descriptor', undefined, MetaData.None);
    public static readonly ContextKey = Model.RegisterProperty<VisualContext>(
        ToolboxVisualPresenter, 'Context', VisualContext.Tile, MetaData.None);

    private _resolver: IToolboxVisualResolver | undefined;
    private readonly _onChanged = (key: string): void => {
        if (this.Descriptor !== undefined && key === this.Descriptor.Key) this.resolveNow();
    };
    private _attached = false;

    constructor()
    {
        super();
        this.applyDefaultStyle();
        this.AddAttached(this.onAttached);
        this.AddDetached(this.onDetached);
    }

    public get Descriptor(): ToolboxVisualDescriptor | undefined { return this.get_property_value(ToolboxVisualPresenter.DescriptorKey); }
    public set Descriptor(v: ToolboxVisualDescriptor | undefined) { this.set_property_value(ToolboxVisualPresenter.DescriptorKey, v); }
    public get Context(): VisualContext { return this.get_property_value(ToolboxVisualPresenter.ContextKey); }
    public set Context(v: VisualContext) { this.set_property_value(ToolboxVisualPresenter.ContextKey, v); }

    private readonly onAttached = (): void => { this._attached = true; this.subscribeAndResolve(); };
    private readonly onDetached = (): void => { this._attached = false; this.unsubscribe(); };

    protected override OnPropertyChanged(descriptor: PropertyDescriptor, oldValue: unknown, newValue: unknown): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Descriptor' || descriptor.Name === 'Context')
        {
            // Re-point the subscription + re-resolve whenever the inputs change.
            this.unsubscribe();
            if (this._attached) this.subscribeAndResolve();
        }
    }

    private subscribeAndResolve(): void
    {
        const desc = this.Descriptor;
        if (desc === undefined) { this.Content = undefined; return; }
        const resolver = Application.current?.Services.get(desc.ResolverKey);
        this._resolver = resolver;
        resolver?.AddChangedListener(this._onChanged);
        this.resolveNow();
    }

    private resolveNow(): void
    {
        const desc = this.Descriptor;
        if (desc === undefined || this._resolver === undefined) { this.Content = undefined; return; }
        this.Content = this._resolver.Resolve(desc, this.Context);
    }

    private unsubscribe(): void
    {
        this._resolver?.RemoveChangedListener(this._onChanged);
        this._resolver = undefined;
    }

    // ── Test-only seams (headless can't mount into a window) ──
    public _forceAttachedForTest(): void { this.onAttached(); }
    public _forceDetachedForTest(): void { this.onDetached(); }
}
```

> If `AddAttached`/`AddDetached` are not on `Control`'s public surface at
> compile time, they are inherited from `Element` (visual.ts §755 notes they
> live on `Element`); import path is transitive — no extra import. If the
> method names differ in the resolved `.d.ts`, grep `src/framework` for a
> control that calls `AddDetached` and match it.

`toolbox-visual-presenter.template.mu` — mirror the minimal ContentControl template shape (a `ContentPresenter` hosting `Content`). Model it on an existing `*.template.mu` `Style` block:
```
Style [ TargetType = ToolboxVisualPresenter ] {
    Setter Template = {
        ControlTemplate {
            ContentPresenter x:root [ Content = $Content ]
        }
    }
}
```
> Confirm the exact `ControlTemplate` / `ContentPresenter` markup against a
> sibling template (e.g. `src/framework/tool-bar/tool-bar.template.mu`) —
> reuse its ContentPresenter binding form verbatim; `$Content` is the
> TemplateBind to the control's `Content` DP.

In `src/compiler/symbol-table.ts`, add `ToolboxVisualPresenter` to the same registration list `ToolboxShape` currently appears in (so `[ TargetType = ToolboxVisualPresenter ]` resolves in markup). Locate the `ToolboxShape` line and add the new type beside it.

Wire the template into the framework theme bundle the same way other diagram templates load. Find where `diagram.template.mu` is registered/compiled (grep `diagram.template` in `src/framework`) and add `toolbox-visual-presenter.template.mu` to the same compile list, OR fold the `Style` block into `diagram.template.mu` if that file aggregates diagram control templates. Prefer folding into `diagram.template.mu` if it already hosts multiple control styles.

- [ ] **Step 4: Run test to verify it passes**

Run the file. Expected: PASS (2 tests). If `Content` is `undefined` after resolve, verify `ContentControl.Content` accepts a `Visual` (it does) and that `Application.current.Services.get(key)` returns the registered resolver.

- [ ] **Step 5: Run the mu compile to prove the template compiles**

Run: `npm run build` (or the repo's `.mu` compile step — check `package.json`). Expected: compiles without "unknown symbol ToolboxVisualPresenter".

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/toolbox/toolbox-visual-presenter.ts src/framework/diagram/toolbox/toolbox-visual-presenter.template.mu src/framework/diagram/toolbox/tests/toolbox-visual-presenter.test.ts src/compiler/symbol-table.ts
git commit -m "feat(toolbox): ToolboxVisualPresenter Control + default template"
```

---

### Task 5: Shape resolver, factory, and item

**Files:**
- Create: `src/framework/diagram/toolbox/shape-visual-resolver.ts`
- Create: `src/framework/diagram/toolbox/shape-drop-factory.ts`
- Create: `src/framework/diagram/toolbox/shape-toolbox-item.ts`
- Test: `src/framework/diagram/toolbox/tests/shape-resolver-factory.test.ts`

**Interfaces:**
- Consumes: `IToolboxVisualResolver`/`VisualContext` (Task 1), `IToolboxDropFactory`/`ToolboxDropContext` (Task 1), `ToolboxItem` (Task 2), `ToolboxVisualDescriptor` (Task 1), `Figure`, `SHAPE_CATALOG`, `DiagramMutator`.
- Produces:
  - `const ShapeVisualResolverKey: ServiceKey<IToolboxVisualResolver>` + `class ShapeVisualResolver implements IToolboxVisualResolver`.
  - `const ShapeDropFactoryKey: ServiceKey<IToolboxDropFactory>` + `class ShapeDropFactory implements IToolboxDropFactory`.
  - `class ShapeToolboxItem extends ToolboxItem` — ctor `(kind, label)`; `Id = "shape:" + kind`, descriptor `{ ShapeVisualResolverKey, Key: kind }`, `FactoryKey = ShapeDropFactoryKey`.

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/shape-resolver-factory.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point } from '../../../../runtime/index.js';
import { Figure } from '../../figure.js';
import { ToolboxVisualDescriptor } from '../toolbox-visual-descriptor.js';
import { VisualContext } from '../toolbox-visual-resolver.js';
import { ShapeVisualResolver, ShapeVisualResolverKey } from '../shape-visual-resolver.js';
import { ShapeDropFactory } from '../shape-drop-factory.js';
import { ShapeToolboxItem } from '../shape-toolbox-item.js';

test('shape resolver returns a 48x48 non-hit-test Figure for a Tile', () => {
    const r = new ShapeVisualResolver();
    const v = r.Resolve(new ToolboxVisualDescriptor(ShapeVisualResolverKey, 'box'), VisualContext.Tile);
    assert.ok(v instanceof Figure);
    assert.equal((v as Figure).Width, 48);
    assert.equal((v as Figure).Height, 48);
    assert.equal((v as Figure).IsHitTestVisible, false);
});

test('shape factory delegates to mutator.CreateNode and returns the node', () => {
    const created: Array<{ kind: string; x: number; y: number }> = [];
    const sentinel = {};
    const mutator = {
        Group() {}, Ungroup() {}, CombineSelection() {}, DeleteNodes() {},
        CreateNode(kind: string, x: number, y: number) { created.push({ kind, x, y }); return sentinel; },
    };
    const factory = new ShapeDropFactory();
    const item = new ShapeToolboxItem('box', 'Box');
    const node = factory.CreateDropped({
        Item: item, Descriptor: item.Descriptor!, Position: new Point(10, 20),
        Diagram: undefined as never, Mutator: mutator as never,
    });
    assert.equal(node, sentinel);
    assert.deepEqual(created, [{ kind: 'box', x: 10, y: 20 }]);
});

test('ShapeToolboxItem id/descriptor/factory wiring', () => {
    const item = new ShapeToolboxItem('box', 'Box');
    assert.equal(item.Id, 'shape:box');
    assert.equal(item.Label, 'Box');
    assert.equal(item.Descriptor?.Key, 'box');
    assert.equal(item.Descriptor?.ResolverKey, ShapeVisualResolverKey);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — modules not found.

- [ ] **Step 3: Write the three files**

`shape-visual-resolver.ts`:
```ts
import { ServiceKey, type Visual } from '../../../runtime/index.js';
import { Color } from '../../../runtime/index.js';
import { SolidColorBrush } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';
import { VisualContext, type IToolboxVisualResolver } from './toolbox-visual-resolver.js';
import type { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';

export const ShapeVisualResolverKey = new ServiceKey<IToolboxVisualResolver>('ShapeVisualResolver');

const TILE_SIZE = 48;
const PREVIEW_FILL = new SolidColorBrush(Color.FromHex('#1976d2'));

// Built-in shapes are always ready: no placeholder, never fires changed.
// Tile → the 48x48 non-hit-test preview Figure the old ToolboxShape built;
// Figure → a default-size Figure (unused by ShapeDropFactory, defined for
// completeness).
export class ShapeVisualResolver implements IToolboxVisualResolver
{
    public Resolve(descriptor: ToolboxVisualDescriptor, context: VisualContext): Visual
    {
        const size = context === VisualContext.Tile ? TILE_SIZE : 80;
        const fig = Figure.fromKind(descriptor.Key, 0, 0, { width: size, height: size });
        fig.Fill = PREVIEW_FILL;
        if (context === VisualContext.Tile) fig.IsHitTestVisible = false;
        return fig;
    }

    // Always-ready resolver: no-op listener surface.
    public AddChangedListener(_cb: (key: string) => void): void {}
    public RemoveChangedListener(_cb: (key: string) => void): void {}
}
```
> Confirm `Color`/`SolidColorBrush` import paths against `toolbox-shape.ts`
> (deleted in Task 8) — it used `Color` from runtime and `SolidColorBrush`
> from visual-engine. Reuse those exact specifiers.

`shape-drop-factory.ts`:
```ts
import { ServiceKey } from '../../../runtime/index.js';
import type { IToolboxDropFactory, ToolboxDropContext } from './toolbox-drop-factory.js';

export const ShapeDropFactoryKey = new ServiceKey<IToolboxDropFactory>('ShapeDropFactory');

// Intrinsic geometry: the shape IS its visual, so this never touches the
// resolver on the canvas — it delegates to the mutator's CreateNode, the
// same call the legacy kind-drop made.
export class ShapeDropFactory implements IToolboxDropFactory
{
    public CreateDropped(context: ToolboxDropContext): unknown | null
    {
        return context.Mutator.CreateNode(context.Descriptor.Key, context.Position.X, context.Position.Y);
    }
}
```

`shape-toolbox-item.ts`:
```ts
import { ToolboxItem } from './toolbox-item.js';
import { ToolboxVisualDescriptor } from './toolbox-visual-descriptor.js';
import { ShapeVisualResolverKey } from './shape-visual-resolver.js';
import { ShapeDropFactoryKey } from './shape-drop-factory.js';

// A built-in shape palette entry: descriptor keyed by catalog kind, resolved
// by the shape resolver, dropped by the shape factory.
export class ShapeToolboxItem extends ToolboxItem
{
    constructor(kind: string, label: string)
    {
        super(`shape:${kind}`, label, new ToolboxVisualDescriptor(ShapeVisualResolverKey, kind), ShapeDropFactoryKey);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the file. Expected: PASS (3 tests). If `Figure.fromKind` needs a valid kind, `'box'` must exist in `SHAPE_CATALOG_MAP` — confirm by reading `shape-catalog.ts`; if the first catalog kind is not `'box'`, use the real first kind in the test and factory test.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/toolbox/shape-visual-resolver.ts src/framework/diagram/toolbox/shape-drop-factory.ts src/framework/diagram/toolbox/shape-toolbox-item.ts src/framework/diagram/toolbox/tests/shape-resolver-factory.test.ts
git commit -m "feat(toolbox): shape resolver, drop factory, and item"
```

---

### Task 6: `ensureToolboxDefaults` + `Diagram` first-init

**Files:**
- Create: `src/framework/diagram/toolbox/ensure-toolbox-defaults.ts`
- Modify: `src/framework/diagram/diagram.ts` (call it from the ctor, after `applyDefaultStyle()`)
- Test: `src/framework/diagram/toolbox/tests/ensure-toolbox-defaults.test.ts`

**Interfaces:**
- Consumes: `ToolboxRepository` (Task 3), `ShapeVisualResolver`/`ShapeVisualResolverKey` (Task 5), `ShapeDropFactory`/`ShapeDropFactoryKey` (Task 5), `ShapeToolboxItem` (Task 5), `SHAPE_CATALOG`, `ServiceProvider`.
- Produces: `function ensureToolboxDefaults(services: ServiceProvider | undefined): void` — idempotent: ensures `ToolboxRepository` registered, shape resolver + factory registered, and a "Shapes" page populated from `SHAPE_CATALOG`.

- [ ] **Step 1: Write the failing test**

`src/framework/diagram/toolbox/tests/ensure-toolbox-defaults.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceProvider } from '../../../../runtime/index.js';
import { ToolboxRepository } from '../toolbox-repository.js';
import { ShapeVisualResolverKey } from '../shape-visual-resolver.js';
import { ShapeDropFactoryKey } from '../shape-drop-factory.js';
import { SHAPE_CATALOG } from '../../shape-catalog.js';
import { ensureToolboxDefaults } from '../ensure-toolbox-defaults.js';

test('ensureToolboxDefaults registers repo + shape services + Shapes page', () => {
    const services = new ServiceProvider();
    ensureToolboxDefaults(services);
    const repo = services.getRequired(ToolboxRepository.Key);
    assert.ok(services.has(ShapeVisualResolverKey));
    assert.ok(services.has(ShapeDropFactoryKey));
    const shapes = repo.Pages.Get(0);
    assert.equal(shapes?.Id, 'shapes');
    assert.equal(shapes?.Items.Count, SHAPE_CATALOG.length);
});

test('ensureToolboxDefaults is idempotent', () => {
    const services = new ServiceProvider();
    ensureToolboxDefaults(services);
    const repo = services.getRequired(ToolboxRepository.Key);
    ensureToolboxDefaults(services);
    assert.equal(services.getRequired(ToolboxRepository.Key), repo);   // same instance
    assert.equal(repo.Pages.Count, 1);                                  // one Shapes page
    assert.equal(repo.Pages.Get(0)!.Items.Count, SHAPE_CATALOG.length); // not doubled
});

test('ensureToolboxDefaults tolerates undefined services (headless Diagram)', () => {
    assert.doesNotThrow(() => ensureToolboxDefaults(undefined));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — `ensureToolboxDefaults` not found.

- [ ] **Step 3: Write `ensureToolboxDefaults` + wire the Diagram ctor**

`ensure-toolbox-defaults.ts`:
```ts
import type { ServiceProvider } from '../../../runtime/index.js';
import { ToolboxRepository } from './toolbox-repository.js';
import { ShapeVisualResolver, ShapeVisualResolverKey } from './shape-visual-resolver.js';
import { ShapeDropFactory, ShapeDropFactoryKey } from './shape-drop-factory.js';
import { ShapeToolboxItem } from './shape-toolbox-item.js';
import { SHAPE_CATALOG } from '../shape-catalog.js';

// Idempotent first-init. Called from every Diagram ctor; guarded so N
// diagrams register once. A bare mural diagram gets a working Shapes palette
// with zero app wiring. No-op when there is no service provider (headless).
export function ensureToolboxDefaults(services: ServiceProvider | undefined): void
{
    if (services === undefined) return;

    if (!services.has(ToolboxRepository.Key))
    {
        services.registerInstance(ToolboxRepository.Key, new ToolboxRepository());
    }
    if (!services.has(ShapeVisualResolverKey))
    {
        services.registerInstance(ShapeVisualResolverKey, new ShapeVisualResolver());
    }
    if (!services.has(ShapeDropFactoryKey))
    {
        services.registerInstance(ShapeDropFactoryKey, new ShapeDropFactory());
    }

    const repo = services.getRequired(ToolboxRepository.Key);
    // EnsurePage is get-or-create; only populate a freshly-created page.
    let hasShapes = false;
    for (let i = 0; i < repo.Pages.Count; i++) if (repo.Pages.Get(i)!.Id === 'shapes') hasShapes = true;
    if (!hasShapes)
    {
        const page = repo.EnsurePage('shapes', 'Shapes');
        for (const e of SHAPE_CATALOG) page.Items.Add(new ShapeToolboxItem(e.kind, e.label));
    }
}
```

In `diagram.ts`, in the `Diagram` constructor immediately after `this.applyDefaultStyle();` (~line 892), add:
```ts
import { ensureToolboxDefaults } from './toolbox/ensure-toolbox-defaults.js';   // top of file
// ...
        this.applyDefaultStyle();
        ensureToolboxDefaults(Application.current?.Services);
```
> `Application` is already imported in `diagram.ts` (it uses
> `Application.current` elsewhere). If not, add it to the runtime import.

- [ ] **Step 4: Run test to verify it passes**

Run the file. Expected: PASS (3 tests). Confirm `SHAPE_CATALOG` entries expose `.kind` and `.label` (they do — `diagram-document.ts:350` iterates `SHAPE_CATALOG` as `{ kind, label }`).

- [ ] **Step 5: Run the framework diagram suite (Diagram ctor still constructs)**

Run the diagram test directory (e.g. `src/framework/diagram/tests/`). Expected: existing Diagram-construction tests still pass — the added first-init call must not throw when `Application.current` is undefined.

- [ ] **Step 6: Commit**

```bash
git add src/framework/diagram/toolbox/ensure-toolbox-defaults.ts src/framework/diagram/toolbox/tests/ensure-toolbox-defaults.test.ts src/framework/diagram/diagram.ts
git commit -m "feat(toolbox): ensureToolboxDefaults + Diagram first-init"
```

---

### Task 7: Drop routing cutover

**Files:**
- Modify: `src/framework/diagram/behaviors/canvas-drop-behavior.ts` (gate on `TOOLBOX_ITEM_FORMAT`; delete `TOOLBOX_NODE_KIND_FORMAT`)
- Modify: `src/framework/diagram/behaviors/attach-standard-mutations.ts` (`onDropped` → repo lookup + factory)
- Test: `src/framework/diagram/tests/diagram-canvas-drop.test.ts` (rewrite the drop assertion to the item-id path)

**Interfaces:**
- Consumes: `TOOLBOX_ITEM_FORMAT` (Task 2), `ToolboxRepository` (Task 3), `IToolboxDropFactory` (Task 1), `Application`.
- Produces: drop of a payload carrying `TOOLBOX_ITEM_FORMAT = <item id>` → `repo.ItemById(id)` → `Services.getRequired(item.FactoryKey).CreateDropped({...})` → returned node set as `Diagram.SelectedItem`.

- [ ] **Step 1: Rewrite the drop test to the item-id path**

Read the current `diagram-canvas-drop.test.ts` first. Replace the payload/assertion so it drops an item id and asserts the factory ran. Representative shape:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Application, DataObject, Point } from '../../../runtime/index.js';
import { Diagram } from '../diagram.js';
import { attachStandardDiagramMutations } from '../behaviors/attach-standard-mutations.js';
import { TOOLBOX_ITEM_FORMAT } from '../behaviors/canvas-drop-behavior.js';
import { ToolboxRepository } from '../toolbox/toolbox-repository.js';
import { ShapeToolboxItem } from '../toolbox/shape-toolbox-item.js';
import { ShapeDropFactoryKey } from '../toolbox/shape-drop-factory.js';
import type { IToolboxDropFactory, ToolboxDropContext } from '../toolbox/toolbox-drop-factory.js';

test('dropping an item id routes through the repo to its factory', () => {
    const prior = Application.current;
    const app = new Application();
    Application.current = app;
    try {
        const repo = new ToolboxRepository();
        app.Services.registerInstance(ToolboxRepository.Key, repo);
        const item = new ShapeToolboxItem('box', 'Box');
        repo.EnsurePage('shapes', 'Shapes').Items.Add(item);

        const dropped: ToolboxDropContext[] = [];
        const sentinel = {};
        const factory: IToolboxDropFactory = { CreateDropped(ctx) { dropped.push(ctx); return sentinel; } };
        app.Services.registerInstance(ShapeDropFactoryKey, factory);

        const diagram = new Diagram();
        const mutator = { Group(){}, Ungroup(){}, CombineSelection(){}, DeleteNodes(){}, CreateNode(){ return null; } };
        const detach = attachStandardDiagramMutations(diagram, mutator as never);

        const data = new DataObject().Set(TOOLBOX_ITEM_FORMAT, item.Id);
        diagram._fireItemDropped({ Data: data, Position: new Point(100, 100) });

        assert.equal(dropped.length, 1);
        assert.equal(dropped[0]!.Item, item);
        assert.equal(diagram.SelectedItem, sentinel);
        detach();
    } finally {
        Application.current = prior;
    }
});
```
> Preserve any other assertions the original file made about coordinate
> translation / offset — keep those, only swap the kind-based payload for the
> item-id payload and the CreateNode assertion for the factory assertion.

- [ ] **Step 2: Run test to verify it fails**

Run the file. Expected: FAIL — `onDropped` still reads the kind format; `dropped` stays empty.

- [ ] **Step 3: Cut over the two behavior files**

In `canvas-drop-behavior.ts`:
- Change `const NODE_KIND_FORMAT = '@pragmatic-tech-ai/mural/node-kind';` and the exported `TOOLBOX_NODE_KIND_FORMAT` to gate on the item format instead. Replace the internal `NODE_KIND_FORMAT` uses in `onDragOver`/`onDrop` with `TOOLBOX_ITEM_FORMAT`. Delete the `TOOLBOX_NODE_KIND_FORMAT` export. Keep the `TOOLBOX_ITEM_FORMAT` export added in Task 2. Final gating:
```ts
const onDragOver = (args: DragEventArgs): void => {
    if (args.Data.Has(TOOLBOX_ITEM_FORMAT)) args.Effect = DragDropEffects.Copy;
};
const onDrop = (args: DragEventArgs): void => {
    if (!args.Data.Has(TOOLBOX_ITEM_FORMAT)) return;
    diagram._fireItemDropped({ Data: args.Data, Position: localPosition(args) });
};
```

In `attach-standard-mutations.ts`, replace `onDropped` and its imports:
```ts
import { Application } from '../../../runtime/index.js';
import { TOOLBOX_ITEM_FORMAT } from './canvas-drop-behavior.js';
import { ToolboxRepository } from '../toolbox/toolbox-repository.js';
// ...
const onDropped = (args: ItemDroppedArgs): void => {
    const id = args.Data.Get(TOOLBOX_ITEM_FORMAT);
    if (typeof id !== 'string') return;
    const services = Application.current?.Services;
    const repo = services?.get(ToolboxRepository.Key);
    const item = repo?.ItemById(id);
    if (item === undefined) return;
    const factory = services?.get(item.FactoryKey);
    if (factory === undefined) return;
    const node = factory.CreateDropped({
        Item: item, Descriptor: item.Descriptor!,
        Position: new Point(args.Position.X - offset.dx, args.Position.Y - offset.dy),
        Diagram: diagram, Mutator: mutator,
    });
    if (node !== null && node !== undefined) diagram.SelectedItem = node;
};
```
> `Point` is already imported by neighbors; if not, add it from
> `../../../runtime/index.js`. The `offset` (`NodeDropOffset`) local is
> unchanged. `mutator.CreateNode` remains on the `DiagramMutator` interface —
> do NOT remove it; the shape factory calls it.

- [ ] **Step 4: Run test to verify it passes**

Run the rewritten `diagram-canvas-drop.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/framework/diagram/behaviors/canvas-drop-behavior.ts src/framework/diagram/behaviors/attach-standard-mutations.ts src/framework/diagram/tests/diagram-canvas-drop.test.ts
git commit -m "refactor(toolbox): drop routing via repo lookup + factory (single item format)"
```

---

### Task 8: Delete `ToolboxShape` + `DiagramDocument.ToolboxShapes`; fix exports

**Files:**
- Delete: `src/framework/diagram/toolbox-shape.ts`
- Modify: `src/framework/diagram/diagram-document.ts` (remove `ToolboxShapesKey` DP, its getter, and the ctor population loop)
- Modify: `src/framework/index.ts` (remove `ToolboxShape` export; add the new toolbox exports)
- Modify: `src/framework/diagram/diagram.ts` (remove the `ToolboxShape` re-export if present; add toolbox exports if this file is the diagram barrel)
- Modify: `src/compiler/symbol-table.ts` (remove `ToolboxShape` markup registration)
- Test: existing `diagram-document`-touching tests updated (see Step 3)

**Interfaces:**
- Produces: `ToolboxShape` no longer exists; `src/framework/index.ts` exports `ToolboxRepository`, `ToolboxPage`, `ToolboxItem`, `ToolboxVisualDescriptor`, `ToolboxVisualPresenter`, `VisualContext`, `IToolboxVisualResolver`, `IToolboxDropFactory`, `ToolboxDropContext`, `ShapeToolboxItem`, `ShapeVisualResolverKey`, `ShapeDropFactoryKey`, `ensureToolboxDefaults`, `TOOLBOX_ITEM_FORMAT`, `ToolboxRepository.Key`.

- [ ] **Step 1: Find every reference**

Run: search the repo for `ToolboxShape` and `ToolboxShapes` (Grep). Make a checklist of hits outside the files already handled: `nav-switch-back-shared-visual.test.ts`, `diagram-distribute-newarch.test.ts`, `page-view.test.ts`, `content-control.ts` (comment only — a `ToolboxShape.PreviewNode` mention; update the comment to reference `ToolboxVisualPresenter`), and the demo files (Task 9).

- [ ] **Step 2: Delete + edit, compile to surface breakage**

- Delete `src/framework/diagram/toolbox-shape.ts`.
- In `diagram-document.ts`: remove `ToolboxShapesKey`, its `get ToolboxShapes()`, the `import { ToolboxShape }`, and the ctor block:
  ```ts
  const toolbox = new ObservableCollection<ToolboxShape>();
  for (const e of SHAPE_CATALOG) toolbox.Add(new ToolboxShape(e.kind, e.label));
  this.set_property_value(DiagramDocument.ToolboxShapesKey, toolbox);
  ```
  (Shapes now live in the repository. `SHAPE_CATALOG`/`SHAPE_CATALOG_MAP` stay — `CreateNode` still uses the map.)
- In `src/framework/index.ts` and `diagram.ts`: remove the `ToolboxShape` export; add the new toolbox exports (a single `export * from './diagram/toolbox/…'` per file, or explicit named exports matching the barrel's style).
- In `symbol-table.ts`: remove the `ToolboxShape` markup entry (added `ToolboxVisualPresenter` in Task 4).
- Update the `content-control.ts` comment that names `ToolboxShape.PreviewNode` to name `ToolboxVisualPresenter` instead (behavioral note only; the shared-visual claim still holds).

Run: `npm run typecheck` (or `tsc -p` per repo). Fix every compile error the deletion surfaces — these are the remaining references.

- [ ] **Step 3: Update the tests that referenced the old surface**

For `nav-switch-back-shared-visual.test.ts`, `diagram-distribute-newarch.test.ts`, `page-view.test.ts`: read each, and replace `ToolboxShape` construction / `Document.ToolboxShapes` reads with the repository equivalent (`new ShapeToolboxItem(kind, label)` and `repo.EnsurePage('shapes','Shapes').Items`). If a test's intent was purely "a draggable tile exists", retarget it to a `ShapeToolboxItem` in a repository page. Keep each test's original behavioral assertion; only swap the type.

- [ ] **Step 4: Run the full framework suite**

Run the whole framework test suite (`npm test` or the framework subset). Expected: green, except demo-driven tests that Task 9 migrates (the diagram demo palette). If a non-demo test still references `ToolboxShape`, it was missed in Step 2 — fix it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(toolbox): delete ToolboxShape + DiagramDocument.ToolboxShapes; export new surface"
```

---

### Task 9: Migrate the diagram demo

**Files:**
- Modify: `demo/demos/diagram/diagram.mu` (palette rail + tile template + drag wiring)
- Modify: `demo/demos/diagram/diagram.mjs` (bootstrap — repository access)
- Modify: `demo/demos/diagram/diagram.mu.js` (compiled output — regenerated by the mu compile, not hand-edited)
- Test: the diagram demo smoke test (`diagram-canvas-drop.test.ts` already covers routing; add/adjust a demo-level palette test if one exists)

**Interfaces:**
- Consumes: `ToolboxRepository` (Task 3), `ToolboxVisualPresenter` (Task 4), `ToolboxItem`/`ToolboxPage` (Tasks 2–3), `$service(...)` binding.

- [ ] **Step 1: Read the current demo palette markup**

Read `demo/demos/diagram/diagram.mu` around the toolbox strip (the `ItemsControl [ ItemsSource = $ToolboxShapes ]` at ~line 386 and the `DataTemplate [DataType = ToolboxShape]` at ~line 87). Note how the demo reaches its document (DataContext) and whether `$service(...)` binding is used elsewhere in the demo.

- [ ] **Step 2: Rewrite the palette to bind the repository**

Replace the toolbox strip so it renders repository pages → items. Since the demo has a single Shapes page, bind the strip to that page's items. Two-level shape:
```
// pages
ItemsControl [ ItemsSource = $service(ToolboxRepository).Pages ] {
    ItemTemplate = {
        DataTemplate [DataType = ToolboxPage] {
            StackPanel [ Orientation = Vertical ] {
                TextBlock [ Text = $Title ]
                ItemsControl [ ItemsSource = $Items, ItemsPanel = @DiagramToolboxPanel ]
            }
        }
    }
}
```
Replace `DataTemplate [DataType = ToolboxShape]` with:
```
DataTemplate [DataType = ToolboxItem] {
    Border x:root
        [ IsDraggable = true,
          OnDragStart = $BeginDragData,
          Background  = @Surface,
          BorderBrush = @OutlineVariant,
          ... (keep the tile chrome the old template used) ... ] {
        StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
            ToolboxVisualPresenter [ Descriptor = $Descriptor, Context = Tile, Width = 48, Height = 48 ]
            TextBlock [ Text = $Label, ... ]
        }
    }
}
```
> `$service(ToolboxRepository)` resolves the singleton from
> `Application.Services` (the binding form the `DiagramDocument` comment
> references as `$service(ContentHostService)`). Confirm the exact
> `$service(...)` syntax against a demo/markup that already uses it (grep
> `$service(` in `demo/` and `src/framework`). `Context = Tile` is the
> `VisualContext` enum member — it must be registered in the compiler's enum
> symbols (grep `VisualContext` is absent today; if the compiler needs enum
> registration for markup member access, add `VisualContext` to
> `ENUM_MEMBERS`/`DEFAULT_SYMBOLS` in `symbol-table.ts`, mirroring
> `Orientation`).

- [ ] **Step 3: Update the bootstrap if it referenced ToolboxShapes**

In `diagram.mjs`, remove any code seeding `Document.ToolboxShapes`. The repository + Shapes page are now created by the Diagram ctor's `ensureToolboxDefaults`. If the demo needs the repo before a Diagram exists, call `ensureToolboxDefaults(Application.current.Services)` in the bootstrap.

- [ ] **Step 4: Recompile the demo markup**

Run the mu compile for the demo (the repo's `npm run build` or the demo compile script) so `diagram.mu.js` regenerates. Do not hand-edit `diagram.mu.js`.

- [ ] **Step 5: Run the demo-related tests**

Run any demo palette/drop tests plus `diagram-canvas-drop.test.ts`. Expected: green. If a demo test asserted `Document.ToolboxShapes`, retarget it to `$service(ToolboxRepository)` / `repo.ItemById`.

- [ ] **Step 6: Commit**

```bash
git add demo/demos/diagram/ src/compiler/symbol-table.ts
git commit -m "refactor(toolbox): migrate diagram demo palette onto ToolboxRepository"
```

---

### Task 10: Docs

**Files:**
- Modify: `docs/diagram-api-guide.md`, `docs/behaviors.md`, `current-backlog.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Update the API guide**

In `docs/diagram-api-guide.md`, replace every `ToolboxShape` / `ToolboxShapes` / `TOOLBOX_NODE_KIND_FORMAT` reference with the repository model: pages of `ToolboxItem`s in `ToolboxRepository` (a `Services` singleton), `ToolboxVisualPresenter` for tiles, `IToolboxVisualResolver` / `IToolboxDropFactory` registered per kind, `TOOLBOX_ITEM_FORMAT` as the single drag format, `ensureToolboxDefaults` for the built-in Shapes.

- [ ] **Step 2: Update behaviors + backlog**

In `docs/behaviors.md`, update the canvas-drop section to the item-id format + factory routing. In `current-backlog.md`, mark the toolbox-unification item (if present) and remove stale `ToolboxShape` references.

- [ ] **Step 3: Commit**

```bash
git add docs/ current-backlog.md
git commit -m "docs(toolbox): document ToolboxRepository, presenter, and item-format drop"
```

---

## Final verification

- [ ] Run the entire mural test suite (`npm test`). Expected: fully green.
- [ ] Run `npm run build` (compile:mu + build). Expected: clean; no unknown-symbol errors for `ToolboxVisualPresenter` / `VisualContext`; no dangling `ToolboxShape`.
- [ ] Grep the repo for `ToolboxShape`, `ToolboxShapes`, `TOOLBOX_NODE_KIND_FORMAT`. Expected: zero hits outside historical `docs/superpowers/specs|plans` archives.

## Self-review notes (author)

- **Spec coverage:** §1 data model → Tasks 1–3; §2 protocols → Task 1; §3 presenter → Task 4; §4 Shapes + first-init → Tasks 5–6; §5 drag/drop single format → Tasks 2 (format) + 7 (routing); §6 migration/hard-cutover → Tasks 8–9; testing → each task's tests + Final verification; docs → Task 10.
- **Type consistency:** `ToolboxVisualDescriptor{ResolverKey,Key}`, `VisualContext{Tile,Figure}`, `IToolboxVisualResolver.Resolve/AddChangedListener/RemoveChangedListener`, `IToolboxDropFactory.CreateDropped(ToolboxDropContext)`, `ToolboxItem(id,label,descriptor,factoryKey)` with plain `FactoryKey`, `ToolboxRepository.{EnsurePage,ItemById,RemovePage,Clear,Key}`, `ShapeVisualResolverKey`/`ShapeDropFactoryKey`, `ensureToolboxDefaults(services)` — all used consistently across tasks.
- **Known verify-in-place points** (flagged inline for the implementer, not placeholders): exact `.mu` `ContentPresenter`/`$service(...)`/`ControlTemplate` syntax (match a sibling template); whether `VisualContext` needs `ENUM_MEMBERS` registration for markup member access; the first `SHAPE_CATALOG` kind name; the framework's single-file test runner invocation.
